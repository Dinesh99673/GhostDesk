import { useGhostStore } from '../lib/store.js';

const KIND_STYLES = {
  info: 'border-zinc-700 bg-zinc-900',
  success: 'border-emerald-700 bg-emerald-950',
  error: 'border-rose-700 bg-rose-950',
} as const;

export function Toasts() {
  const toasts = useGhostStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`fade-up rounded-lg border px-4 py-3 text-sm shadow-lg ${KIND_STYLES[t.kind]}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
