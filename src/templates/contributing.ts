import type { CommandSet, ProjectConfig } from '../config/types.ts';
import { bashBlock, joinSections } from '../utils/strings.ts';

export interface ContributingInput {
  config: ProjectConfig;
  commands: CommandSet;
  /** Directory the project lives in, so `cd` matches the README. */
  directoryName: string;
}

/** A short contribution guide whose commands match the generated project. */
export function renderContributing(input: ContributingInput): string {
  const { commands, config } = input;

  const setup = [
    '## Setup',
    '',
    bashBlock(['git clone <repository-url>', `cd ${input.directoryName}`, ...commands.install]),
  ].join('\n');

  const changes = [
    '## Making Changes',
    '',
    '1. Create a branch off `main`, for example `feature/short-description` or `fix/short-description`.',
    '2. Keep each pull request focused on one change.',
    '3. Write clear commit messages that explain why the change was made.',
    '4. Update documentation when behavior or commands change.',
  ];

  if (config.includeChangelog) {
    changes.push('5. Add a line to the `Unreleased` section of `CHANGELOG.md` for user visible changes.');
  }

  const testingLines: string[] = ['## Testing'];

  if (commands.test) {
    testingLines.push('', 'Run the test suite before opening a pull request:', '', bashBlock([commands.test]));

    if (commands.build) {
      testingLines.push('', 'Make sure the project still builds:', '', bashBlock([commands.build]));
    }
  } else {
    testingLines.push(
      '',
      'This project does not have an automated test suite yet. Describe how you verified your change in the pull request.',
    );
  }

  const pullRequests = [
    '## Pull Requests',
    '',
    '- Describe what changed and why.',
    '- Link any related issue.',
    '- Note anything a reviewer should pay particular attention to.',
    '- Make sure CI is green before requesting a review.',
  ];

  if (!config.includeCi) {
    pullRequests.pop();
  }

  return joinSections([
    '# Contributing',
    `Thanks for taking the time to contribute to ${config.name}.`,
    setup,
    changes.join('\n'),
    testingLines.join('\n'),
    pullRequests.join('\n'),
  ]);
}
