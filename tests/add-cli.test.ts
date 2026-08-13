import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { runAddCommand } from '../src/cli/add.ts';
import { packageJson, scriptedPrompter, withTempDir, writeRepo } from './helpers.ts';

/**
 * Interactive selection and backward compatibility.
 *
 * The audit rules are covered in audit.test.ts and the add command end to end
 * in add.test.ts; this file only exercises what those cannot: the question
 * loop, and the promise that the original create mode still works.
 */

const execFileAsync = promisify(execFile);
const ENTRY = fileURLToPath(new URL('../src/index.ts', import.meta.url));

const MANIFEST = packageJson({
  name: 'demo-app',
  description: 'An existing application',
  scripts: { build: 'tsc', test: 'node --test' },
  devDependencies: { typescript: '^5.9.0' },
});

/** A Node + TypeScript repository with one documented command that is off. */
async function imperfectRepo(dir: string): Promise<void> {
  await writeRepo(dir, {
    'package.json': MANIFEST,
    'tsconfig.json': '{}\n',
    'src/index.ts': "export const hello = 'world';\n",
    'README.md': '# Demo\n\n```bash\nnpm run test\n```\n',
    '.gitignore': 'node_modules/\ndist/\n',
  });
}

/**
 * Every question the add command asks for `imperfectRepo`, in order.
 *
 * Written out so a change in the proposal list fails loudly here instead of
 * silently shifting which answer lands on which question.
 */
const QUESTIONS = [
  '.gitattributes',
  '.env.example',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  'docs/',
  'issue templates',
  'pull request template',
  'Actions workflow',
  'Fix README.md',
];

async function runCli(
  cwd: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
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

/** Answer the questions and confirm the script lined up with them. */
async function answerQuestions(dir: string, answers: string[]): Promise<string> {
  assert.equal(answers.length, QUESTIONS.length, 'the script must cover every question');

  const { prompter, transcript } = scriptedPrompter(answers);

  await runAddCommand(
    { directory: '.', dryRun: false, yes: false, interactive: false },
    dir,
    () => {},
    prompter,
  );

  const asked = transcript();

  // Without this, a script that is one answer short would silently accept the
  // remaining defaults and the test would pass for the wrong reason.
  assert.equal(asked.split('(Y/n)').length - 1, answers.length, `questions asked:\n${asked}`);
  QUESTIONS.forEach((question, index) => {
    assert.ok(asked.includes(question), `question ${index + 1} (${question}) was not asked`);
  });

  return asked;
}

describe('interactive selection', () => {
  test('creates accepted files and leaves declined ones absent', async () => {
    await withTempDir(async (dir) => {
      await imperfectRepo(dir);

      // Accept .gitattributes, AGENTS.md and the README fix; decline the rest.
      await answerQuestions(dir, ['y', 'n', 'y', 'n', 'n', 'n', 'n', 'n', 'n', 'y']);

      assert.ok(existsSync(path.join(dir, '.gitattributes')), 'accepted file should exist');
      assert.ok(existsSync(path.join(dir, 'AGENTS.md')), 'accepted file should exist');
      assert.ok(!existsSync(path.join(dir, '.env.example')), 'declined file must not exist');
      assert.ok(!existsSync(path.join(dir, 'CONTRIBUTING.md')), 'declined file must not exist');
      assert.ok(!existsSync(path.join(dir, 'CHANGELOG.md')), 'declined file must not exist');
      assert.ok(!existsSync(path.join(dir, 'docs')), 'declined directory must not exist');
      assert.ok(!existsSync(path.join(dir, '.github')), 'declined directory must not exist');

      assert.equal(
        await readFile(path.join(dir, 'README.md'), 'utf8'),
        '# Demo\n\n```bash\nnpm test\n```\n',
      );
    });
  });

  test('declining a fix leaves the file exactly as it was', async () => {
    await withTempDir(async (dir) => {
      await imperfectRepo(dir);

      const readmeBefore = await readFile(path.join(dir, 'README.md'), 'utf8');

      await answerQuestions(dir, ['y', 'n', 'n', 'n', 'n', 'n', 'n', 'n', 'n', 'n']);

      assert.ok(existsSync(path.join(dir, '.gitattributes')));
      assert.equal(await readFile(path.join(dir, 'README.md'), 'utf8'), readmeBefore);
    });
  });

  test('declining everything changes nothing at all', async () => {
    await withTempDir(async (dir) => {
      await imperfectRepo(dir);

      const before = (await readdir(dir)).sort();
      const readmeBefore = await readFile(path.join(dir, 'README.md'), 'utf8');

      await answerQuestions(dir, Array.from({ length: QUESTIONS.length }, () => 'n'));

      assert.deepEqual((await readdir(dir)).sort(), before);
      assert.equal(await readFile(path.join(dir, 'README.md'), 'utf8'), readmeBefore);
    });
  });

  test('accepting everything never touches source code or the manifest', async () => {
    await withTempDir(async (dir) => {
      await imperfectRepo(dir);

      const sourceBefore = await readFile(path.join(dir, 'src/index.ts'), 'utf8');
      const manifestBefore = await readFile(path.join(dir, 'package.json'), 'utf8');
      const gitignoreBefore = await readFile(path.join(dir, '.gitignore'), 'utf8');

      await answerQuestions(dir, Array.from({ length: QUESTIONS.length }, () => 'y'));

      assert.equal(await readFile(path.join(dir, 'src/index.ts'), 'utf8'), sourceBefore);
      assert.equal(await readFile(path.join(dir, 'package.json'), 'utf8'), manifestBefore);
      assert.equal(await readFile(path.join(dir, '.gitignore'), 'utf8'), gitignoreBefore);
      assert.ok(existsSync(path.join(dir, 'CONTRIBUTING.md')));
    });
  });
});

describe('generated documents agree with the repository', () => {
  test('AGENTS.md shows the commands this repository really has', async () => {
    await withTempDir(async (dir) => {
      // A repository with test and dev scripts, but deliberately no build.
      await writeRepo(dir, {
        'package.json': packageJson({
          name: 'demo-app',
          scripts: { test: 'vitest run', dev: 'vite' },
        }),
        'tsconfig.json': '{}\n',
      });

      await runCli(dir, ['add', '--yes']);

      const agents = await readFile(path.join(dir, 'AGENTS.md'), 'utf8');
      const contributing = await readFile(path.join(dir, 'CONTRIBUTING.md'), 'utf8');

      for (const [name, document] of [
        ['AGENTS.md', agents],
        ['CONTRIBUTING.md', contributing],
      ] as const) {
        assert.match(document, /npm install/, `${name} should show the install command`);
        assert.match(document, /npm test/, `${name} should show the real test command`);
        assert.ok(
          !document.includes('npm run build'),
          `${name} must not claim a build command this repository does not have`,
        );
      }
    });
  });
});

describe('backward compatibility', () => {
  test('creating a new project still works exactly as before', async () => {
    await withTempDir(async (dir) => {
      const result = await runCli(dir, ['my-project', '--type', 'node-ts', '--yes', '--no-git']);

      assert.equal(result.code, 0);
      assert.match(result.stdout, /Repo Start created my-project/);
      assert.ok(existsSync(path.join(dir, 'my-project', 'package.json')));
      assert.ok(existsSync(path.join(dir, 'my-project', '.gitattributes')));
    });
  });

  test('a dry run of the create flow still writes nothing', async () => {
    await withTempDir(async (dir) => {
      const result = await runCli(dir, ['my-project', '--type', 'node-ts', '--yes', '--dry-run']);

      assert.equal(result.code, 0);
      assert.match(result.stdout, /No files were changed/);
      assert.deepEqual(await readdir(dir), []);
    });
  });

  test('a project may still be created in a directory literally named add', async () => {
    await withTempDir(async (dir) => {
      // `repo-start add` is the subcommand, so the directory needs a path form.
      const result = await runCli(dir, ['./add', '--type', 'generic', '--yes', '--no-git']);

      assert.equal(result.code, 0);
      assert.ok(existsSync(path.join(dir, 'add', 'README.md')));
    });
  });
});
