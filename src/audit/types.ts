import type { CommandSet, LineEdit, ProjectType } from '../config/types.ts';
import type { IgnoreMatch } from '../utils/git.ts';

export type { LineEdit };

/** Package managers Repo Start can recognise from a lock file. */
export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

/**
 * Everything Repo Start learned by reading an existing repository.
 *
 * Inspection is read-only and happens exactly once. Every audit rule works
 * from this value instead of reaching back into the filesystem, which is what
 * makes the analysis deterministic and testable without a disk.
 */
export interface RepoState {
  /** Absolute path to the inspected directory. */
  root: string;
  /** Directory name, used in output. */
  name: string;
  /** The closest matching preset, conservatively chosen. */
  detectedType: ProjectType;
  /** True when detection had to fall back rather than recognise the project. */
  detectionIsConfident: boolean;
  packageManager?: PackageManager;
  isGitRepository: boolean;
  hasTypeScript: boolean;
  hasReact: boolean;
  /**
   * The hygiene and manifest paths Repo Start looked for and found. This is a
   * targeted lookup, not a full inventory of the repository.
   */
  files: Set<string>;
  /** Commands the repository genuinely supports, derived from its own manifest. */
  commands: CommandSet;
  /** `scripts` from package.json, when there is one. */
  packageScripts?: Record<string, string>;
  /** Repository file an Actions setup step can use to select a compatible runtime. */
  runtimeVersionFile?: string;
  /** `name` and `description` from package.json or pyproject.toml. */
  projectName?: string;
  projectDescription?: string;
  /** Contents of the documents the audit reads, keyed by relative path. */
  documents: Map<string, string>;
  /** Relative paths of workflow files under .github/workflows. */
  workflows: string[];
  /**
   * Git's own verdict on .env.example, asked once during inspection so the
   * analysis stays a pure function of this state. Absent when there is no
   * .env.example or no git repository to ask.
   */
  envExampleIgnore?: {
    ignored: boolean;
    tracked: boolean;
    /** The rule that matched, when git reported one. */
    match: IgnoreMatch | null;
  };
}

export type AuditCode =
  | 'missing-gitignore'
  | 'missing-gitattributes'
  | 'missing-readme'
  | 'missing-env-example'
  | 'missing-agents'
  | 'missing-contributing'
  | 'missing-changelog'
  | 'missing-docs'
  | 'missing-issue-template'
  | 'missing-pr-template'
  | 'missing-ci'
  | 'env-example-ignored'
  | 'doc-command-mismatch'
  | 'doc-command-missing'
  | 'ci-command-missing'
  | 'ci-command-ok'
  | 'detection-ambiguous'
  | 'check-skipped';

export interface AuditItem {
  code: AuditCode;
  /** The file this item is about, when it is about a file. */
  path?: string;
  label: string;
}

export interface AuditFix {
  file: string;
  /** One line describing the change, e.g. "npm run test → npm test". */
  description: string;
  edits: LineEdit[];
}

export interface AuditIssue {
  code: AuditCode;
  /** Human readable one-liner. */
  message: string;
  /** Extra context, printed indented under the message. */
  details: string[];
  file?: string;
  /** Present only when Repo Start can correct this precisely and safely. */
  fix?: AuditFix;
}

/**
 * The result of analysing a RepoState.
 *
 * `issues` are things that are wrong, `warnings` are things worth knowing
 * (including checks that could not run), and `verified` records checks that
 * actively passed, so the report can show what is already correct.
 */
export interface RepoAudit {
  state: RepoState;
  present: AuditItem[];
  missing: AuditItem[];
  issues: AuditIssue[];
  warnings: AuditIssue[];
  verified: AuditItem[];
}

/** Something Repo Start offers to do, which the user accepts or declines. */
export interface Proposal {
  id: string;
  /** The question shown in interactive mode. */
  question: string;
  kind: 'create' | 'fix';
  /** Relative path created, or the file a fix edits. */
  path: string;
}
