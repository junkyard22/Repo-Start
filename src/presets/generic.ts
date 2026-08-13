import type { Preset } from './types.ts';

/**
 * A language agnostic repository: hygiene files, a place for source and a
 * place for tests. Deliberately offers no commands, so the generated
 * documents omit installation and testing instructions rather than inventing
 * them.
 */
export const genericPreset: Preset = {
  id: 'generic',
  label: 'Generic',

  requirements: () => [],

  commands: () => ({ install: [] }),

  gitignore: () => [
    {
      title: 'Build output',
      patterns: ['build/', 'dist/', 'out/'],
    },
  ],

  envExample: () => [],

  files: () => [],

  directories: () => ['src', 'tests'],

  ci: () => null,

  structure: () => [
    { path: 'src/', description: 'Project source.' },
    { path: 'tests/', description: 'Automated tests.' },
  ],
};
