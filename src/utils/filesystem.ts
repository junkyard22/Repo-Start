import { existsSync, lstatSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { RepoStartError } from '../config/validate.ts';

/** Resolve the target directory the user asked for, relative to the cwd. */
export function resolveTarget(cwd: string, directory: string): string {
  return path.resolve(cwd, directory);
}

/**
 * Refuse to treat obviously dangerous locations as a project directory.
 *
 * This runs before any collision checking, so even `--force` cannot point
 * Repo Start at a filesystem root or a home directory.
 */
export function assertSafeTarget(targetDir: string): void {
  const resolved = path.resolve(targetDir);
  const { root } = path.parse(resolved);

  if (resolved === root) {
    throw new RepoStartError('Refusing to generate a project into the filesystem root.');
  }

  const home = os.homedir();

  if (home && path.resolve(home) === resolved) {
    throw new RepoStartError(
      'Refusing to generate a project directly into your home directory.',
      ['Create or choose a subdirectory instead, for example: repo-start my-project'],
    );
  }

  assertNoLinkedComponents(resolved, resolved);
}

/**
 * Refuse existing symbolic links and Windows junctions at or below the target.
 *
 * A lexical path may look contained while the filesystem redirects one of its
 * components elsewhere. Checking every existing component keeps writes from
 * following a link outside the directory the user selected.
 */
function assertNoLinkedComponents(base: string, destination: string): void {
  const relative = path.relative(base, destination);
  const segments = relative.length === 0 ? [] : relative.split(path.sep);
  let current = base;

  for (const segment of ['', ...segments]) {
    if (segment.length > 0) {
      current = path.join(current, segment);
    }

    try {
      const stats = lstatSync(current);

      if (stats.isSymbolicLink()) {
        throw new RepoStartError(
          `Refusing to write through a symbolic link or junction: ${current}`,
        );
      }
      if (current === destination && stats.isFile() && stats.nlink > 1) {
        throw new RepoStartError(`Refusing to overwrite or edit a hard-linked file: ${current}`);
      }
    } catch (error) {
      if (error instanceof RepoStartError) {
        throw error;
      }

      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }

      throw new RepoStartError(`Unable to verify that this path is safe to write: ${current}`, [
        error instanceof Error ? error.message : String(error),
      ]);
    }
  }
}

/**
 * Join a relative path onto the target directory and verify it cannot escape.
 */
export function resolveInside(targetDir: string, relativePath: string): string {
  const base = path.resolve(targetDir);
  const resolved = path.resolve(base, relativePath);

  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new RepoStartError(`Refusing to write outside the target directory: ${relativePath}`);
  }

  assertNoLinkedComponents(base, resolved);

  return resolved;
}

export function pathExists(target: string): boolean {
  return existsSync(target);
}

export function isDirectory(target: string): boolean {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
}

/** The directory names that must exist for the given relative file paths. */
export function requiredDirectories(filePaths: string[], extraDirectories: string[]): string[] {
  const directories = new Set<string>();

  const add = (relativeDir: string): void => {
    const normalized = relativeDir.replace(/\\/g, '/').replace(/\/+$/, '');

    if (normalized.length === 0 || normalized === '.') {
      return;
    }

    const segments = normalized.split('/');

    for (let index = 0; index < segments.length; index += 1) {
      directories.add(segments.slice(0, index + 1).join('/'));
    }
  };

  for (const filePath of filePaths) {
    const lastSlash = filePath.lastIndexOf('/');

    if (lastSlash > 0) {
      add(filePath.slice(0, lastSlash));
    }
  }
  for (const directory of extraDirectories) {
    add(directory);
  }

  return [...directories].sort((a, b) => a.localeCompare(b, 'en'));
}
