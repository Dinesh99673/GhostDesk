import { useEffect, useRef, useState } from 'react';
import type { Compartment } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { runCode, RunError, type RunResult } from '../lib/codeRunner.js';
import { DEFAULT_LANGUAGE_ID, getLanguage, LANGUAGES } from '../lib/languages.js';
import { addToast, useGhostStore } from '../lib/store.js';

/**
 * Collaborative code editor: a CodeMirror instance bound to a Y.Text ("code")
 * in the shared room doc, so it syncs over the existing notes:update channel.
 * The selected language lives in the doc too ("codeMeta") and follows peers.
 * Running code is the one action that leaves the room — it calls the public
 * Compiler Explorer (godbolt.org) API — and the toolbar says so.
 */
export function CodeEditorPanel() {
  const doc = useGhostStore((s) => s.notesDoc);
  const [languageId, setLanguageId] = useState(DEFAULT_LANGUAGE_ID);
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langCompartmentRef = useRef<Compartment | null>(null);

  // Follow the synced language choice (also fires for our own writes).
  useEffect(() => {
    if (!doc) return;
    const meta = doc.getMap('codeMeta');
    const sync = () => setLanguageId((meta.get('language') as string | undefined) ?? DEFAULT_LANGUAGE_ID);
    sync();
    meta.observe(sync);
    return () => meta.unobserve(sync);
  }, [doc]);

  // Build the editor lazily — CodeMirror stays out of the base bundle.
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    let view: EditorView | undefined;
    void (async () => {
      const [{ basicSetup, EditorView: View }, { Compartment: Comp }, { yCollab }, { oneDark }] =
        await Promise.all([
          import('codemirror'),
          import('@codemirror/state'),
          import('y-codemirror.next'),
          import('@codemirror/theme-one-dark'),
        ]);
      const initial = getLanguage(doc.getMap('codeMeta').get('language') as string | undefined);
      const langExt = await initial.cm();
      if (cancelled || !hostRef.current) return;
      const compartment = new Comp();
      const ytext = doc.getText('code');
      view = new View({
        doc: ytext.toString(),
        extensions: [
          basicSetup,
          oneDark,
          compartment.of(langExt),
          // null awareness: no remote cursors (same as Notes today).
          yCollab(ytext, null),
          View.theme({
            '&': { height: '100%', fontSize: '13px' },
            '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
          }),
        ],
        parent: hostRef.current,
      });
      viewRef.current = view;
      langCompartmentRef.current = compartment;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      view?.destroy();
      viewRef.current = null;
      langCompartmentRef.current = null;
      setReady(false);
    };
  }, [doc]);

  // Swap highlighting when the language changes (locally or from a peer).
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void getLanguage(languageId)
      .cm()
      .then((ext) => {
        const view = viewRef.current;
        const compartment = langCompartmentRef.current;
        if (!cancelled && view && compartment) view.dispatch({ effects: compartment.reconfigure(ext) });
      });
    return () => {
      cancelled = true;
    };
  }, [languageId, ready]);

  const currentCode = () => viewRef.current?.state.doc.toString() ?? doc?.getText('code').toString() ?? '';

  const onSelectLanguage = (id: string) => {
    doc?.getMap('codeMeta').set('language', id);
  };

  const onRun = async () => {
    const code = currentCode();
    if (!code.trim()) {
      addToast('Nothing to run — the editor is empty.', 'info');
      return;
    }
    // The runner executes remotely with an empty stdin — warn when the code
    // clearly tries to read interactive input, since it will get nothing.
    if (/\b(input\s*\(|scanf\s*\(|cin\s*>>|new\s+Scanner|readline|fmt\.Scan|io::stdin|read_line)/.test(code)) {
      addToast('Heads up: code runs on a remote machine with no input — input()/scanf/cin will read an empty stdin.', 'info');
    }
    setRunning(true);
    setResult(null);
    try {
      setResult(await runCode(getLanguage(languageId), code));
    } catch (err) {
      addToast(err instanceof RunError ? err.message : 'Run failed unexpectedly.', 'error');
    } finally {
      setRunning(false);
    }
  };

  const onDownload = () => {
    const code = currentCode();
    if (!code.trim()) {
      addToast('Code is empty — nothing to download.', 'info');
      return;
    }
    const url = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `ghostdesk-code${getLanguage(languageId).ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-2">
        <span
          className="min-w-0 truncate text-xs text-zinc-500"
          title="Shared code — synced live, destroyed with the room. Run sends code to godbolt.org. It executes on a remote machine, so programs can't ask for user input — input()/scanf/cin read an empty stdin."
        >
          Shared code — synced live, destroyed with the room. Run sends code to godbolt.org · no user input (stdin is empty).
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <select
            value={languageId}
            onChange={(e) => onSelectLanguage(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 outline-none"
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => void onRun()}
            disabled={running || !getLanguage(languageId).runner}
            title={
              getLanguage(languageId).runner
                ? 'Run on the public Compiler Explorer API — executes remotely, so interactive input (input()/scanf/cin) is not supported'
                : `${getLanguage(languageId).label} can't run on the public runner — highlighting only`
            }
            className="rounded-md bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {running ? 'Running…' : '▶ Run'}
          </button>
          <button
            onClick={onDownload}
            className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            ⬇ Download
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div ref={hostRef} className="h-full [&_.cm-editor]:h-full" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
            Loading editor…
          </div>
        )}
      </div>

      {(running || result) && (
        <div className="max-h-[40%] shrink-0 overflow-y-auto border-t border-zinc-800 bg-zinc-950/60 px-4 py-3">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>
              Output
              {result?.exitCode !== null && result !== null && (
                <span
                  className={`ml-2 rounded px-1.5 py-0.5 font-mono ${
                    result.exitCode === 0 ? 'bg-emerald-900/50 text-emerald-300' : 'bg-rose-900/50 text-rose-300'
                  }`}
                >
                  exit {result.exitCode}
                </span>
              )}
            </span>
            <button onClick={() => setResult(null)} className="text-zinc-500 hover:text-zinc-300">
              ✕
            </button>
          </div>
          {running && <div className="mt-2 animate-pulse text-sm text-zinc-400">Running…</div>}
          {result && (
            <pre className="mt-2 whitespace-pre-wrap wrap-break-word font-mono text-xs leading-relaxed text-zinc-200">
              {result.compileOutput && <span className="text-amber-300">{result.compileOutput + '\n'}</span>}
              {result.stdout}
              {result.stderr && <span className="text-rose-300">{result.stderr}</span>}
              {!result.stdout && !result.stderr && !result.compileOutput && (
                <span className="text-zinc-500">(no output)</span>
              )}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
