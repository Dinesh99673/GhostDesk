import { useRef } from 'react';
import { MAX_FILE_BYTES } from '@ghostdesk/shared';
import {
  acceptOffer,
  cancelReceive,
  cancelSend,
  offerFile,
  rejectOffer,
  withdrawOffer,
} from '../lib/fileTransfer.js';
import { formatBytes } from '../lib/format.js';
import { useGhostStore, type Transfer } from '../lib/store.js';

export function FilesPanel() {
  const fileOffers = useGhostStore((s) => s.fileOffers);
  const transfers = useGhostStore((s) => s.transfers);
  const participants = useGhostStore((s) => s.participants);
  const selfId = useGhostStore((s) => s.selfId);
  const inputRef = useRef<HTMLInputElement>(null);

  const offers = Object.values(fileOffers).sort((a, b) => b.offeredAt - a.offeredAt);
  const transferList = Object.values(transfers).reverse();
  // Hide the accept/dismiss card once a receive transfer exists for the offer.
  const receiveKeys = new Set(transferList.filter((t) => t.direction === 'receive').map((t) => t.fileId));

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3">
      <button
        onClick={() => inputRef.current?.click()}
        className="rounded-lg border-2 border-dashed border-zinc-700 py-5 text-sm text-zinc-400 transition hover:border-violet-600 hover:text-zinc-200"
      >
        📤 Share a file (up to {formatBytes(MAX_FILE_BYTES)})
        <div className="mt-1 text-xs text-zinc-600">Sent peer-to-peer — never stored on a server</div>
      </button>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) offerFile(file);
          e.target.value = '';
        }}
      />

      {offers.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Shared files</h3>
          <div className="space-y-2">
            {offers.map((offer) => {
              const own = offer.senderId === selfId;
              if (!own && receiveKeys.has(offer.fileId)) return null;
              const sender = participants[offer.senderId];
              return (
                <div key={offer.fileId} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                  <div className="truncate text-sm font-medium">{offer.name}</div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {formatBytes(offer.size)} · from {own ? 'you' : (sender?.name ?? 'someone who left')}
                  </div>
                  <div className="mt-2 flex gap-2">
                    {own ? (
                      <button
                        onClick={() => withdrawOffer(offer.fileId)}
                        className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs hover:bg-zinc-800"
                      >
                        Stop sharing
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => acceptOffer(offer)}
                          className="rounded-md bg-violet-600 px-2.5 py-1 text-xs font-semibold hover:bg-violet-500"
                        >
                          Download
                        </button>
                        <button
                          onClick={() => rejectOffer(offer)}
                          className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs hover:bg-zinc-800"
                        >
                          Dismiss
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {transferList.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Transfers</h3>
          <div className="space-y-2">
            {transferList.map((t) => (
              <TransferRow key={t.key} transfer={t} peerName={participants[t.peerId]?.name} />
            ))}
          </div>
        </div>
      )}

      {offers.length === 0 && transferList.length === 0 && (
        <p className="mt-8 text-center text-sm text-zinc-600">
          No files shared yet. Files go directly between browsers and vanish with the room.
        </p>
      )}
    </div>
  );
}

function TransferRow({ transfer: t, peerName }: { transfer: Transfer; peerName?: string }) {
  const pct = t.size > 0 ? Math.min(100, Math.round((t.bytes / t.size) * 100)) : 0;
  const active = t.status === 'active' || t.status === 'waiting';
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-sm">
          {t.direction === 'send' ? '↑' : '↓'} {t.name}
        </div>
        <StatusBadge transfer={t} />
      </div>
      <div className="mt-0.5 text-xs text-zinc-500">
        {t.direction === 'send' ? 'to' : 'from'} {peerName ?? 'a participant'} ·{' '}
        {formatBytes(t.bytes)} / {formatBytes(t.size)}
      </div>
      {active && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      {t.note && <div className="mt-1 text-xs text-zinc-500">{t.note}</div>}
      <div className="mt-2 flex gap-2">
        {active && (
          <button
            onClick={() => (t.direction === 'receive' ? cancelReceive(t.fileId) : cancelSend(t.fileId, t.peerId))}
            className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs hover:bg-zinc-800"
          >
            Cancel
          </button>
        )}
        {t.status === 'done' && t.url && (
          <a
            href={t.url}
            download={t.name}
            className="rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-semibold hover:bg-emerald-600"
          >
            Save file
          </a>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ transfer: t }: { transfer: Transfer }) {
  const styles: Record<Transfer['status'], [string, string]> = {
    waiting: ['Connecting…', 'text-zinc-400'],
    active: ['Transferring', 'text-violet-400'],
    done: ['Done', 'text-emerald-400'],
    cancelled: ['Cancelled', 'text-zinc-500'],
    error: ['Failed', 'text-rose-400'],
  };
  const [label, cls] = styles[t.status];
  return <span className={`shrink-0 text-xs font-medium ${cls}`}>{label}</span>;
}
