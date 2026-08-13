import { parseArgs } from 'node:util';

import { LICENSE_IDS, PROJECT_TYPES } from '../config/types.ts';
import type { LicenseId, ProjectType, Visibility } from '../config/types.ts';
import { RepoStartError, isLicenseId, isProjectType } from '../config/validate.ts';

/**
 * Command line options.
 *
 * Every field that mirrors a prompt is optional: `undefined` means "the user
 * did not say", which is what lets the prompt layer know what still needs
 * asking.
 */
export interface CliOptions {
  /** `create` scaffolds a new project, `add` hardens an existing one. */
  command: 'create' | 'add';
  directory: string | null;
  name: string | undefined;
  description: string | undefined;
  type: ProjectType | undefined;
  license: LicenseId | undefined;
  author: string | undefined;
  visibility: Visibility | undefined;
  initializeGit: boolean | undefined;
  includeEnvExample: boolean | undefined;
  includeAgents: boolean | undefined;
  includeContributing: boolean | undefined;
  includeChangelog: boolean | undefined;
  includeDocs: boolean | undefined;
  includeCi: boolean | undefined;
  includeIssueTemplate: boolean | undefined;
  includePullRequestTemplate: boolean | undefined;
  yes: boolean;
  dryRun: boolean;
  force: boolean;
  help: boolean;
  version: boolean;
}

const BOOLEAN_PAIRS = {
  initializeGit: ['git', 'no-git'],
  includeEnvExample: ['env', 'no-env'],
  includeAgents: ['agents', 'no-agents'],
  includeContributing: ['contributing', 'no-contributing'],
  includeChangelog: ['changelog', 'no-changelog'],
  includeDocs: ['docs', 'no-docs'],
  includeCi: ['ci', 'no-ci'],
  includeIssueTemplate: ['issue-template', 'no-issue-template'],
  includePullRequestTemplate: ['pr-template', 'no-pr-template'],
} as const;

export const HELP_TEXT = `Repo Start — create the boring foundational files of a new repository.

Usage
  repo-start [directory] [options]        Create a new repository
  repo-start add [directory] [options]    Audit an existing repository and fill the gaps

Project
  --name <name>              Project name (defaults to the directory name)
  --description <text>       One line description
  --type <type>              ${PROJECT_TYPES.join(' | ')}

Repository
  --license <license>        ${LICENSE_IDS.join(' | ')}
  --author <name>            Copyright holder for the LICENSE file
  --public | --private       Repository visibility (default: public)
  --git | --no-git           Initialize a git repository (default: yes)

Development files
  --env | --no-env                     .env.example
  --agents | --no-agents               AGENTS.md
  --contributing | --no-contributing   CONTRIBUTING.md
  --changelog | --no-changelog         CHANGELOG.md
  --docs | --no-docs                   docs/
  --ci | --no-ci                       GitHub Actions workflow
  --issue-template | --no-issue-template
  --pr-template | --no-pr-template

Behavior
  -y, --yes                  Accept the defaults and skip all prompts
      --dry-run              Show what would be created, change nothing
      --force                Overwrite existing files (use with care)
  -h, --help                 Show this help
  -v, --version              Show the version

The add command uses only --dry-run, --yes and --type. It never overwrites an
existing file, and never touches source code, licenses or git history.

Examples
  repo-start
  repo-start my-project --type node-ts
  repo-start my-project --type python --yes
  repo-start my-project --dry-run
  repo-start add
  repo-start add ./some-project --dry-run

Start clean. Build faster.
`;

function pickBoolean(
  values: Record<string, unknown>,
  positive: string,
  negative: string,
): boolean | undefined {
  const enabled = values[positive] === true;
  const disabled = values[negative] === true;

  if (enabled && disabled) {
    throw new RepoStartError(`--${positive} and --${negative} cannot be used together.`);
  }
  if (enabled) {
    return true;
  }
  if (disabled) {
    return false;
  }
  return undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Parse argv (without the node and script entries) into CliOptions. */
export function parseCliArgs(argv: string[]): CliOptions {
  let parsed;

  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        name: { type: 'string' },
        description: { type: 'string' },
        type: { type: 'string' },
        license: { type: 'string' },
        author: { type: 'string' },
        public: { type: 'boolean' },
        private: { type: 'boolean' },
        git: { type: 'boolean' },
        'no-git': { type: 'boolean' },
        env: { type: 'boolean' },
        'no-env': { type: 'boolean' },
        agents: { type: 'boolean' },
        'no-agents': { type: 'boolean' },
        contributing: { type: 'boolean' },
        'no-contributing': { type: 'boolean' },
        changelog: { type: 'boolean' },
        'no-changelog': { type: 'boolean' },
        docs: { type: 'boolean' },
        'no-docs': { type: 'boolean' },
        ci: { type: 'boolean' },
        'no-ci': { type: 'boolean' },
        'issue-template': { type: 'boolean' },
        'no-issue-template': { type: 'boolean' },
        'pr-template': { type: 'boolean' },
        'no-pr-template': { type: 'boolean' },
        yes: { type: 'boolean', short: 'y' },
        'dry-run': { type: 'boolean' },
        force: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new RepoStartError(message, ['Run `repo-start --help` to see the available options.']);
  }

  const values = parsed.values as Record<string, unknown>;

  // `add` is the only subcommand. Everything else keeps the original shape:
  // an optional directory and nothing more.
  const isAdd = parsed.positionals[0] === 'add';
  const positionals = isAdd ? parsed.positionals.slice(1) : parsed.positionals;

  if (positionals.length > 1) {
    throw new RepoStartError('Expected at most one directory argument.', [
      `Received: ${positionals.join(', ')}`,
    ]);
  }

  if (isAdd && values['force'] === true) {
    throw new RepoStartError('--force is not used by `repo-start add`.', [
      'The add command never overwrites an existing file.',
    ]);
  }

  const type = optionalString(values['type']);

  if (type !== undefined && !isProjectType(type)) {
    throw new RepoStartError(`Unknown project type "${type}".`, [
      `Expected one of: ${PROJECT_TYPES.join(', ')}`,
    ]);
  }

  const license = optionalString(values['license']);

  if (license !== undefined && !isLicenseId(license)) {
    throw new RepoStartError(`Unknown license "${license}".`, [
      `Expected one of: ${LICENSE_IDS.join(', ')}`,
    ]);
  }

  const visibility = pickBoolean(values, 'private', 'public');

  return {
    command: isAdd ? 'add' : 'create',
    directory: positionals[0] ?? null,
    name: optionalString(values['name']),
    description: optionalString(values['description']),
    type,
    license,
    author: optionalString(values['author']),
    visibility: visibility === undefined ? undefined : visibility ? 'private' : 'public',
    initializeGit: pickBoolean(values, ...BOOLEAN_PAIRS.initializeGit),
    includeEnvExample: pickBoolean(values, ...BOOLEAN_PAIRS.includeEnvExample),
    includeAgents: pickBoolean(values, ...BOOLEAN_PAIRS.includeAgents),
    includeContributing: pickBoolean(values, ...BOOLEAN_PAIRS.includeContributing),
    includeChangelog: pickBoolean(values, ...BOOLEAN_PAIRS.includeChangelog),
    includeDocs: pickBoolean(values, ...BOOLEAN_PAIRS.includeDocs),
    includeCi: pickBoolean(values, ...BOOLEAN_PAIRS.includeCi),
    includeIssueTemplate: pickBoolean(values, ...BOOLEAN_PAIRS.includeIssueTemplate),
    includePullRequestTemplate: pickBoolean(values, ...BOOLEAN_PAIRS.includePullRequestTemplate),
    yes: values['yes'] === true,
    dryRun: values['dry-run'] === true,
    force: values['force'] === true,
    help: values['help'] === true,
    version: values['version'] === true,
  };
}
