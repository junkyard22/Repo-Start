import type { FileEntry, ProjectConfig } from '../config/types.ts';
import { spdxId } from '../templates/license.ts';
import type { Preset } from './types.ts';

/** Node.js version the generated project targets, kept in sync with its CI. */
const NODE_VERSION = '24';

function packageJson(config: ProjectConfig): string {
  const license = spdxId(config.license);

  const manifest: Record<string, unknown> = {
    name: config.packageName,
    version: '0.1.0',
    description: config.description,
    type: 'module',
    main: 'dist/index.js',
    engines: { node: `>=${NODE_VERSION}` },
    scripts: {
      build: 'tsc',
      start: 'node dist/index.js',
      test: 'node --test',
      typecheck: 'tsc --noEmit',
    },
    devDependencies: {
      '@types/node': '^24.0.0',
      typescript: '^5.9.0',
    },
  };

  if (config.visibility === 'private') {
    // Guards against an accidental `npm publish` of a private repository.
    manifest['private'] = true;
  }
  if (license) {
    manifest['license'] = license;
  }

  return `${JSON.stringify(manifest, null, 2)}\n`;
}

const TSCONFIG = `{
  "compilerOptions": {
    "target": "es2023",
    "lib": ["es2023"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
`;

const INDEX_TS = `import { greet } from './greet.ts';

const name = process.argv[2] ?? 'world';

console.log(greet(name));
`;

const GREET_TS = `/** Build the greeting shown by the CLI entry point. */
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
`;

const GREET_TEST_TS = `import assert from 'node:assert/strict';
import { test } from 'node:test';

import { greet } from '../src/greet.ts';

test('greet addresses the given name', () => {
  assert.equal(greet('Ada'), 'Hello, Ada!');
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

export const nodeTypeScriptPreset: Preset = {
  id: 'node-ts',
  label: 'Node.js + TypeScript',

  requirements: () => [
    `Node.js ${NODE_VERSION} or newer (the test script runs TypeScript directly)`,
    'npm (ships with Node.js)',
  ],

  commands: () => ({
    install: ['npm install'],
    build: 'npm run build',
    test: 'npm test',
    start: 'npm start',
  }),

  gitignore: () => [
    {
      title: 'Dependencies',
      patterns: ['node_modules/'],
    },
    {
      title: 'Build output',
      patterns: ['dist/', '*.tsbuildinfo'],
    },
    {
      title: 'Test and coverage output',
      patterns: ['coverage/'],
    },
  ],

  envExample: () => ['LOG_LEVEL=info'],

  files: (config): FileEntry[] => [
    { path: 'package.json', contents: packageJson(config) },
    { path: 'tsconfig.json', contents: TSCONFIG },
    { path: 'src/index.ts', contents: INDEX_TS },
    { path: 'src/greet.ts', contents: GREET_TS },
    { path: 'tests/greet.test.ts', contents: GREET_TEST_TS },
  ],

  directories: () => [],

  ci: () => CI_WORKFLOW,

  structure: () => [
    { path: 'src/', description: 'TypeScript source. `src/index.ts` is the entry point.' },
    { path: 'tests/', description: 'Tests run by `node --test`.' },
    { path: 'dist/', description: 'Compiled output from `tsc`. Not committed.' },
  ],
};
