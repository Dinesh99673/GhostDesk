import type { Language } from './languages.js';

const GODBOLT_BASE = 'https://godbolt.org/api';
const RUN_TIMEOUT_MS = 30_000;

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  /** Compiler diagnostics when the build failed before execution. */
  compileOutput: string;
}

export class RunError extends Error {
  constructor(
    message: string,
    /** True when the user may simply retry in a moment (rate limit / network). */
    public readonly retryable = false
  ) {
    super(message);
  }
}

interface GodboltLine {
  text: string;
}

interface GodboltResponse {
  didExecute?: boolean;
  code?: number;
  stdout?: GodboltLine[];
  stderr?: GodboltLine[];
  buildResult?: { code?: number; stdout?: GodboltLine[]; stderr?: GodboltLine[] };
}

const joinLines = (lines?: GodboltLine[]) => (lines ?? []).map((l) => l.text).join('\n');

/**
 * Executes code on the Compiler Explorer (godbolt.org) public API.
 * The code leaves the browser for this one call — the UI discloses it.
 */
export async function runCode(language: Language, code: string): Promise<RunResult> {
  const runner = language.runner;
  if (!runner) throw new RunError(`${language.label} can't run on the public runner — highlighting only.`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RUN_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${GODBOLT_BASE}/compiler/${runner.compiler}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        source: code,
        lang: runner.lang,
        options: {
          userArguments: '',
          executeParameters: { args: [], stdin: '' },
          compilerOptions: { executorRequest: true },
          filters: { execute: true },
          tools: [],
          libraries: [],
        },
        allowStoreCodeDebug: false,
      }),
    });
  } catch {
    throw controller.signal.aborted
      ? new RunError('The run timed out after 30 seconds.')
      : new RunError('Could not reach the code runner.', true);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    throw new RunError('Rate limited by the public runner — try again in a moment.', true);
  }
  if (!res.ok) throw new RunError(`The code runner returned an error (HTTP ${res.status}).`);

  const data = (await res.json()) as GodboltResponse;
  const stdout = joinLines(data.stdout);
  let stderr = joinLines(data.stderr);
  let compileOutput = '';
  if (data.didExecute === false) {
    const build = joinLines(data.buildResult?.stderr);
    if (build && build !== stderr) compileOutput = build;
    if (!stderr && !compileOutput) stderr = 'Build failed.';
  }
  return {
    stdout,
    stderr,
    exitCode: typeof data.code === 'number' ? data.code : null,
    compileOutput,
  };
}
