import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { parseCliArgs } from '../src/cli/args.ts';
import { RepoStartError } from '../src/config/validate.ts';
import { withTempDir } from './helpers.ts';

const execFileAsync = promisify(execFile);
const ENTRY = fileURLToPath(new URL('../src/index.ts', import.meta.url));

interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run the CLI the way a user would, in a throwaway directory. */
async function runCli(cwd: string, args: string[]): Promise<CliRun> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [ENTRY, ...args], {
      cwd,
      env: { ...process.env, NO_COLOR: '1' },
    });

    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };

    return { code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

describe('argument parsing', () => {
  test('reads a directory, a type and behavior flags', () => {
    const options = parseCliArgs(['my-project', '--type', 'python', '--dry-run', '--no-docs']);

    assert.equal(options.directory, 'my-project');
    assert.equal(options.type, 'python');
    assert.equal(options.dryRun, true);
    assert.equal(options.includeDocs, false);
  });

  test('leaves unspecified options undefined so prompts know what to ask', () => {
    const options = parseCliArgs(['my-project']);

    assert.equal(options.type, undefined);
    assert.equal(options.includeDocs, undefined);
    assert.equal(options.license, undefined);
  });

  test('rejects an unknown project type', () => {
    assert.throws(
      () => parseCliArgs(['x', '--type', 'rust']),
      (error: unknown) => error instanceof RepoStartError && /Unknown project type/.test(error.message),
    );
  });

  test('rejects an unknown license', () => {
    assert.throws(
      () => parseCliArgs(['x', '--license', 'wtfpl']),
      (error: unknown) => error instanceof RepoStartError && /Unknown license/.test(error.message),
    );
  });

  test('rejects contradictory flags', () => {
    assert.throws(
      () => parseCliArgs(['x', '--ci', '--no-ci']),
      (error: unknown) => error instanceof RepoStartError,
    );
  });

  test('rejects unknown flags and more than one directory', () => {
    assert.throws(() => parseCliArgs(['--nope']), (error: unknown) => error instanceof RepoStartError);
    assert.throws(
      () => parseCliArgs(['one', 'two']),
      (error: unknown) => error instanceof RepoStartError,
    );
  });
});

describe('the command line interface', () => {
  test('prints help and exits successfully', async () => {
    await withTempDir(async (dir) => {
      const result = await runCli(dir, ['--help']);

      assert.equal(result.code, 0);
      assert.match(result.stdout, /Usage/);
      assert.match(result.stdout, /--dry-run/);
    });
  });

  test('prints a version', async () => {
    await withTempDir(async (dir) => {
      const result = await runCli(dir, ['--version']);

      assert.equal(result.code, 0);
      assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+/);
    });
  });

  test('generates a project and reports what it did', async () => {
    await withTempDir(async (dir) => {
      const result = await runCli(dir, ['my-project', '--type', 'node-ts', '--yes', '--no-git']);

      assert.equal(result.code, 0);
      assert.match(result.stdout, /Repo Start created my-project/);
      assert.match(result.stdout, /npm install/);
      assert.ok(existsSync(path.join(dir, 'my-project', 'package.json')));
      assert.ok(existsSync(path.join(dir, 'my-project', 'README.md')));
      assert.ok(!existsSync(path.join(dir, 'my-project', '.git')));
    });
  });

  test('initializes a git repository when asked', async () => {
    await withTempDir(async (dir) => {
      const result = await runCli(dir, ['my-project', '--yes', '--git']);

      assert.equal(result.code, 0);
      // git may be absent in a minimal environment; the CLI must not crash.
      if (!/Could not run git init/.test(result.stdout)) {
        assert.ok(existsSync(path.join(dir, 'my-project', '.git')));
      }
    });
  });

  test('a dry run leaves the filesystem untouched', async () => {
    await withTempDir(async (dir) => {
      const result = await runCli(dir, ['my-project', '--type', 'python', '--yes', '--dry-run']);

      assert.equal(result.code, 0);
      assert.match(result.stdout, /No files were changed/);
      assert.deepEqual(await readdir(dir), []);
    });
  });

  test('a dry run lists the repository hygiene files it would create', async () => {
    await withTempDir(async (dir) => {
      const result = await runCli(dir, ['my-project', '--type', 'node-ts', '--yes', '--dry-run']);

      assert.equal(result.code, 0);
      assert.match(result.stdout, /^ {2}\.gitattributes$/m);
      assert.match(result.stdout, /^ {2}\.gitignore$/m);
      assert.match(result.stdout, /^ {2}\.editorconfig$/m);
    });
  });

  test('refuses to clobber an existing project and exits non-zero', async () => {
    await withTempDir(async (dir) => {
      const target = path.join(dir, 'my-project');

      await mkdir(target, { recursive: true });
      await writeFile(path.join(target, 'README.md'), 'ORIGINAL', 'utf8');

      const result = await runCli(dir, ['my-project', '--yes']);

      assert.equal(result.code, 1);
      assert.match(result.stderr, /already exist/);
      assert.equal(await readFile(path.join(target, 'README.md'), 'utf8'), 'ORIGINAL');
      assert.deepEqual(await readdir(target), ['README.md']);
    });
  });

  test('--force overwrites the collision', async () => {
    await withTempDir(async (dir) => {
      const target = path.join(dir, 'my-project');

      await mkdir(target, { recursive: true });
      await writeFile(path.join(target, 'README.md'), 'ORIGINAL', 'utf8');

      const result = await runCli(dir, ['my-project', '--yes', '--force', '--no-git']);

      assert.equal(result.code, 0);
      assert.match(result.stdout, /Overwrote 1 existing file/);
      assert.notEqual(await readFile(path.join(target, 'README.md'), 'utf8'), 'ORIGINAL');
    });
  });

  test('requires a directory when it cannot prompt', async () => {
    await withTempDir(async (dir) => {
      const result = await runCli(dir, ['--yes']);

      assert.equal(result.code, 1);
      assert.match(result.stderr, /directory is required/);
      assert.deepEqual(await readdir(dir), []);
    });
  });

  test('rejects an invalid project name without writing anything', async () => {
    await withTempDir(async (dir) => {
      const result = await runCli(dir, ['ok-dir', '--name', 'bad:name', '--yes']);

      assert.equal(result.code, 1);
      assert.match(result.stderr, /not valid/);
      assert.deepEqual(await readdir(dir), []);
    });
  });

  test('reports unknown options instead of guessing', async () => {
    await withTempDir(async (dir) => {
      const result = await runCli(dir, ['my-project', '--typo']);

      assert.equal(result.code, 1);
      assert.match(result.stderr, /--help/);
    });
  });
});
