import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { CommandSet } from '../src/config/types.ts';
import { ALL_TYPES, bashCommands, filesByPath, planFor } from './helpers.ts';

/**
 * The promise Repo Start makes is that the documents agree with the project.
 * These tests check that promise mechanically: every command printed in a
 * generated document, and every command run by the generated CI workflow, has
 * to come from the preset's CommandSet.
 */

function knownCommands(commands: CommandSet): Set<string> {
  const known = new Set<string>(commands.install);

  for (const command of [commands.build, commands.test, commands.dev, commands.start]) {
    if (command) {
      known.add(command);
    }
  }

  return known;
}

/** Commands that belong to no preset because every project shares them. */
function isUniversalCommand(command: string): boolean {
  return (
    command.startsWith('git clone') ||
    command.startsWith('cd ') ||
    command === 'cp .env.example .env'
  );
}

describe('generated documents only show commands the project supports', () => {
  for (const type of ALL_TYPES) {
    test(`${type}`, () => {
      const plan = planFor({ type, includeCi: true });
      const files = filesByPath(plan);
      const known = knownCommands(plan.commands);

      for (const document of ['README.md', 'AGENTS.md', 'CONTRIBUTING.md']) {
        const contents = files.get(document);

        assert.ok(contents, `Expected ${document} to be generated`);

        for (const command of bashCommands(contents)) {
          assert.ok(
            known.has(command) || isUniversalCommand(command),
            `${document} shows "${command}", which is not a command of the ${type} preset`,
          );
        }
      }
    });
  }
});

describe('CI workflows only run commands the project supports', () => {
  for (const type of ALL_TYPES) {
    test(`${type}`, () => {
      const plan = planFor({ type, includeCi: true });
      const workflow = filesByPath(plan).get('.github/workflows/ci.yml');

      if (!workflow) {
        // Presets without a build or test command must say why, not guess.
        assert.equal(plan.notes.length, 1);
        return;
      }

      const known = knownCommands(plan.commands);
      const runSteps = [...workflow.matchAll(/^\s*- run: (.+)$/gm)].map((match) => match[1] ?? '');

      assert.ok(runSteps.length > 0, 'A generated workflow must run something');

      for (const step of runSteps) {
        const deterministicNpmInstall = step === 'npm ci' && known.has('npm install');

        assert.ok(
          known.has(step) || deterministicNpmInstall,
          `CI runs "${step}", which is not a command of the ${type} preset`,
        );
      }
    });
  }
});

describe('npm scripts referenced by documents exist in package.json', () => {
  for (const type of ['node-ts', 'react-ts'] as const) {
    test(`${type}`, () => {
      const plan = planFor({ type, includeCi: true });
      const manifestSource = filesByPath(plan).get('package.json');

      assert.ok(manifestSource, 'Expected package.json to be generated');

      const manifest = JSON.parse(manifestSource) as { scripts?: Record<string, string> };
      const scripts = manifest.scripts ?? {};

      for (const command of knownCommands(plan.commands)) {
        if (!command.startsWith('npm')) {
          continue;
        }

        const scriptName = command.startsWith('npm run ')
          ? command.slice('npm run '.length)
          : command.slice('npm '.length);

        if (scriptName === 'install') {
          continue;
        }

        assert.ok(
          scripts[scriptName],
          `Documents run "${command}" but package.json has no "${scriptName}" script`,
        );
      }
    });
  }
});

describe('the pull request template matches the project', () => {
  test('mentions the real test command', () => {
    const plan = planFor({ type: 'python' });
    const template = filesByPath(plan).get('.github/pull_request_template.md');

    assert.ok(template);
    assert.match(template, /`pytest`/);
  });

  test('says nothing about tests when the preset has none', () => {
    const plan = planFor({ type: 'generic', includePullRequestTemplate: true });
    const template = filesByPath(plan).get('.github/pull_request_template.md');

    assert.ok(template);
    assert.ok(!template.includes('Tests pass locally'));
  });
});
