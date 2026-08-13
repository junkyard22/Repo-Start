import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { pathExists } from './filesystem.ts';

export interface GitInitResult {
  initialized: boolean;
  /** A short note for the summary output, or null when there is nothing to say. */
  note: string | null;
}

function run(command: string, args: string[], cwd?: string): boolean {
  const result = spawnSync(command, args, { cwd, stdio: 'ignore' });

  return result.error === undefined && result.status === 0;
}

/** Read `git config user.name`, used as the default license copyright holder. */
export function gitUserName(): string | null {
  const result = spawnSync('git', ['config', '--get', 'user.name'], { encoding: 'utf8' });

  if (result.error || result.status !== 0) {
    return null;
  }

  const name = result.stdout.trim();

  return name.length > 0 ? name : null;
}

/** Where a `.gitignore` rule that matched a path came from. */
export interface IgnoreMatch {
  /** The file holding the rule, e.g. ".gitignore". */
  source: string;
  /** 1-based line number of the rule inside that file. */
  line: number;
  /** The rule itself, e.g. ".env*". */
  pattern: string;
}

/** True when the directory is inside a git working tree. */
export function isGitRepository(directory: string): boolean {
  const result = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: directory,
    encoding: 'utf8',
  });

  return !result.error && result.status === 0 && result.stdout.trim() === 'true';
}

/**
 * Ask git whether it ignores a path, and which rule decided that.
 *
 * This deliberately shells out rather than reimplementing gitignore
 * semantics, which also means tracked files are reported correctly: git does
 * not consider a tracked file ignored, and neither do we.
 */
export function checkIgnore(directory: string, relativePath: string): IgnoreMatch | null {
  const result = spawnSync('git', ['check-ignore', '-v', '--', relativePath], {
    cwd: directory,
    encoding: 'utf8',
  });

  // Exit status 1 simply means "not ignored".
  if (result.error || result.status !== 0 || !result.stdout) {
    return null;
  }

  const firstLine = result.stdout.split('\n')[0] ?? '';
  const [describedRule = ''] = firstLine.split('\t');
  const parsed = /^(.+):(\d+):(.*)$/.exec(describedRule);

  if (!parsed) {
    return null;
  }

  const pattern = parsed[3] ?? '';

  // A negated rule is still a match, and check-ignore still exits 0 for it,
  // but it decides the opposite: the path is explicitly not ignored. Without
  // this, a .gitignore containing `!.env.example` would be read as ignoring
  // the very file it exists to keep.
  if (pattern.startsWith('!')) {
    return null;
  }

  return {
    source: parsed[1] ?? '',
    line: Number.parseInt(parsed[2] ?? '0', 10),
    pattern,
  };
}

/** True when git has the path in its index. */
export function isTracked(directory: string, relativePath: string): boolean {
  const result = spawnSync('git', ['ls-files', '--error-unmatch', '--', relativePath], {
    cwd: directory,
    stdio: 'ignore',
  });

  return !result.error && result.status === 0;
}

/**
 * Initialize a git repository in the target directory.
 *
 * Never touches an existing repository and never creates a commit; the first
 * commit stays the user's decision.
 */
export function initializeGitRepository(targetDir: string): GitInitResult {
  if (pathExists(path.join(targetDir, '.git'))) {
    return { initialized: false, note: 'Git repository already existed, left untouched.' };
  }

  // `-b main` needs git 2.28+; fall back for older installations.
  const initialized =
    run('git', ['init', '-b', 'main'], targetDir) || run('git', ['init'], targetDir);

  if (!initialized) {
    return { initialized: false, note: 'Could not run git init. Is git installed and on PATH?' };
  }

  return { initialized: true, note: null };
}
