import type { FileEntry, ProjectConfig } from '../config/types.ts';
import { spdxId } from '../templates/license.ts';
import type { Preset } from './types.ts';

/**
 * A deliberately small React starter.
 *
 * Repo Start does repository hygiene, not framework generation. This preset
 * writes the handful of files Vite expects and then gets out of the way; the
 * framework itself arrives with `npm install`.
 */

/** Node.js version used by the generated CI workflow. */
const NODE_VERSION = '22';

function packageJson(config: ProjectConfig): string {
  const license = spdxId(config.license);

  const manifest: Record<string, unknown> = {
    name: config.packageName,
    version: '0.1.0',
    description: config.description,
    // An application, not a package: never publish it by accident.
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'tsc --noEmit && vite build',
      preview: 'vite preview',
      test: 'vitest run',
      typecheck: 'tsc --noEmit',
    },
    dependencies: {
      react: '^19.2.0',
      'react-dom': '^19.2.0',
    },
    devDependencies: {
      '@types/react': '^19.2.0',
      '@types/react-dom': '^19.2.0',
      '@vitejs/plugin-react': '^5.0.0',
      typescript: '^5.9.0',
      vite: '^7.0.0',
      vitest: '^3.2.0',
    },
  };

  if (license) {
    manifest['license'] = license;
  }

  return `${JSON.stringify(manifest, null, 2)}\n`;
}

const TSCONFIG = `{
  "compilerOptions": {
    "target": "es2022",
    "lib": ["es2023", "dom", "dom.iterable"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src", "tests", "vite.config.ts"]
}
`;

const VITE_CONFIG = `import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
});
`;

function indexHtml(config: ProjectConfig): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${config.name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

const MAIN_TSX = `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './index.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element #root was not found in index.html.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;

function appTsx(config: ProjectConfig): string {
  return `import { greeting } from './lib/greeting';

export function App() {
  return (
    <main className="app">
      <h1>{greeting('${config.name.replace(/'/g, "\\'")}')}</h1>
      <p>
        Edit <code>src/App.tsx</code> and save to see the change.
      </p>
    </main>
  );
}
`;
}

const INDEX_CSS = `:root {
  color-scheme: light dark;
  font-family: system-ui, sans-serif;
  line-height: 1.5;
}

body {
  margin: 0;
}

.app {
  margin: 0 auto;
  max-width: 40rem;
  padding: 2rem 1rem;
}
`;

const GREETING_TS = `/** Build the heading shown by the app. */
export function greeting(name: string): string {
  return \`Hello, \${name}!\`;
}
`;

const GREETING_TEST_TS = `import { expect, test } from 'vitest';

import { greeting } from '../src/lib/greeting';

test('greeting addresses the given name', () => {
  expect(greeting('Ada')).toBe('Hello, Ada!');
});
`;

const CI_WORKFLOW = `name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v5
        with:
          node-version: '${NODE_VERSION}'

      # Switch to \`npm ci\` once package-lock.json is committed.
      - run: npm install

      - run: npm run build

      - run: npm test
`;

export const reactTypeScriptPreset: Preset = {
  id: 'react-ts',
  label: 'React + TypeScript',

  requirements: () => [
    `Node.js ${NODE_VERSION} or newer`,
    'npm (ships with Node.js)',
  ],

  commands: () => ({
    install: ['npm install'],
    dev: 'npm run dev',
    build: 'npm run build',
    test: 'npm test',
  }),

  gitignore: () => [
    {
      title: 'Dependencies',
      patterns: ['node_modules/'],
    },
    {
      title: 'Build output',
      patterns: ['dist/', 'dist-ssr/', '*.tsbuildinfo'],
    },
    {
      title: 'Test and coverage output',
      patterns: ['coverage/'],
    },
  ],

  // Vite only exposes variables prefixed with VITE_ to client code.
  envExample: () => ['VITE_API_URL=http://localhost:3000'],

  files: (config): FileEntry[] => [
    { path: 'package.json', contents: packageJson(config) },
    { path: 'tsconfig.json', contents: TSCONFIG },
    { path: 'vite.config.ts', contents: VITE_CONFIG },
    { path: 'index.html', contents: indexHtml(config) },
    { path: 'src/main.tsx', contents: MAIN_TSX },
    { path: 'src/App.tsx', contents: appTsx(config) },
    { path: 'src/index.css', contents: INDEX_CSS },
    { path: 'src/lib/greeting.ts', contents: GREETING_TS },
    { path: 'tests/greeting.test.ts', contents: GREETING_TEST_TS },
  ],

  directories: () => [],

  ci: () => CI_WORKFLOW,

  structure: () => [
    { path: 'src/', description: 'Application source. `src/main.tsx` mounts the app.' },
    { path: 'tests/', description: 'Tests run by Vitest.' },
    { path: 'index.html', description: 'Vite entry document.' },
  ],
};
