import { useEffect, useRef, useState } from 'react';
import { MAX_CHAT_MESSAGE_CHARS } from '@ghostdesk/shared';
import { formatClock } from '../lib/format.js';
import { sendChat, sendTyping } from '../lib/roomController.js';
import { useGhostStore } from '../lib/store.js';

export function ChatPanel() {
  const chat = useGhostStore((s) => s.chat);
  const selfId = useGhostStore((s) => s.selfId);
  const typingIds = useGhostStore((s) => s.typingIds);
  const participants = useGhostStore((s) => s.participants);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingSentRef = useRef(false);
  const typingResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat.length]);

  const stopTyping = () => {
    if (typingSentRef.current) {
      typingSentRef.current = false;
      sendTyping(false);
    }
    if (typingResetRef.current) clearTimeout(typingResetRef.current);
  };

  const onInput = (value: string) => {
    setDraft(value);
    if (!typingSentRef.current && value.length > 0) {
      typingSentRef.current = true;
      sendTyping(true);
    }
    if (typingResetRef.current) clearTimeout(typingResetRef.current);
    typingResetRef.current = setTimeout(stopTyping, 2000);
  };

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    sendChat(text);
    setDraft('');
    stopTyping();
  };

  const typingNames = typingIds
    .filter((id) => id !== selfId)
    .map((id) => participants[id]?.name)
    .filter(Boolean);

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {chat.length === 0 && (
          <p className="mt-6 text-center text-sm text-zinc-600">
            No messages yet. Everything typed here disappears with the room.
          </p>
        )}
        {chat.map((m) => (
          <div key={m.id} className="text-sm">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold" style={{ color: m.color }}>
                {m.name}
                {m.participantId === selfId && <span className="ml-1 font-normal text-zinc-500">(you)</span>}
              </span>
              <span className="text-[10px] text-zinc-600">{formatClock(m.sentAt)}</span>
            </div>
            <div className="whitespace-pre-wrap break-words text-zinc-200">{m.text}</div>
          </div>
        ))}
      </div>
      <div className="h-5 px-3 text-xs italic text-zinc-500">
        {typingNames.length > 0 &&
          `${typingNames.join(', ')} ${typingNames.length === 1 ? 'is' : 'are'} typing…`}
      </div>
      <div className="flex gap-2 border-t border-zinc-800 p-3">
        <input
          value={draft}
          maxLength={MAX_CHAT_MESSAGE_CHARS}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Say something…"
          className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-base outline-none focus:border-violet-600 sm:text-sm"
        />
        <button
          onClick={submit}
          className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold hover:bg-violet-500"
        >
          Send
        </button>
      </div>
    </div>
  );
}
