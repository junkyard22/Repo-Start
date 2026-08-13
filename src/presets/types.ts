import type { CommandSet, FileEntry, ProjectConfig, ProjectType } from '../config/types.ts';

export interface GitignoreSection {
  title: string;
  patterns: string[];
}

export interface StructureNote {
  /** Path relative to the repository root, e.g. "src/". */
  path: string;
  description: string;
}

/**
 * A preset is the only place that knows anything language specific.
 *
 * Adding a new starter profile means adding one file that implements this
 * interface and registering it in ./index.ts. Nothing else changes.
 */
export interface Preset {
  id: ProjectType;
  label: string;
  /** Bullets for the README "Requirements" section. Empty omits the section. */
  requirements(config: ProjectConfig): string[];
  /** The single source of truth for every command in every generated document. */
  commands(config: ProjectConfig): CommandSet;
  /** Ignore rules on top of the shared base set. */
  gitignore(config: ProjectConfig): GitignoreSection[];
  /** Extra .env.example entries on top of the shared base. */
  envExample(config: ProjectConfig): string[];
  /** Manifests, starter source and starter tests. */
  files(config: ProjectConfig): FileEntry[];
  /** Directories that should exist even when the preset writes no file into them. */
  directories(config: ProjectConfig): string[];
  /**
   * The GitHub Actions workflow for this preset, or null when the preset has
   * no legitimate build or test command to run. Returning null is preferred
   * over emitting a workflow full of commands that do not exist.
   */
  ci(config: ProjectConfig): string | null;
  /** "What lives where" notes used by README and AGENTS.md. */
  structure(config: ProjectConfig): StructureNote[];
}
