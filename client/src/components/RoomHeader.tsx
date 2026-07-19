import { useEffect, useState } from 'react';
import { formatDuration } from '../lib/format.js';
import { leaveRoom, renameSelf } from '../lib/roomController.js';
import { addToast, useGhostStore } from '../lib/store.js';

export function RoomHeader() {
  const participants = useGhostStore((s) => s.participants);
  const selfId = useGhostStore((s) => s.selfId);
  const count = Object.keys(participants).length;

  const copyLink = () => {
    void navigator.clipboard
      .writeText(window.location.href)
      .then(() => addToast('Invite link copied — anyone with it can join.', 'success'))
      .catch(() => addToast('Could not copy the link.', 'error'));
  };

  return (
    <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-zinc-800 px-3 py-2 sm:gap-4 sm:px-4 sm:py-2.5">
      <div className="flex items-center gap-2 font-bold">
        <span aria-hidden>👻</span>
        Ghost<span className="text-violet-400">Desk</span>
      </div>
      <WorkspaceAge />
      <div className="flex-1" />
      <ParticipantBar />
      <span className="hidden text-sm text-zinc-500 md:inline">
        {count} {count === 1 ? 'person' : 'people'}
      </span>
      <button
        onClick={copyLink}
        className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold hover:bg-violet-500 sm:px-3.5"
      >
        <span className="sm:hidden">Invite</span>
        <span className="hidden sm:inline">Copy invite link</span>
      </button>
      <button
        onClick={leaveRoom}
        title="Last one out destroys the room"
        className="rounded-lg border border-rose-800 px-3 py-1.5 text-sm font-semibold text-rose-400 hover:bg-rose-950 sm:px-3.5"
      >
        Leave
      </button>
      {selfId && <RenameSelf key={selfId} />}
    </header>
  );
}

function WorkspaceAge() {
  const createdAt = useGhostStore((s) => s.createdAt);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!createdAt) return null;
  return (
    <span className="rounded-full border border-zinc-800 px-2.5 py-0.5 text-xs text-zinc-500" title="Workspace age">
      ⏳ {formatDuration(now - createdAt)}
    </span>
  );
}

function ParticipantBar() {
  const participants = useGhostStore((s) => s.participants);
  const selfId = useGhostStore((s) => s.selfId);
  const list = Object.values(participants).sort((a, b) => a.joinedAt - b.joinedAt);
  return (
    <div className="flex -space-x-2">
      {list.map((p) => (
        <div
          key={p.participantId}
          title={p.participantId === selfId ? `${p.name} (you)` : p.name}
          className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-zinc-950 text-xs font-bold text-white"
          style={{ backgroundColor: p.color }}
        >
          {p.name.replace(/^Anonymous\s+/i, '').charAt(0).toUpperCase()}
        </div>
      ))}
    </div>
  );
}

/** Small inline rename control: shows your name, click to edit. */
function RenameSelf() {
  const selfId = useGhostStore((s) => s.selfId);
  const self = useGhostStore((s) => (s.selfId ? s.participants[s.selfId] : undefined));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  if (!selfId || !self) return null;

  const commit = () => {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== self.name) renameSelf(name);
  };

  return editing ? (
    <input
      autoFocus
      value={draft}
      maxLength={24}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
      className="w-36 rounded-lg border border-violet-600 bg-zinc-900 px-2 py-1 text-sm outline-none"
    />
  ) : (
    <button
      onClick={() => {
        setDraft(self.name);
        setEditing(true);
      }}
      title="Click to rename yourself"
      className="max-w-24 truncate rounded-lg border border-zinc-800 px-2.5 py-1 text-sm text-zinc-300 hover:border-zinc-600 sm:max-w-36"
    >
      {self.name} ✎
    </button>
  );
}
