import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parseCliArgs } from '../src/cli/args.ts';
import { promptForConfig } from '../src/cli/prompts.ts';
import type { PromptResult } from '../src/cli/prompts.ts';
import { scriptedPrompter } from './helpers.ts';

/** Drive the prompts with a scripted set of answers, one per question. */
const scripted = scriptedPrompter;

async function runPrompts(answers: string[], argv: string[] = []): Promise<PromptResult> {
  const { prompter } = scripted(answers);

  return promptForConfig(
    {
      options: parseCliArgs(argv),
      directoryName: null,
      author: 'Test Author',
      year: 2026,
    },
    prompter,
  );
}

describe('the prompt helpers', () => {
  test('an empty answer takes the default', async () => {
    const { prompter } = scripted(['']);

    assert.equal(await prompter.text('Project name', 'my-project'), 'my-project');
    prompter.close();
  });

  test('a select accepts a number and falls back to the default', async () => {
    const choices = [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ];
    const { prompter, transcript } = scripted(['2', '']);

    assert.equal(await prompter.select('Pick:', choices, 'a'), 'b');
    assert.equal(await prompter.select('Pick:', choices, 'b'), 'b');
    assert.match(transcript(), /1\) A/);
    prompter.close();
  });

  test('a confirm understands y, n and Enter', async () => {
    const { prompter } = scripted(['y', 'no', '']);

    assert.equal(await prompter.confirm('Sure?', false), true);
    assert.equal(await prompter.confirm('Sure?', true), false);
    assert.equal(await prompter.confirm('Sure?', true), true);
    prompter.close();
  });

  test('an invalid answer is rejected and asked again', async () => {
    const { prompter, transcript } = scripted(['bad:name', 'good-name']);
    const name = await prompter.text('Project name', 'fallback', (value) =>
      value.includes(':') ? ['No colons allowed.'] : [],
    );

    assert.equal(name, 'good-name');
    assert.match(transcript(), /No colons allowed\./);
    prompter.close();
  });
});

describe('the interactive flow', () => {
  test('pressing Enter through every question gives a sensible repository', async () => {
    const result = await runPrompts([]);

    assert.equal(result.config.name, 'my-project');
    assert.equal(result.directoryName, 'my-project');
    assert.equal(result.config.type, 'generic');
    assert.equal(result.config.visibility, 'public');
    assert.equal(result.config.license, 'mit');
    assert.equal(result.config.initializeGit, true);
    assert.equal(result.config.includeAgents, true);
    // The generic preset has no CI, so the question is never asked.
    assert.equal(result.config.includeCi, false);
  });

  test('answers flow into the configuration', async () => {
    const result = await runPrompts([
      'Ledger Tools', // project name
      '2', // project type: Node.js + TypeScript
      'Reconciles invoices.', // description
      'n', // initialize git
      '2', // visibility: private
      'y', // include a license
      '3', // GPL-3.0
      'n', // .env.example
      'y', // AGENTS.md
      'n', // CONTRIBUTING.md
      'n', // CHANGELOG.md
      'n', // docs/
      'y', // CI
      'n', // issue templates
      'n', // pull request template
    ]);

    assert.equal(result.config.name, 'Ledger Tools');
    assert.equal(result.config.packageName, 'ledger-tools');
    assert.equal(result.directoryName, 'ledger-tools');
    assert.equal(result.config.type, 'node-ts');
    assert.equal(result.config.description, 'Reconciles invoices.');
    assert.equal(result.config.initializeGit, false);
    assert.equal(result.config.visibility, 'private');
    assert.equal(result.config.license, 'gpl-3.0');
    assert.equal(result.config.includeEnvExample, false);
    assert.equal(result.config.includeAgents, true);
    assert.equal(result.config.includeCi, true);
    assert.equal(result.config.includePullRequestTemplate, false);
  });

  test('questions already answered on the command line are not asked again', async () => {
    const { prompter, transcript } = scripted([]);
    const result = await promptForConfig(
      {
        options: parseCliArgs(['my-project', '--type', 'python', '--license', 'none', '--no-docs']),
        directoryName: 'my-project',
        author: 'Test Author',
        year: 2026,
      },
      prompter,
    );

    assert.equal(result.config.type, 'python');
    assert.equal(result.config.license, 'none');
    assert.equal(result.config.includeDocs, false);
    assert.ok(!transcript().includes('Project type:'));
    assert.ok(!transcript().includes('Which license?'));
    assert.ok(!transcript().includes('Include docs/?'));
  });
});
