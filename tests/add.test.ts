import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { analyzeRepository } from '../src/audit/analyze.ts';
import { inspectRepository } from '../src/audit/inspect.ts';
import { parseCliArgs } from '../src/cli/args.ts';
import type { FileEdit, ProjectPlan } from '../src/config/types.ts';
import { RepoStartError } from '../src/config/validate.ts';
import { applyLineEdits, writePlan } from '../src/generators/write-files.ts';
import { checkIgnore } from '../src/utils/git.ts';
import {
  gitAdd,
  gitAvailable,
  initGitRepository,
  packageJson,
  planFor,
  withTempDir,
  writeRepo,
} from './helpers.ts';

const execFileAsync = promisify(execFile);
const ENTRY = fileURLToPath(new URL('../src/index.ts', import.meta.url));
const SKIP_WITHOUT_GIT = gitAvailable() ? false : 'git is not available in this environment';

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

const NODE_TS_REPO = {
  'package.json': packageJson({
    name: 'demo-app',
    description: 'A demo application.',
    engines: { node: '>=22' },
    scripts: { build: 'tsc', test: 'node --test' },
    devDependencies: { typescript: '^5.9.0' },
  }),
  'tsconfig.json': '{}\n',
  'README.md': '# Demo\n',
};

/** A plan that does nothing but apply one set of edits. */
function editPlan(edit: FileEdit): ProjectPlan {
  return { ...planFor(), files: [], directories: [], notes: [], edits: [edit] };
}

describe('parsing the add command', () => {
  test('reads `add` as a command, not as a directory', () => {
    const options = parseCliArgs(['add']);

    assert.equal(options.command, 'add');
    assert.equal(options.directory, null);
  });

  test('takes a directory after the command', () => {
    const options = parseCliArgs(['add', './some-project', '--dry-run']);

    assert.equal(options.command, 'add');
    assert.equal(options.directory, './some-project');
    assert.equal(options.dryRun, true);
  });

  test('a plain directory is still the create command', () => {
    const options = parseCliArgs(['my-project']);

    assert.equal(options.command, 'create');
    assert.equal(options.directory, 'my-project');
  });

  test('rejects --force, which add never uses', () => {
    assert.throws(
      () => parseCliArgs(['add', '--force']),
      (error: unknown) => error instanceof RepoStartError && /--force is not used/.test(error.message),
    );
  });

  test('rejects create-only flags instead of silently ignoring them', () => {
    assert.throws(
      () => parseCliArgs(['add', '--no-env']),
      (error: unknown) =>
        error instanceof RepoStartError && /--no-env is not used/.test(error.message),
    );
  });

  test('still rejects a second directory after the command', () => {
    assert.throws(
      () => parseCliArgs(['add', 'one', 'two']),
      (error: unknown) => error instanceof RepoStartError,
    );
  });
});

describe('applying narrow edits to an existing file', () => {
  test('replaces exactly the line it was given', () => {
    const original = ['first', 'second', 'third', ''].join('\n');
    const updated = applyLineEdits(original, {
      path: 'demo.txt',
      summary: [],
      edits: [{ line: 2, before: 'second', after: ['SECOND'] }],
    });

    assert.equal(updated, ['first', 'SECOND', 'third', ''].join('\n'));
  });

  test('several edits all address the original line numbers', () => {
    const original = ['one', 'two', 'three', ''].join('\n');
    const updated = applyLineEdits(original, {
      path: 'demo.txt',
      summary: [],
      edits: [
        { line: 1, before: 'one', after: ['one', 'one-and-a-half'] },
        { line: 3, before: 'three', after: ['THREE'] },
      ],
    });

    assert.equal(updated, ['one', 'one-and-a-half', 'two', 'THREE', ''].join('\n'));
  });

  test('a file written with CRLF stays a CRLF file', () => {
    const original = ['first', 'second', ''].join('\r\n');
    const updated = applyLineEdits(original, {
      path: 'demo.txt',
      summary: [],
      edits: [{ line: 2, before: 'second', after: ['second', 'third'] }],
    });

    assert.equal(updated, ['first', 'second', 'third', ''].join('\r\n'));
  });

  test('refuses when the line is not what was inspected', () => {
    const original = ['first', 'changed', ''].join('\n');

    assert.equal(
      applyLineEdits(original, {
        path: 'demo.txt',
        summary: [],
        edits: [{ line: 2, before: 'second', after: ['SECOND'] }],
      }),
      null,
    );
  });

  test('refuses a line number the file does not have', () => {
    assert.equal(
      applyLineEdits('only one line\n', {
        path: 'demo.txt',
        summary: [],
        edits: [{ line: 9, before: 'anything', after: [] }],
      }),
      null,
    );
  });
});

describe('writing a plan that edits existing files', () => {
  test('a dry run reports the edit and changes nothing', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, { 'notes.txt': 'first\nsecond\n' });

      const plan = editPlan({
        path: 'notes.txt',
        summary: ['second -> SECOND'],
        edits: [{ line: 2, before: 'second', after: ['SECOND'] }],
      });
      const result = await writePlan(dir, plan, { dryRun: true, force: false });

      assert.deepEqual(result.modifiedFiles, ['notes.txt']);
      assert.equal(await readFile(path.join(dir, 'notes.txt'), 'utf8'), 'first\nsecond\n');
    });
  });

  test('applies the edit and leaves the rest of the file alone', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, { 'notes.txt': 'first\nsecond\nthird\n' });

      const plan = editPlan({
        path: 'notes.txt',
        summary: ['second -> SECOND'],
        edits: [{ line: 2, before: 'second', after: ['SECOND'] }],
      });
      const result = await writePlan(dir, plan, { dryRun: false, force: false });

      assert.deepEqual(result.modifiedFiles, ['notes.txt']);
      assert.equal(await readFile(path.join(dir, 'notes.txt'), 'utf8'), 'first\nSECOND\nthird\n');
    });
  });

  test('a file that changed since it was inspected is refused, and nothing is written', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, { 'notes.txt': 'first\nEDITED BY SOMEONE ELSE\n' });

      const plan = editPlan({
        path: 'notes.txt',
        summary: ['second -> SECOND'],
        edits: [{ line: 2, before: 'second', after: ['SECOND'] }],
      });

      plan.files = [{ path: 'new-file.md', contents: 'x' }];

      await assert.rejects(
        () => writePlan(dir, plan, { dryRun: false, force: false }),
        (error: unknown) => error instanceof RepoStartError && /has changed since/.test(error.message),
      );

      // The refusal is total: the file it would have added was not written.
      assert.deepEqual(await readdir(dir), ['notes.txt']);
    });
  });

  test('refuses to edit something that is not a file', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, { 'notes/keep.txt': 'x' });

      const plan = editPlan({
        path: 'notes',
        summary: ['nonsense'],
        edits: [{ line: 1, before: 'x', after: ['y'] }],
      });

      await assert.rejects(
        () => writePlan(dir, plan, { dryRun: false, force: false }),
        (error: unknown) => error instanceof RepoStartError && /not a file/.test(error.message),
      );
    });
  });
});

describe('the add command end to end', () => {
  test('a dry run reports the audit and touches nothing', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, NODE_TS_REPO);

      const before = (await readdir(dir)).sort();
      const result = await runCli(dir, ['add', '--dry-run']);

      assert.equal(result.code, 0);
      assert.match(result.stdout, /Repo Start Audit/);
      assert.match(result.stdout, /Detected: Node\.js \+ TypeScript, npm/);
      assert.match(result.stdout, /Would create:/);
      assert.match(result.stdout, /^ {2}\.gitignore$/m);
      assert.match(result.stdout, /No files were changed/);
      assert.deepEqual((await readdir(dir)).sort(), before);
    });
  });

  test('adds the missing files and leaves the existing ones untouched', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, { ...NODE_TS_REPO, 'README.md': 'MY OWN README\n' });

      const result = await runCli(dir, ['add', '--yes']);

      assert.equal(result.code, 0);
      assert.match(result.stdout, /files added/);
      assert.ok(existsSync(path.join(dir, '.gitignore')));
      assert.ok(existsSync(path.join(dir, 'AGENTS.md')));
      assert.ok(existsSync(path.join(dir, '.github', 'workflows', 'ci.yml')));
      assert.equal(await readFile(path.join(dir, 'README.md'), 'utf8'), 'MY OWN README\n');
      assert.equal(
        await readFile(path.join(dir, 'package.json'), 'utf8'),
        NODE_TS_REPO['package.json'],
      );
    });
  });

  test('never writes a README or a license of its own', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, { 'package.json': packageJson({ name: 'demo' }) });

      const result = await runCli(dir, ['add', '--yes']);

      assert.equal(result.code, 0);
      assert.equal(existsSync(path.join(dir, 'README.md')), false);
      assert.equal(existsSync(path.join(dir, 'LICENSE')), false);
      assert.match(result.stdout, /Note: README\.md is missing/);
    });
  });

  test('running it twice is safe: the second run has nothing to do', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, NODE_TS_REPO);

      assert.equal((await runCli(dir, ['add', '--yes'])).code, 0);

      const second = await runCli(dir, ['add', '--yes']);

      assert.equal(second.code, 0);
      assert.match(second.stdout, /Nothing to add/);
      assert.equal(second.stdout.includes('Would create'), false);
    });
  });

  test('the generated .env.example is not swallowed by the generated .gitignore', {
    skip: SKIP_WITHOUT_GIT,
  }, async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, NODE_TS_REPO);
      initGitRepository(dir);

      assert.equal((await runCli(dir, ['add', '--yes'])).code, 0);

      const second = await runCli(dir, ['add', '--yes']);

      assert.equal(second.stdout.includes('git ignores it'), false);
    });
  });

  test('honours --type instead of its own detection', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, { 'main.py': 'print("hello")\n' });

      const result = await runCli(dir, ['add', '--type', 'python', '--dry-run']);

      assert.equal(result.code, 0);
      assert.match(result.stdout, /Detected: Python/);
      assert.equal(result.stdout.includes('Could not confidently classify'), false);
    });
  });

  test('says it cannot classify a project rather than pretending', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, { 'main.py': 'print("hello")\n' });

      const result = await runCli(dir, ['add', '--dry-run']);

      assert.match(result.stdout, /Could not confidently classify/);
      assert.match(result.stdout, /Pass --type/);
    });
  });

  test('audits a directory other than the current one', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, { 'project/package.json': packageJson({ name: 'nested' }) });

      const result = await runCli(dir, ['add', './project', '--dry-run']);

      assert.equal(result.code, 0);
      assert.match(result.stdout, /Project: nested/);
      assert.deepEqual(await readdir(path.join(dir, 'project')), ['package.json']);
    });
  });

  test('refuses to guess when it cannot ask and was not told', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, NODE_TS_REPO);

      const result = await runCli(dir, ['add']);

      assert.equal(result.code, 1);
      assert.match(result.stderr, /cannot ask which changes to apply/);
      assert.equal(existsSync(path.join(dir, '.gitignore')), false);
    });
  });

  test('rejects --force before doing anything', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, NODE_TS_REPO);

      const result = await runCli(dir, ['add', '--yes', '--force']);

      assert.equal(result.code, 1);
      assert.match(result.stderr, /--force is not used/);
      assert.equal(existsSync(path.join(dir, '.gitignore')), false);
    });
  });

  test('reports a directory that does not exist', async () => {
    await withTempDir(async (dir) => {
      const result = await runCli(dir, ['add', './nowhere', '--dry-run']);

      assert.equal(result.code, 1);
      assert.match(result.stderr, /No such directory/);
    });
  });
});

describe('the .env.example ignore rule', { skip: SKIP_WITHOUT_GIT }, () => {
  const IGNORED_REPO = {
    '.gitignore': ['# Environment', '.env', '.env.*', ''].join('\n'),
    '.env.example': 'LOG_LEVEL=info\n',
    'README.md': '# Demo\n',
  };

  test('git is asked once, and its answer is what the audit uses', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, IGNORED_REPO);
      initGitRepository(dir);

      const state = inspectRepository(dir);

      assert.equal(state.isGitRepository, true);
      assert.equal(state.envExampleIgnore?.ignored, true);
      assert.equal(state.envExampleIgnore?.tracked, false);
      assert.equal(state.envExampleIgnore?.match?.source, '.gitignore');
      assert.equal(state.envExampleIgnore?.match?.pattern, '.env.*');
      assert.equal(state.envExampleIgnore?.match?.line, 3);
    });
  });

  test('a tracked .env.example is not reported, whatever the rules say', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, IGNORED_REPO);
      initGitRepository(dir);
      gitAdd(dir, '.env.example');

      const state = inspectRepository(dir);
      const audit = analyzeRepository(state);

      assert.equal(state.envExampleIgnore?.tracked, true);
      assert.equal(state.envExampleIgnore?.ignored, false);
      assert.equal(
        audit.issues.some((issue) => issue.code === 'env-example-ignored'),
        false,
      );
    });
  });

  test('add un-ignores it by adding one line to .gitignore', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, IGNORED_REPO);
      initGitRepository(dir);

      const result = await runCli(dir, ['add', '--yes']);

      assert.equal(result.code, 0);
      assert.match(result.stdout, /git ignores it/);
      assert.match(result.stdout, /Modified:/);
      assert.equal(
        await readFile(path.join(dir, '.gitignore'), 'utf8'),
        ['# Environment', '.env', '.env.*', '!.env.example', ''].join('\n'),
      );
    });
  });

  test('a dry run shows the fix without applying it', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, IGNORED_REPO);
      initGitRepository(dir);

      const result = await runCli(dir, ['add', '--dry-run']);

      assert.equal(result.code, 0);
      assert.match(result.stdout, /Would modify:/);
      assert.match(result.stdout, /add `!\.env\.example` after `\.env\.\*`/);
      assert.equal(
        await readFile(path.join(dir, '.gitignore'), 'utf8'),
        IGNORED_REPO['.gitignore'],
      );
    });
  });

  test('a rule outside .gitignore is reported but never edited', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, { '.env.example': 'LOG_LEVEL=info\n', 'README.md': '# Demo\n' });
      initGitRepository(dir);
      // A personal exclude file is not the repository's to rewrite.
      await writeRepo(dir, { '.git/info/exclude': '.env.example\n' });

      const audit = analyzeRepository(inspectRepository(dir));
      const issue = audit.issues.find((candidate) => candidate.code === 'env-example-ignored');

      assert.ok(issue, 'expected the ignored .env.example to be reported');
      assert.equal(issue.fix, undefined);
      assert.ok(issue.details.some((detail) => /will not edit this rule/.test(detail)));

      const result = await runCli(dir, ['add', '--yes']);

      assert.equal(result.code, 0);
      assert.equal(await readFile(path.join(dir, '.git', 'info', 'exclude'), 'utf8'), '.env.example\n');
      assert.equal(result.stdout.includes('Would modify'), false);
    });
  });

  test('an existing negation means the file is not ignored', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, {
        '.gitignore': ['.env', '.env.*', '!.env.example', ''].join('\n'),
        '.env.example': 'LOG_LEVEL=info\n',
      });
      initGitRepository(dir);

      // git check-ignore reports the negation as a match and exits 0, so this
      // is the case where reading its exit status alone gets it backwards.
      assert.equal(checkIgnore(dir, '.env.example'), null);

      const state = inspectRepository(dir);
      const audit = analyzeRepository(state);

      assert.equal(state.envExampleIgnore?.ignored, false);
      assert.equal(
        audit.issues.some((issue) => issue.code === 'env-example-ignored'),
        false,
      );
    });
  });

  test('a rule that really does ignore it is still found', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, { '.gitignore': '.env*\n', '.env.example': 'LOG_LEVEL=info\n' });
      initGitRepository(dir);

      assert.deepEqual(checkIgnore(dir, '.env.example'), {
        source: '.gitignore',
        line: 1,
        pattern: '.env*',
      });
    });
  });
});
