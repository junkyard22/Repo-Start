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
