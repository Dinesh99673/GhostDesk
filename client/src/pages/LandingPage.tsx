import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom } from '../lib/roomController.js';
import { addToast } from '../lib/store.js';

const FEATURES = [
  ['🎥', 'Video & audio calls', 'Encrypted peer-to-peer WebRTC — media never touches the server.'],
  ['💬', 'Chat & notes', 'Real-time chat and conflict-free collaborative notes.'],
  ['🖊️', 'Whiteboard', 'Sketch together on a shared Excalidraw canvas.'],
  ['📁', 'File sharing', 'Files transfer directly between browsers. Up to 100 MB.'],
] as const;

const PRINCIPLES = [
  'No signup — ever',
  'Anonymous by default',
  'No history, no logs',
  'Self-destructs when empty',
] as const;

export function LandingPage() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const onCreate = () => {
    setCreating(true);
    createRoom((roomId, error) => {
      setCreating(false);
      if (roomId) {
        navigate(`/r/${roomId}`);
      } else if (error === 'at_capacity') {
        addToast('GhostDesk is at capacity right now — please try again in a few minutes.', 'error');
      } else {
        addToast('Could not create a workspace. Please try again.', 'error');
      }
    });
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-16">
      <div className="ghost-float text-7xl" aria-hidden>
        👻
      </div>
      <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
        Ghost<span className="text-violet-400">Desk</span>
      </h1>
      <p className="mt-3 max-w-md text-center text-lg text-zinc-400">
        A disposable workspace for anonymous collaboration. When the last person leaves,
        everything is permanently destroyed.
      </p>

      <button
        onClick={onCreate}
        disabled={creating}
        className="mt-8 rounded-xl bg-violet-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:bg-violet-500 disabled:opacity-50"
      >
        {creating ? 'Summoning…' : 'Create a workspace'}
      </button>
      <p className="mt-3 text-sm text-zinc-500">No account. No traces. Just a link.</p>

      <div className="mt-14 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {FEATURES.map(([icon, title, blurb]) => (
          <div key={title} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
            <div className="text-2xl">{icon}</div>
            <div className="mt-2 font-semibold">{title}</div>
            <div className="mt-1 text-sm text-zinc-400">{blurb}</div>
          </div>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-zinc-500">
        {PRINCIPLES.map((p) => (
          <span key={p} className="flex items-center gap-1.5">
            <span className="text-emerald-400">✓</span> {p}
          </span>
        ))}
      </div>

      <p className="mt-14 text-sm italic text-zinc-600">“Collaborate freely. Leave nothing behind.”</p>
    </div>
  );
}
