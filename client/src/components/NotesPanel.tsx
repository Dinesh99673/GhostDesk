import { useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { addToast, useGhostStore } from '../lib/store.js';

const REMOTE_ORIGIN = 'ghostdesk-remote';

/**
 * A textarea bound to a Y.Text ("notes"). Local edits become minimal
 * delete/insert operations; remote edits update the value while shifting the
 * local cursor by the incoming delta so simultaneous typing doesn't fight.
 */
export function NotesPanel() {
  const doc = useGhostStore((s) => s.notesDoc);
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!doc) return;
    const ytext = doc.getText('notes');
    setValue(ytext.toString());

    const observer = (event: Y.YTextEvent, transaction: Y.Transaction) => {
      const el = ref.current;
      const next = ytext.toString();
      if (transaction.origin === REMOTE_ORIGIN && el && document.activeElement === el) {
        let start = el.selectionStart;
        let end = el.selectionEnd;
        let index = 0;
        for (const op of event.delta) {
          if (op.retain !== undefined) {
            index += op.retain;
          } else if (op.insert !== undefined) {
            const len = typeof op.insert === 'string' ? op.insert.length : 1;
            if (index <= start) {
              start += len;
              end += len;
            } else if (index < end) {
              end += len;
            }
            index += len;
          } else if (op.delete !== undefined) {
            const len = op.delete;
            if (index < start) start -= Math.min(len, start - index);
            if (index < end) end -= Math.min(len, end - index);
          }
        }
        setValue(next);
        requestAnimationFrame(() => el.setSelectionRange(start, end));
      } else {
        setValue(next);
      }
    };
    ytext.observe(observer);
    return () => ytext.unobserve(observer);
  }, [doc]);

  const onChange = (nextValue: string) => {
    if (!doc) return;
    const ytext = doc.getText('notes');
    const previous = ytext.toString();

    let start = 0;
    while (start < previous.length && start < nextValue.length && previous[start] === nextValue[start]) {
      start++;
    }
    let prevEnd = previous.length;
    let nextEnd = nextValue.length;
    while (prevEnd > start && nextEnd > start && previous[prevEnd - 1] === nextValue[nextEnd - 1]) {
      prevEnd--;
      nextEnd--;
    }

    doc.transact(() => {
      if (prevEnd > start) ytext.delete(start, prevEnd - start);
      if (nextEnd > start) ytext.insert(start, nextValue.slice(start, nextEnd));
    });
    setValue(nextValue);
  };

  const downloadPdf = async () => {
    const text = doc?.getText('notes').toString() ?? '';
    if (!text.trim()) {
      addToast('Notes are empty — nothing to download.', 'info');
      return;
    }
    // Generated entirely in the browser; the notes never leave the room.
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const margin = 15;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    pdf.setFont('courier', 'bold');
    pdf.setFontSize(14);
    pdf.text('GhostDesk — Shared Notes', margin, margin);
    pdf.setFont('courier', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(120);
    pdf.text(new Date().toLocaleString(), margin, margin + 6);
    pdf.setTextColor(0);
    pdf.setFontSize(10);

    const lines = pdf.splitTextToSize(text, pageWidth - margin * 2) as string[];
    let y = margin + 16;
    for (const line of lines) {
      if (y > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(line, margin, y);
      y += 4.5;
    }
    pdf.save('ghostdesk-notes.pdf');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-2">
        <span className="text-xs text-zinc-500">
          Shared notes — everyone edits the same document in real time. Destroyed with the room.
        </span>
        <button
          onClick={() => void downloadPdf()}
          className="shrink-0 rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          ⬇ Download PDF
        </button>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Start typing shared notes…"
        spellCheck={false}
        className="min-h-0 flex-1 resize-none bg-transparent p-4 font-mono text-sm leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-700"
      />
    </div>
  );
}
