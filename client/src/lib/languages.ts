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
  /** Starter snippet seeded into an empty editor when this language is picked. */
  hello: string;
  /** Lazily loads the CodeMirror highlighting extension. */
  cm: () => Promise<Extension>;
}

const JAVASCRIPT: Language = {
  id: 'javascript',
  label: 'JavaScript',
  ext: '.js',
  // Bare V8 (d8): console.log works, Node APIs (require, fs, …) do not.
  runner: { lang: 'javascript', compiler: 'v8113' },
  hello: 'console.log("Hello, World!");\n',
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
    hello: 'const message: string = "Hello, World!";\nconsole.log(message);\n',
    cm: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ typescript: true })),
  },
  {
    id: 'python',
    label: 'Python',
    ext: '.py',
    runner: { lang: 'python', compiler: 'python312' },
    hello: 'print("Hello, World!")\n',
    cm: () => import('@codemirror/lang-python').then((m) => m.python()),
  },
  {
    id: 'c',
    label: 'C',
    ext: '.c',
    runner: { lang: 'c', compiler: 'cg151' },
    hello: '#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}\n',
    cm: () => import('@codemirror/lang-cpp').then((m) => m.cpp()),
  },
  {
    id: 'cpp',
    label: 'C++',
    ext: '.cpp',
    runner: { lang: 'c++', compiler: 'g132' },
    hello: '#include <iostream>\n\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}\n',
    cm: () => import('@codemirror/lang-cpp').then((m) => m.cpp()),
  },
  {
    id: 'java',
    label: 'Java',
    ext: '.java',
    // Note: godbolt compiles the source as a scratch file — use `class Main`, not `public class`.
    runner: { lang: 'java', compiler: 'java2501' },
    hello: 'class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}\n',
    cm: () => import('@codemirror/lang-java').then((m) => m.java()),
  },
  {
    id: 'go',
    label: 'Go',
    ext: '.go',
    runner: { lang: 'go', compiler: 'gl12413' },
    hello: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello, World!")\n}\n',
    cm: () => import('@codemirror/lang-go').then((m) => m.go()),
  },
  {
    id: 'rust',
    label: 'Rust',
    ext: '.rs',
    runner: { lang: 'rust', compiler: 'r1820' },
    hello: 'fn main() {\n    println!("Hello, World!");\n}\n',
    cm: () => import('@codemirror/lang-rust').then((m) => m.rust()),
  },
];

export const DEFAULT_LANGUAGE_ID = JAVASCRIPT.id;

export function getLanguage(id: string | undefined): Language {
  return LANGUAGES.find((l) => l.id === id) ?? JAVASCRIPT;
}
