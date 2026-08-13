import { mkdir, writeFile } from 'node:fs/promises';

import type { ProjectPlan } from '../config/types.ts';
import { RepoStartError } from '../config/validate.ts';
import {
  assertSafeTarget,
  isDirectory,
  pathExists,
  requiredDirectories,
  resolveInside,
} from '../utils/filesystem.ts';

export interface WriteOptions {
  dryRun: boolean;
  force: boolean;
}

export interface WriteResult {
  targetDir: string;
  /** Relative paths that would be, or were, created. */
  createdFiles: string[];
  /** Relative paths that already existed and were replaced (force only). */
  overwrittenFiles: string[];
  /** Relative directories that would be, or were, created. */
  createdDirectories: string[];
  dryRun: boolean;
}

/** Planned files that already exist in the target directory. */
export function findCollisions(targetDir: string, plan: ProjectPlan): string[] {
  return plan.files
    .filter((file) => pathExists(resolveInside(targetDir, file.path)))
    .map((file) => file.path);
}

/**
 * Paths where a directory sits exactly where a file should go. These can never
 * be written, not even with --force, because doing so would mean deleting a
 * directory the user owns.
 */
function findBlockedPaths(targetDir: string, plan: ProjectPlan): string[] {
  return plan.files
    .filter((file) => isDirectory(resolveInside(targetDir, file.path)))
    .map((file) => file.path);
}

/**
 * Write a plan to disk.
 *
 * Nothing is written until every safety check has passed, so a refused run
 * leaves the target directory exactly as it was.
 */
export async function writePlan(
  targetDir: string,
  plan: ProjectPlan,
  options: WriteOptions,
): Promise<WriteResult> {
  assertSafeTarget(targetDir);

  if (pathExists(targetDir) && !isDirectory(targetDir)) {
    throw new RepoStartError(`The target path exists and is not a directory: ${targetDir}`);
  }

  const blocked = findBlockedPaths(targetDir, plan);

  if (blocked.length > 0) {
    throw new RepoStartError(
      'A directory already exists where a file needs to be written.',
      blocked.map((item) => `${item} (existing directory)`),
    );
  }

  const collisions = findCollisions(targetDir, plan);

  if (collisions.length > 0 && !options.force) {
    throw new RepoStartError(
      `${collisions.length} file${collisions.length === 1 ? '' : 's'} already exist in the target directory.`,
      [
        ...collisions,
        '',
        'Nothing was changed. Choose an empty directory, remove these files,',
        'or re-run with --force to overwrite exactly these files.',
      ],
    );
  }

  const filePaths = plan.files.map((file) => file.path);
  const collisionSet = new Set(collisions);
  const createdFiles = filePaths.filter((filePath) => !collisionSet.has(filePath));
  const createdDirectories = requiredDirectories(filePaths, plan.directories).filter(
    (directory) => !pathExists(resolveInside(targetDir, directory)),
  );

  const result: WriteResult = {
    targetDir,
    createdFiles,
    overwrittenFiles: collisions,
    createdDirectories,
    dryRun: options.dryRun,
  };

  if (options.dryRun) {
    return result;
  }

  await mkdir(targetDir, { recursive: true });

  for (const directory of createdDirectories) {
    await mkdir(resolveInside(targetDir, directory), { recursive: true });
  }

  for (const file of plan.files) {
    const destination = resolveInside(targetDir, file.path);

    // 'wx' fails if the file appeared between the collision check and now,
    // which keeps the "never overwrite by accident" promise honest.
    await writeFile(destination, file.contents, {
      encoding: 'utf8',
      flag: options.force ? 'w' : 'wx',
    });
  }

  return result;
}
