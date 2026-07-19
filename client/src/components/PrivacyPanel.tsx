import { useEffect, useState } from 'react';
import { GRACE_PERIOD_MS } from '@ghostdesk/shared';
import { formatDuration } from '../lib/format.js';
import { useGhostStore } from '../lib/store.js';

const SIGNALS = [
  ['No account required', 'You joined without ever telling us who you are.'],
  ['Media encrypted', 'Video, audio and files use WebRTC encryption (DTLS-SRTP), peer to peer.'],
  ['No recordings', 'Nothing in this room is recorded or logged — by design there is nowhere to store it.'],
  ['No server-side file storage', 'Files move browser-to-browser and never touch a server disk.'],
  ['Auto-destroy enabled', `When the last person leaves, everything is erased after a ${GRACE_PERIOD_MS / 1000}-second grace period.`],
  ['Code runs leave the room', 'One exception: clicking ▶ Run in the code editor sends that code to the public Compiler Explorer API (godbolt.org) for execution. Everything else stays here.'],
] as const;

/** The trust-signal dashboard — GhostDesk's privacy story, live. */
export function PrivacyPanel() {
  const createdAt = useGhostStore((s) => s.createdAt);
  const participants = useGhostStore((s) => s.participants);
  const count = Object.keys(participants).length;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="rounded-xl border border-violet-900/60 bg-violet-950/30 p-4 text-center">
        <div className="text-3xl" aria-hidden>
          🛡️
        </div>
        <div className="mt-1 font-semibold">This workspace is disposable</div>
        <div className="mt-2 flex justify-center gap-6 text-sm text-zinc-400">
          <div>
            <div className="text-lg font-bold text-zinc-100">{createdAt ? formatDuration(now - createdAt) : '—'}</div>
            <div className="text-xs">alive for</div>
          </div>
          <div>
            <div className="text-lg font-bold text-zinc-100">{count}</div>
            <div className="text-xs">{count === 1 ? 'participant' : 'participants'}</div>
          </div>
        </div>
      </div>

      <ul className="mt-4 space-y-3">
        {SIGNALS.map(([title, detail]) => (
          <li key={title} className="flex gap-3">
            <span className="mt-0.5 text-emerald-400">✓</span>
            <div>
              <div className="text-sm font-medium">{title}</div>
              <div className="text-xs text-zinc-500">{detail}</div>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-5 border-t border-zinc-800 pt-4 text-center text-xs italic text-zinc-600">
        “Collaborate freely. Leave nothing behind.”
      </p>
    </div>
  );
}
