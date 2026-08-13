import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';

import { RepoStartError } from '../src/config/validate.ts';
import { writePlan } from '../src/generators/write-files.ts';
import { assertSafeTarget } from '../src/utils/filesystem.ts';
import { planFor, withTempDir } from './helpers.ts';

const NO_CHANGES = { dryRun: true, force: false };
const WRITE = { dryRun: false, force: false };
const FORCE = { dryRun: false, force: true };

describe('writing a plan', () => {
  test('creates every planned file inside the target directory', async () => {
    await withTempDir(async (dir) => {
      const target = path.join(dir, 'demo');
      const plan = planFor({ type: 'node-ts' });
      const result = await writePlan(target, plan, WRITE);

      for (const file of plan.files) {
        const written = await readFile(path.join(target, file.path), 'utf8');

        assert.equal(written, file.contents);
      }

      assert.equal(result.createdFiles.length, plan.files.length);
      assert.equal(result.overwrittenFiles.length, 0);
      assert.ok(result.createdDirectories.includes('src'));
    });
  });

  test('creates directories a preset asked for even when empty', async () => {
    await withTempDir(async (dir) => {
      const target = path.join(dir, 'demo');

      await writePlan(target, planFor({ type: 'generic' }), WRITE);

      assert.ok(existsSync(path.join(target, 'src', '.gitkeep')));
      assert.ok(existsSync(path.join(target, 'tests', '.gitkeep')));
    });
  });
});

describe('dry run', () => {
  test('makes no filesystem changes at all', async () => {
    await withTempDir(async (dir) => {
      const target = path.join(dir, 'demo');
      const plan = planFor({ type: 'react-ts' });
      const result = await writePlan(target, plan, NO_CHANGES);

      assert.equal(existsSync(target), false);
      assert.deepEqual(await readdir(dir), []);
      assert.equal(result.dryRun, true);
      assert.equal(result.createdFiles.length, plan.files.length);
    });
  });

  test('reports collisions without touching the existing file', async () => {
    await withTempDir(async (dir) => {
      const target = path.join(dir, 'demo');

      await mkdir(target, { recursive: true });
      await writeFile(path.join(target, 'README.md'), 'ORIGINAL', 'utf8');

      const result = await writePlan(target, planFor(), { dryRun: true, force: true });

      assert.deepEqual(result.overwrittenFiles, ['README.md']);
      assert.equal(await readFile(path.join(target, 'README.md'), 'utf8'), 'ORIGINAL');
      assert.deepEqual(await readdir(target), ['README.md']);
    });
  });
});

describe('collision protection', () => {
  test('refuses to overwrite existing files and changes nothing', async () => {
    await withTempDir(async (dir) => {
      const target = path.join(dir, 'demo');

      await mkdir(target, { recursive: true });
      await writeFile(path.join(target, 'README.md'), 'ORIGINAL', 'utf8');
      await writeFile(path.join(target, '.gitignore'), 'ORIGINAL', 'utf8');

      await assert.rejects(
        () => writePlan(target, planFor({ type: 'node-ts' }), WRITE),
        (error: unknown) => {
          assert.ok(error instanceof RepoStartError);
          assert.match(error.message, /already exist/);
          assert.ok(error.details.includes('README.md'));
          assert.ok(error.details.includes('.gitignore'));
          return true;
        },
      );

      // The refusal must be total: no partial write, no new files.
      assert.deepEqual((await readdir(target)).sort(), ['.gitignore', 'README.md']);
      assert.equal(await readFile(path.join(target, 'README.md'), 'utf8'), 'ORIGINAL');
    });
  });

  test('refuses even with --force when a directory sits where a file goes', async () => {
    await withTempDir(async (dir) => {
      const target = path.join(dir, 'demo');

      await mkdir(path.join(target, 'README.md'), { recursive: true });

      await assert.rejects(
        () => writePlan(target, planFor(), FORCE),
        (error: unknown) =>
          error instanceof RepoStartError && /directory already exists/.test(error.message),
      );
    });
  });

  test('a non-colliding existing file is left alone', async () => {
    await withTempDir(async (dir) => {
      const target = path.join(dir, 'demo');

      await mkdir(target, { recursive: true });
      await writeFile(path.join(target, 'notes.txt'), 'KEEP ME', 'utf8');

      await writePlan(target, planFor(), WRITE);

      assert.equal(await readFile(path.join(target, 'notes.txt'), 'utf8'), 'KEEP ME');
    });
  });
});

describe('--force', () => {
  test('replaces exactly the colliding files and reports them', async () => {
    await withTempDir(async (dir) => {
      const target = path.join(dir, 'demo');

      await mkdir(target, { recursive: true });
      await writeFile(path.join(target, 'README.md'), 'ORIGINAL', 'utf8');
      await writeFile(path.join(target, 'untouched.md'), 'ORIGINAL', 'utf8');

      const plan = planFor({ type: 'node-ts' });
      const result = await writePlan(target, plan, FORCE);

      assert.deepEqual(result.overwrittenFiles, ['README.md']);
      assert.notEqual(await readFile(path.join(target, 'README.md'), 'utf8'), 'ORIGINAL');
      assert.equal(await readFile(path.join(target, 'untouched.md'), 'utf8'), 'ORIGINAL');
      assert.ok(existsSync(path.join(target, 'package.json')));
    });
  });
});

describe('target directory safety', () => {
  test('refuses the filesystem root', () => {
    assert.throws(
      () => assertSafeTarget(path.parse(process.cwd()).root),
      (error: unknown) => error instanceof RepoStartError,
    );
  });

  test('refuses the home directory', () => {
    assert.throws(
      () => assertSafeTarget(os.homedir()),
      (error: unknown) => error instanceof RepoStartError,
    );
  });

  test('refuses a target that exists as a file', async () => {
    await withTempDir(async (dir) => {
      const target = path.join(dir, 'a-file');

      await writeFile(target, 'not a directory', 'utf8');

      await assert.rejects(
        () => writePlan(target, planFor(), WRITE),
        (error: unknown) => error instanceof RepoStartError,
      );
    });
  });
});
