/**
 * The typed configuration every generator works from.
 *
 * Nothing downstream of this file knows or cares whether the values came from
 * command line flags, interactive prompts, or (one day) a model. That is the
 * whole point: the generator is a pure function of ProjectConfig.
 */

export type ProjectType = 'generic' | 'node-ts' | 'python' | 'react-ts';

export const PROJECT_TYPES: readonly ProjectType[] = [
  'generic',
  'node-ts',
  'python',
  'react-ts',
];

export type LicenseId = 'mit' | 'apache-2.0' | 'gpl-3.0' | 'none';

export const LICENSE_IDS: readonly LicenseId[] = [
  'mit',
  'apache-2.0',
  'gpl-3.0',
  'none',
];

export type Visibility = 'public' | 'private';

export interface ProjectConfig {
  /** Human readable name, e.g. "My Project". Used in prose. */
  name: string;
  /** Slug derived from the name, e.g. "my-project". Used in manifests. */
  packageName: string;
  description: string;
  type: ProjectType;
  visibility: Visibility;
  initializeGit: boolean;
  license: LicenseId;
  /** Copyright holder for the LICENSE file. */
  author: string;
  /** Copyright year. Injectable so tests stay deterministic. */
  year: number;
  includeEnvExample: boolean;
  includeAgents: boolean;
  includeContributing: boolean;
  includeChangelog: boolean;
  includeDocs: boolean;
  includeCi: boolean;
  includeIssueTemplate: boolean;
  includePullRequestTemplate: boolean;
}

/**
 * The commands a generated project actually supports.
 *
 * This is the single source of truth for every command that appears in the
 * README, AGENTS.md, CONTRIBUTING.md, the CI workflow and the final summary.
 * If a preset cannot offer a command it leaves it undefined, and the documents
 * omit that section rather than inventing something that does not work.
 */
export interface CommandSet {
  /** Shell lines a contributor runs once, in order. */
  install: string[];
  build?: string;
  test?: string;
  dev?: string;
  start?: string;
}

export interface FileEntry {
  /** Path relative to the target directory, always using forward slashes. */
  path: string;
  contents: string;
}

export interface ProjectPlan {
  config: ProjectConfig;
  commands: CommandSet;
  files: FileEntry[];
  /** Directories that are created even though they hold no generated file. */
  directories: string[];
  /** Things the user should know, e.g. an option that could not be honoured. */
  notes: string[];
}

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  generic: 'Generic',
  'node-ts': 'Node.js + TypeScript',
  python: 'Python',
  'react-ts': 'React + TypeScript',
};

export const LICENSE_LABELS: Record<LicenseId, string> = {
  mit: 'MIT',
  'apache-2.0': 'Apache-2.0',
  'gpl-3.0': 'GPL-3.0',
  none: 'None',
};
