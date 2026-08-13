import { mkdir, readFile, writeFile } from 'node:fs/promises';

import type { FileEdit, ProjectPlan } from '../config/types.ts';
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
  /** Relative paths of existing files that would be, or were, edited. */
  modifiedFiles: string[];
  dryRun: boolean;
}

/**
 * Apply narrow line edits to the text of a file.
 *
 * The file's own line endings are preserved: edits are applied to the lines
 * as they are on disk, so a CRLF file stays a CRLF file and nothing outside
 * the edited lines is rewritten. Returns null when the file no longer matches
 * what was inspected.
 */
export function applyLineEdits(original: string, edit: FileEdit): string | null {
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const lines = original.split(/\r?\n/);
  const ordered = [...edit.edits].sort((a, b) => b.line - a.line);

  for (const lineEdit of ordered) {
    const index = lineEdit.line - 1;

    if (index < 0 || index >= lines.length || lines[index] !== lineEdit.before) {
      return null;
    }

    lines.splice(index, 1, ...lineEdit.after);
  }

  return lines.join(newline);
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

  // Every edit is verified against the file on disk before anything is
  // written, so a stale plan refuses instead of half-applying.
  const editedContents = new Map<string, string>();

  for (const edit of plan.edits) {
    const destination = resolveInside(targetDir, edit.path);

    if (!pathExists(destination) || isDirectory(destination)) {
      throw new RepoStartError(`Cannot edit ${edit.path}: it is not a file in ${targetDir}.`);
    }

    const original = await readFile(destination, 'utf8');
    const updated = applyLineEdits(original, edit);

    if (updated === null) {
      throw new RepoStartError(
        `${edit.path} has changed since it was inspected, so it was not edited.`,
        ['Re-run repo-start add to inspect the current contents.'],
      );
    }

    editedContents.set(edit.path, updated);
  }

  const result: WriteResult = {
    targetDir,
    createdFiles,
    overwrittenFiles: collisions,
    createdDirectories,
    modifiedFiles: plan.edits.map((edit) => edit.path),
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

  for (const [relativePath, contents] of editedContents) {
    await writeFile(resolveInside(targetDir, relativePath), contents, 'utf8');
  }

  return result;
}
