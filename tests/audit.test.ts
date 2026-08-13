import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, test } from 'node:test';

import {
  analyzeRepository,
  fencedCommands,
  parseNpmCommand,
  workflowCommands,
} from '../src/audit/analyze.ts';
import { inspectRepository } from '../src/audit/inspect.ts';
import { buildAddPlan, buildProposals, configFromRepoState } from '../src/audit/plan.ts';
import type { AuditCode, AuditIssue, AuditItem, RepoAudit } from '../src/audit/types.ts';
import { RepoStartError } from '../src/config/validate.ts';
import { packageJson, withTempDir, writeRepo } from './helpers.ts';

/** Inspect and analyse a fixture directory the way `repo-start add` does. */
function auditOf(dir: string): RepoAudit {
  return analyzeRepository(inspectRepository(dir));
}

function codesOf(items: (AuditItem | AuditIssue)[]): AuditCode[] {
  return items.map((item) => item.code);
}

function findIssue(issues: AuditIssue[], code: AuditCode): AuditIssue {
  const issue = issues.find((candidate) => candidate.code === code);

  if (!issue) {
    throw new Error(`Expected a ${code} issue. Got: ${codesOf(issues).join(', ') || 'none'}`);
  }

  return issue;
}

const NODE_TS_REPO = {
  'package.json': packageJson({
    name: 'demo-app',
    description: 'A demo application.',
    scripts: { build: 'tsc', test: 'node --test', typecheck: 'tsc --noEmit' },
    devDependencies: { typescript: '^5.9.0' },
  }),
  'package-lock.json': '{}\n',
  'tsconfig.json': '{}\n',
  'README.md': '# Demo\n',
};

describe('reading an existing repository', () => {
  test('recognises a Node.js and TypeScript project from its own manifest', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, NODE_TS_REPO);

      const state = inspectRepository(dir);

      assert.equal(state.detectedType, 'node-ts');
      assert.equal(state.detectionIsConfident, true);
      assert.equal(state.packageManager, 'npm');
      assert.equal(state.hasTypeScript, true);
      assert.equal(state.hasReact, false);
      assert.equal(state.projectName, 'demo-app');
      assert.equal(state.projectDescription, 'A demo application.');
      assert.equal(state.commands.build, 'npm run build');
      assert.equal(state.commands.test, 'npm test');
      assert.ok(state.files.has('README.md'));
      assert.ok(!state.files.has('.gitignore'));
    });
  });

  test('spells the commands the way the detected package manager does', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, {
        'package.json': packageJson({ name: 'demo', scripts: { build: 'tsc', test: 'vitest' } }),
        'yarn.lock': '',
        'tsconfig.json': '{}\n',
      });

      const state = inspectRepository(dir);

      assert.equal(state.packageManager, 'yarn');
      assert.deepEqual(state.commands.install, ['yarn install']);
      assert.equal(state.commands.build, 'yarn build');
      assert.equal(state.commands.test, 'yarn test');
    });
  });

  test('claims only the commands the repository actually has', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, {
        'package.json': packageJson({ name: 'demo', scripts: { build: 'tsc' } }),
        'tsconfig.json': '{}\n',
      });

      const state = inspectRepository(dir);

      assert.equal(state.commands.build, 'npm run build');
      assert.equal(state.commands.test, undefined);
      assert.equal(state.commands.dev, undefined);
    });
  });

  test('reads a Python project and only claims pytest when it sees pytest', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, {
        'pyproject.toml': [
          '[project]',
          'name = "demo-py"',
          'description = "A demo package."',
          '',
          '[project.optional-dependencies]',
          'dev = ["pytest"]',
          '',
        ].join('\n'),
      });

      const state = inspectRepository(dir);

      assert.equal(state.detectedType, 'python');
      assert.equal(state.detectionIsConfident, true);
      assert.equal(state.projectName, 'demo-py');
      assert.equal(state.projectDescription, 'A demo package.');
      assert.equal(state.commands.test, 'pytest');
      assert.ok(state.commands.install.includes('python -m pip install -e ".[dev]"'));
    });
  });

  test('a Python project without pytest gets no test command', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, { 'requirements.txt': 'requests\n' });

      const state = inspectRepository(dir);

      assert.equal(state.detectedType, 'python');
      assert.equal(state.commands.test, undefined);
      assert.ok(state.commands.install.includes('python -m pip install -r requirements.txt'));
    });
  });

  test('a React project is only react-ts when TypeScript is really there', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, {
        'package.json': packageJson({
          name: 'demo-ui',
          dependencies: { react: '^19.0.0' },
          devDependencies: { typescript: '^5.9.0' },
        }),
      });

      const state = inspectRepository(dir);

      assert.equal(state.hasReact, true);
      assert.equal(state.detectedType, 'react-ts');
      assert.equal(state.detectionIsConfident, true);
    });
  });

  test('a project it cannot classify says so instead of guessing', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, {
        'package.json': packageJson({ name: 'demo', dependencies: { react: '^19.0.0' } }),
      });

      const state = inspectRepository(dir);

      assert.equal(state.detectedType, 'generic');
      assert.equal(state.detectionIsConfident, false);
    });
  });

  test('an empty directory is generic and openly unconfident', async () => {
    await withTempDir(async (dir) => {
      const state = inspectRepository(dir);

      assert.equal(state.detectedType, 'generic');
      assert.equal(state.detectionIsConfident, false);
      assert.equal(state.files.size, 0);
      assert.deepEqual(state.workflows, []);
    });
  });

  test('a malformed package.json is treated as absent rather than crashing', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, { 'package.json': '{ this is not json' });

      const state = inspectRepository(dir);

      assert.equal(state.packageScripts, undefined);
      assert.equal(state.projectName, undefined);
      // It is still visibly a Node project, so the install command stands;
      // no script is claimed, because none could be read.
      assert.deepEqual(state.commands, { install: ['npm install'] });
    });
  });

  test('a manifest written with a byte order mark still parses', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, {
        'package.json': String.fromCharCode(0xfeff) + packageJson({ name: 'demo-bom' }),
      });

      assert.equal(inspectRepository(dir).projectName, 'demo-bom');
    });
  });

  test('lists workflow files in a stable order and reads their contents', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, {
        '.github/workflows/release.yaml': 'name: Release\n',
        '.github/workflows/ci.yml': 'name: CI\n',
        '.github/workflows/notes.txt': 'ignored\n',
      });

      const state = inspectRepository(dir);

      assert.deepEqual(state.workflows, [
        '.github/workflows/ci.yml',
        '.github/workflows/release.yaml',
      ]);
      assert.equal(state.documents.get('.github/workflows/ci.yml'), 'name: CI\n');
    });
  });

  test('refuses a path that is missing or is not a directory', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, { 'a-file.txt': 'x' });

      assert.throws(
        () => inspectRepository(path.join(dir, 'nowhere')),
        (error: unknown) => error instanceof RepoStartError && /No such directory/.test(error.message),
      );
      assert.throws(
        () => inspectRepository(path.join(dir, 'a-file.txt')),
        (error: unknown) => error instanceof RepoStartError && /Not a directory/.test(error.message),
      );
    });
  });
});

describe('command lines inside documents', () => {
  test('only shell fences are read, and comments are not commands', () => {
    const markdown = [
      '# Demo', // 1
      '', // 2
      '```bash', // 3
      'npm install', // 4
      '# install first', // 5
      'npm test', // 6
      '```', // 7
      '', // 8
      '```ts', // 9
      'const x = 1;', // 10
      '```', // 11
      '',
    ].join('\n');

    assert.deepEqual(fencedCommands(markdown), [
      { line: 4, raw: 'npm install', command: 'npm install' },
      { line: 6, raw: 'npm test', command: 'npm test' },
    ]);
  });

  test('a fence with no language is not treated as a command list', () => {
    assert.deepEqual(fencedCommands(['```', 'npm test', '```'].join('\n')), []);
  });

  test('workflow run steps are read, and block scalars are left alone', () => {
    const yaml = [
      'jobs:', // 1
      '  build:', // 2
      '    steps:', // 3
      '      - run: npm install', // 4
      '      - run: |', // 5
      '          npm run build', // 6
      '      - run: npm test', // 7
      '',
    ].join('\n');

    assert.deepEqual(
      workflowCommands(yaml).map((found) => [found.line, found.command]),
      [
        [4, 'npm install'],
        [7, 'npm test'],
      ],
    );
  });

  test('recognises the npm invocations it understands', () => {
    assert.deepEqual(parseNpmCommand('npm install'), { kind: 'install' });
    assert.deepEqual(parseNpmCommand('npm ci'), { kind: 'install' });
    assert.deepEqual(parseNpmCommand('npm run build'), { kind: 'run', script: 'build' });
    assert.deepEqual(parseNpmCommand('npm test'), { kind: 'shorthand', script: 'test' });
  });

  test('says nothing about a command line it cannot read plainly', () => {
    assert.equal(parseNpmCommand('npm run build && npm test'), null);
    assert.equal(parseNpmCommand('npm test -- --watch'), null);
    assert.equal(parseNpmCommand('npm run'), null);
    assert.equal(parseNpmCommand('npm run --silent'), null);
    assert.equal(parseNpmCommand('pnpm test'), null);
    assert.equal(parseNpmCommand('node --test'), null);
    assert.equal(parseNpmCommand('npm publish'), null);
  });
});

describe('auditing a repository', () => {
  test('separates the files that are there from the ones that are not', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, {
        ...NODE_TS_REPO,
        '.gitignore': 'node_modules/\n',
        'docs/README.md': '# Docs\n',
      });

      const audit = auditOf(dir);

      assert.ok(codesOf(audit.present).includes('missing-readme'));
      assert.ok(codesOf(audit.present).includes('missing-gitignore'));
      assert.ok(codesOf(audit.present).includes('missing-docs'));
      assert.ok(codesOf(audit.missing).includes('missing-gitattributes'));
      assert.ok(codesOf(audit.missing).includes('missing-agents'));
      assert.ok(codesOf(audit.missing).includes('missing-ci'));
      assert.equal(audit.present.length + audit.missing.length, 11);
    });
  });

  test('an empty directory is entirely missing, and the ambiguity is reported', async () => {
    await withTempDir(async (dir) => {
      const audit = auditOf(dir);

      assert.equal(audit.present.length, 0);
      assert.equal(audit.missing.length, 11);
      assert.ok(codesOf(audit.warnings).includes('detection-ambiguous'));
    });
  });

  test('a documented script that does not exist is an issue', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, {
        ...NODE_TS_REPO,
        'README.md': ['# Demo', '', '```bash', 'npm run lint', '```', ''].join('\n'),
      });

      const issue = findIssue(auditOf(dir).issues, 'doc-command-missing');

      assert.match(issue.message, /README\.md documents `npm run lint`/);
      assert.deepEqual(issue.details, ['README.md:4']);
      assert.equal(issue.fix, undefined);
    });
  });

  test('`npm run test` where npm says `npm test` is a warning with a precise fix', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, {
        ...NODE_TS_REPO,
        'CONTRIBUTING.md': ['# Contributing', '', '```bash', 'npm run test', '```', ''].join('\n'),
      });

      const warning = findIssue(auditOf(dir).warnings, 'doc-command-mismatch');

      assert.equal(warning.file, 'CONTRIBUTING.md');
      assert.equal(warning.fix?.description, 'npm run test → npm test');
      assert.deepEqual(warning.fix?.edits, [
        { line: 4, before: 'npm run test', after: ['npm test'] },
      ]);
    });
  });

  test('a documented command with extra arguments is left alone', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, {
        ...NODE_TS_REPO,
        'README.md': ['# Demo', '', '```bash', 'npm run test -- --watch', '```', ''].join('\n'),
      });

      const audit = auditOf(dir);

      assert.equal(audit.issues.length, 0);
      assert.equal(codesOf(audit.warnings).includes('doc-command-mismatch'), false);
    });
  });

  test('CI scripts are confirmed when they exist and reported when they do not', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, {
        ...NODE_TS_REPO,
        '.github/workflows/ci.yml': [
          'jobs:',
          '  build:',
          '    steps:',
          '      - run: npm install',
          '      - run: npm run build',
          '      - run: npm run lint',
          '',
        ].join('\n'),
      });

      const audit = auditOf(dir);
      const issue = findIssue(audit.issues, 'ci-command-missing');

      assert.match(issue.message, /CI runs `npm run lint`/);
      assert.deepEqual(issue.details, ['.github/workflows/ci.yml:6']);
      assert.deepEqual(
        audit.verified.map((item) => item.label),
        ['CI build command exists'],
      );
    });
  });

  test('command checks are skipped, out loud, for a package manager it cannot read', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, {
        'package.json': packageJson({ name: 'demo', scripts: { test: 'vitest' } }),
        'pnpm-lock.yaml': '',
        'tsconfig.json': '{}\n',
        'README.md': ['```bash', 'pnpm run test', '```', ''].join('\n'),
      });

      const audit = auditOf(dir);

      assert.ok(codesOf(audit.warnings).includes('check-skipped'));
      assert.equal(audit.issues.length, 0);
    });
  });

  test('an unreadable package.json is named as the reason the checks were skipped', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, { 'package.json': '{ this is not json' });

      const warning = findIssue(auditOf(dir).warnings, 'check-skipped');

      assert.match(warning.message, /package\.json could not be read/);
      assert.equal(warning.message.includes('only validates npm commands'), false);
    });
  });

  test('the ignore check is skipped when there is no git repository to ask', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, { '.env.example': 'LOG_LEVEL=info\n' });

      const state = inspectRepository(dir);

      // The fixture directory is not a git repository, so git was never asked.
      assert.equal(state.isGitRepository, false);
      assert.equal(state.envExampleIgnore, undefined);

      const warning = findIssue(analyzeRepository(state).warnings, 'check-skipped');

      assert.match(warning.message, /not a git repository/);
    });
  });
});

describe('what add offers to do', () => {
  test('offers the missing hygiene files, and never a README or a license', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, NODE_TS_REPO);

      const proposals = buildProposals(auditOf(dir));
      const ids = proposals.map((proposal) => proposal.id);

      assert.deepEqual(ids, [
        'gitignore',
        'gitattributes',
        'env-example',
        'agents',
        'contributing',
        'changelog',
        'docs',
        'issue-template',
        'issue-template-feature',
        'pr-template',
        'ci',
      ]);
      assert.equal(
        proposals.some((proposal) => /^README\.md$|^LICENSE$/.test(proposal.path)),
        false,
      );
    });
  });

  test('the second issue template follows the first instead of being asked twice', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, NODE_TS_REPO);

      const proposals = buildProposals(auditOf(dir));
      const follower = proposals.find((proposal) => proposal.id === 'issue-template-feature');

      assert.equal(follower?.follows, 'issue-template');
      assert.equal(
        proposals.filter((proposal) => proposal.follows === undefined && proposal.id.startsWith('issue-template')).length,
        1,
      );
    });
  });

  test('every proposal has its own id, so answering one cannot accept another', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, {
        ...NODE_TS_REPO,
        'package.json': packageJson({
          name: 'demo-app',
          scripts: { build: 'tsc', test: 'node --test', start: 'node dist/index.js' },
          devDependencies: { typescript: '^5.9.0' },
        }),
        'README.md': ['```bash', 'npm run test', 'npm run start', '```', ''].join('\n'),
      });

      const ids = buildProposals(auditOf(dir)).map((proposal) => proposal.id);

      assert.equal(new Set(ids).size, ids.length);
    });
  });

  test('does not offer a workflow that would run scripts this repository lacks', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, {
        'package.json': packageJson({ name: 'demo', scripts: { test: 'node --test' } }),
        'tsconfig.json': '{}\n',
      });

      // The node-ts workflow runs `npm run build`, and there is no build script.
      const ids = buildProposals(auditOf(dir)).map((proposal) => proposal.id);

      assert.equal(ids.includes('ci'), false);
    });
  });

  test('offers no workflow at all for a project with nothing to run', async () => {
    await withTempDir(async (dir) => {
      const ids = buildProposals(auditOf(dir)).map((proposal) => proposal.id);

      assert.equal(ids.includes('ci'), false);
    });
  });

  test('takes the project name, description and license from the repository', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, NODE_TS_REPO);

      const config = configFromRepoState(inspectRepository(dir));

      assert.equal(config.name, 'demo-app');
      assert.equal(config.description, 'A demo application.');
      assert.equal(config.license, 'none');
      assert.equal(config.initializeGit, false);
    });
  });

  test('a name the templates could not use is slugified', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, { 'package.json': packageJson({ name: '@scope/demo App' }) });

      const config = configFromRepoState(inspectRepository(dir));

      assert.doesNotMatch(config.name, /[@/ ]/);
      assert.equal(config.packageName, config.name);
    });
  });
});

describe('the plan add builds from the answers', () => {
  test('only accepted proposals reach the plan', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, NODE_TS_REPO);

      const audit = auditOf(dir);
      const proposals = buildProposals(audit);
      const accepted = proposals.filter((proposal) => proposal.id === 'gitattributes');
      const plan = buildAddPlan(audit, accepted);

      assert.deepEqual(
        plan.files.map((file) => file.path),
        ['.gitattributes'],
      );
      assert.deepEqual(plan.edits, []);
      assert.deepEqual(plan.directories, []);
    });
  });

  test('planned files are sorted so the report reads the same way twice', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, NODE_TS_REPO);

      const audit = auditOf(dir);
      const plan = buildAddPlan(audit, buildProposals(audit));
      const paths = plan.files.map((file) => file.path);

      assert.deepEqual(paths, [...paths].sort((a, b) => a.localeCompare(b, 'en')));
      assert.ok(paths.includes('.github/ISSUE_TEMPLATE/bug_report.md'));
      assert.ok(paths.includes('.github/ISSUE_TEMPLATE/feature_request.md'));
    });
  });

  test('two fixes to one file become one set of edits', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, {
        ...NODE_TS_REPO,
        'package.json': packageJson({
          name: 'demo-app',
          scripts: { build: 'tsc', test: 'node --test', start: 'node dist/index.js' },
          devDependencies: { typescript: '^5.9.0' },
        }),
        'README.md': ['```bash', 'npm run test', 'npm run start', '```', ''].join('\n'),
      });

      const audit = auditOf(dir);
      const fixes = buildProposals(audit).filter((proposal) => proposal.kind === 'fix');
      const plan = buildAddPlan(audit, fixes);

      assert.equal(fixes.length, 2);
      assert.equal(plan.edits.length, 1);
      assert.equal(plan.edits[0]?.path, 'README.md');
      assert.equal(plan.edits[0]?.edits.length, 2);
      assert.deepEqual(plan.edits[0]?.summary, [
        'npm run test → npm test',
        'npm run start → npm start',
      ]);
    });
  });

  test('says plainly that it will not write a README for an existing project', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, { 'package.json': packageJson({ name: 'demo' }) });

      const audit = auditOf(dir);
      const plan = buildAddPlan(audit, []);

      assert.equal(plan.notes.length, 1);
      assert.match(plan.notes[0] ?? '', /README\.md is missing/);
    });
  });

  test('no note about the README when the repository already has one', async () => {
    await withTempDir(async (dir) => {
      await writeRepo(dir, NODE_TS_REPO);

      assert.deepEqual(buildAddPlan(auditOf(dir), []).notes, []);
    });
  });
});
