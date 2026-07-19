import type { Extension } from '@codemirror/state';

/** How to execute a language on the Compiler Explorer (godbolt.org) public API. */
export interface Runner {
  /** Godbolt language id. */
  lang: string;
  /** Pinned compiler id known to support execution. */
  compiler: string;
}

export interface Language {
  id: string;
  label: string;
  /** File extension used for downloads, including the dot. */
  ext: string;
  /** null = highlight-only; the public runner has no executor for it. */
  runner: Runner | null;
  /** Lazily loads the CodeMirror highlighting extension. */
  cm: () => Promise<Extension>;
}

const JAVASCRIPT: Language = {
  id: 'javascript',
  label: 'JavaScript',
  ext: '.js',
  // Bare V8 (d8): console.log works, Node APIs (require, fs, …) do not.
  runner: { lang: 'javascript', compiler: 'v8113' },
  cm: () => import('@codemirror/lang-javascript').then((m) => m.javascript()),
};

/** Single source of truth for the code editor: highlighting, running, downloading. */
export const LANGUAGES: Language[] = [
  JAVASCRIPT,
  {
    id: 'typescript',
    label: 'TypeScript',
    ext: '.ts',
    runner: null, // godbolt has no standard tsc+node executor
    cm: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ typescript: true })),
  },
  {
    id: 'python',
    label: 'Python',
    ext: '.py',
    runner: { lang: 'python', compiler: 'python312' },
    cm: () => import('@codemirror/lang-python').then((m) => m.python()),
  },
  {
    id: 'c',
    label: 'C',
    ext: '.c',
    runner: { lang: 'c', compiler: 'cg151' },
    cm: () => import('@codemirror/lang-cpp').then((m) => m.cpp()),
  },
  {
    id: 'cpp',
    label: 'C++',
    ext: '.cpp',
    runner: { lang: 'c++', compiler: 'g132' },
    cm: () => import('@codemirror/lang-cpp').then((m) => m.cpp()),
  },
  {
    id: 'java',
    label: 'Java',
    ext: '.java',
    // Note: godbolt compiles the source as a scratch file — use `class Main`, not `public class`.
    runner: { lang: 'java', compiler: 'java2501' },
    cm: () => import('@codemirror/lang-java').then((m) => m.java()),
  },
  {
    id: 'go',
    label: 'Go',
    ext: '.go',
    runner: { lang: 'go', compiler: 'gl12413' },
    cm: () => import('@codemirror/lang-go').then((m) => m.go()),
  },
  {
    id: 'rust',
    label: 'Rust',
    ext: '.rs',
    runner: { lang: 'rust', compiler: 'r1820' },
    cm: () => import('@codemirror/lang-rust').then((m) => m.rust()),
  },
];

export const DEFAULT_LANGUAGE_ID = JAVASCRIPT.id;

export function getLanguage(id: string | undefined): Language {
  return LANGUAGES.find((l) => l.id === id) ?? JAVASCRIPT;
}
