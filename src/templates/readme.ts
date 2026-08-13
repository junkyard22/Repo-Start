import type { CommandSet, ProjectConfig } from '../config/types.ts';
import { LICENSE_LABELS } from '../config/types.ts';
import { bashBlock, joinSections } from '../utils/strings.ts';
import { renderTree } from '../utils/tree.ts';

export interface ReadmeInput {
  config: ProjectConfig;
  commands: CommandSet;
  requirements: string[];
  /** Directory the project was generated into, used for the `cd` command. */
  directoryName: string;
  /** Every generated file path, used to render the project structure. */
  filePaths: string[];
  directories: string[];
}

function gettingStarted(input: ReadmeInput): string {
  const lines = ['git clone <repository-url>', `cd ${input.directoryName}`, ...input.commands.install];

  return ['## Getting Started', '', bashBlock(lines)].join('\n');
}

function development(input: ReadmeInput): string | null {
  const { commands } = input;
  const parts: string[] = ['## Development'];

  if (commands.dev) {
    parts.push('', 'Start the development server:', '', bashBlock([commands.dev]));
  }
  if (commands.build) {
    parts.push('', 'Build the project:', '', bashBlock([commands.build]));
  }
  if (commands.start) {
    parts.push('', 'Run the built project:', '', bashBlock([commands.start]));
  }

  return parts.length > 1 ? parts.join('\n') : null;
}

function testing(input: ReadmeInput): string | null {
  if (!input.commands.test) {
    return null;
  }

  return ['## Testing', '', bashBlock([input.commands.test])].join('\n');
}

function configuration(input: ReadmeInput): string | null {
  if (!input.config.includeEnvExample) {
    return null;
  }

  return [
    '## Configuration',
    '',
    'Copy the example environment file and adjust the values for your machine:',
    '',
    bashBlock(['cp .env.example .env']),
    '',
    '`.env` is ignored by git and should never contain committed credentials.',
  ].join('\n');
}

function projectStructure(input: ReadmeInput): string {
  const tree = renderTree(input.directoryName, input.filePaths, input.directories);

  return ['## Project Structure', '', '```text', tree, '```'].join('\n');
}

function contributing(input: ReadmeInput): string | null {
  if (!input.config.includeContributing) {
    return null;
  }

  const lines = [
    '## Contributing',
    '',
    'Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.',
  ];

  if (input.config.includeChangelog) {
    lines.push('', 'Notable changes are recorded in [CHANGELOG.md](CHANGELOG.md).');
  }

  return lines.join('\n');
}

function license(input: ReadmeInput): string | null {
  if (input.config.license === 'none') {
    return null;
  }

  const label = LICENSE_LABELS[input.config.license];

  return [
    '## License',
    '',
    `Released under the ${label} license. See [LICENSE](LICENSE) for the full text.`,
  ].join('\n');
}

/**
 * Render the README.
 *
 * Every command shown here comes from the preset's CommandSet, which is the
 * same object the CI workflow, AGENTS.md and CONTRIBUTING.md are built from.
 * Sections with nothing real to say are omitted rather than stubbed out.
 */
export function renderReadme(input: ReadmeInput): string {
  const requirements =
    input.requirements.length > 0
      ? ['## Requirements', '', ...input.requirements.map((item) => `- ${item}`)].join('\n')
      : null;

  return joinSections([
    `# ${input.config.name}`,
    input.config.description,
    requirements,
    gettingStarted(input),
    development(input),
    testing(input),
    configuration(input),
    projectStructure(input),
    contributing(input),
    license(input),
  ]);
}
