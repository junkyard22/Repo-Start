import * as readline from 'node:readline/promises';
import type { Readable, Writable } from 'node:stream';

import { createDefaultConfig, defaultDescription, defaultLicense } from '../config/defaults.ts';
import { LICENSE_LABELS, PROJECT_TYPES, PROJECT_TYPE_LABELS } from '../config/types.ts';
import type { LicenseId, ProjectConfig, ProjectType, Visibility } from '../config/types.ts';
import { validateProjectName } from '../config/validate.ts';
import { getPreset } from '../presets/index.ts';
import { slugify } from '../utils/strings.ts';
import { bold, dim, red } from './output.ts';
import type { CliOptions } from './args.ts';

interface Choice<T> {
  value: T;
  label: string;
}

export interface PrompterStreams {
  input?: Readable;
  output?: Writable;
}

/** A tiny prompt helper over node:readline. No dependencies, no magic. */
export class Prompter {
  private readonly rl: readline.Interface;
  private readonly output: Writable;

  constructor(streams: PrompterStreams = {}) {
    const input = streams.input ?? process.stdin;

    this.output = streams.output ?? process.stdout;
    this.rl = readline.createInterface({ input, output: this.output });
    this.rl.on('SIGINT', () => {
      this.output.write('\nCancelled. Nothing was changed.\n');
      process.exit(130);
    });
  }

  /** Write a line of context that is not itself a question. */
  write(text: string): void {
    this.output.write(text);
  }

  close(): void {
    this.rl.close();
  }

  async text(
    question: string,
    defaultValue: string,
    validate?: (value: string) => string[],
  ): Promise<string> {
    for (;;) {
      const answer = (await this.rl.question(`${question} ${dim(`(${defaultValue})`)} `)).trim();
      const value = answer.length > 0 ? answer : defaultValue;
      const problems = validate ? validate(value) : [];

      if (problems.length === 0) {
        return value;
      }

      for (const problem of problems) {
        this.output.write(`${red('!')} ${problem}\n`);
      }
    }
  }

  async select<T>(question: string, choices: Choice<T>[], defaultValue: T): Promise<T> {
    const defaultIndex = Math.max(
      0,
      choices.findIndex((choice) => choice.value === defaultValue),
    );

    this.output.write(`${question}\n`);

    choices.forEach((choice, index) => {
      const marker = index === defaultIndex ? dim(' (default)') : '';
      this.output.write(`  ${index + 1}) ${choice.label}${marker}\n`);
    });

    for (;;) {
      const answer = (await this.rl.question(`  Choice ${dim(`(${defaultIndex + 1})`)} `)).trim();

      if (answer.length === 0) {
        return choices[defaultIndex]!.value;
      }

      const index = Number.parseInt(answer, 10) - 1;

      if (Number.isInteger(index) && index >= 0 && index < choices.length) {
        return choices[index]!.value;
      }

      this.output.write(`${red('!')} Enter a number between 1 and ${choices.length}.\n`);
    }
  }

  async confirm(question: string, defaultValue: boolean): Promise<boolean> {
    const hint = defaultValue ? 'Y/n' : 'y/N';

    for (;;) {
      const answer = (await this.rl.question(`${question} ${dim(`(${hint})`)} `)).trim().toLowerCase();

      if (answer.length === 0) {
        return defaultValue;
      }
      if (answer === 'y' || answer === 'yes') {
        return true;
      }
      if (answer === 'n' || answer === 'no') {
        return false;
      }

      this.output.write(`${red('!')} Answer y or n.\n`);
    }
  }
}

export interface PromptInput {
  options: CliOptions;
  /** Directory from the command line, or null when the user gave none. */
  directoryName: string | null;
  author: string;
  year: number;
}

export interface PromptResult {
  config: ProjectConfig;
  directoryName: string;
}

/**
 * Ask only for what the command line did not already answer.
 *
 * The result is a complete ProjectConfig; from here on nothing else in the
 * program knows a prompt ever happened.
 */
export async function promptForConfig(
  input: PromptInput,
  prompter: Prompter = new Prompter(),
): Promise<PromptResult> {
  const { options } = input;

  try {
    prompter.write(`${bold('Repo Start')}\n${dim('Create the boring stuff correctly.')}\n\n`);

    const name =
      options.name ??
      (await prompter.text(
        'Project name',
        input.directoryName ?? 'my-project',
        validateProjectName,
      ));

    const type =
      options.type ??
      (await prompter.select<ProjectType>(
        'Project type:',
        PROJECT_TYPES.map((value) => ({ value, label: PROJECT_TYPE_LABELS[value] })),
        'generic',
      ));

    const description =
      options.description ?? (await prompter.text('Description', defaultDescription(type)));

    prompter.write('\n');

    const initializeGit =
      options.initializeGit ?? (await prompter.confirm('Initialize a git repository?', true));

    const visibility =
      options.visibility ??
      (await prompter.select<Visibility>(
        'Visibility:',
        [
          { value: 'public', label: 'Public' },
          { value: 'private', label: 'Private' },
        ],
        'public',
      ));

    let license: LicenseId;

    if (options.license !== undefined) {
      license = options.license;
    } else if (await prompter.confirm('Include a license?', visibility === 'public')) {
      license = await prompter.select<LicenseId>(
        'Which license?',
        [
          { value: 'mit', label: LICENSE_LABELS.mit },
          { value: 'apache-2.0', label: LICENSE_LABELS['apache-2.0'] },
          { value: 'gpl-3.0', label: LICENSE_LABELS['gpl-3.0'] },
        ],
        defaultLicense(visibility) === 'none' ? 'mit' : defaultLicense(visibility),
      );
    } else {
      license = 'none';
    }

    const defaults = createDefaultConfig({
      name,
      type,
      visibility,
      author: options.author ?? input.author,
      year: input.year,
    });

    prompter.write('\n');

    const includeEnvExample =
      options.includeEnvExample ?? (await prompter.confirm('Include .env.example?', defaults.includeEnvExample));
    const includeAgents =
      options.includeAgents ?? (await prompter.confirm('Include AGENTS.md?', defaults.includeAgents));
    const includeContributing =
      options.includeContributing ??
      (await prompter.confirm('Include CONTRIBUTING.md?', defaults.includeContributing));
    const includeChangelog =
      options.includeChangelog ?? (await prompter.confirm('Include CHANGELOG.md?', defaults.includeChangelog));
    const includeDocs =
      options.includeDocs ?? (await prompter.confirm('Include docs/?', defaults.includeDocs));

    // Asking about CI would be dishonest for a preset that has no build or
    // test command to run.
    const presetHasCi = getPreset(type).ci(defaults) !== null;
    const includeCi = presetHasCi
      ? (options.includeCi ?? (await prompter.confirm('Include GitHub Actions CI?', defaults.includeCi)))
      : false;

    const includeIssueTemplate =
      options.includeIssueTemplate ??
      (await prompter.confirm('Include GitHub issue templates?', defaults.includeIssueTemplate));
    const includePullRequestTemplate =
      options.includePullRequestTemplate ??
      (await prompter.confirm(
        'Include GitHub pull request template?',
        defaults.includePullRequestTemplate,
      ));

    prompter.write('\n');

    const config: ProjectConfig = {
      ...defaults,
      description,
      initializeGit,
      license,
      includeEnvExample,
      includeAgents,
      includeContributing,
      includeChangelog,
      includeDocs,
      includeCi,
      includeIssueTemplate,
      includePullRequestTemplate,
    };

    return { config, directoryName: input.directoryName ?? slugify(name) };
  } finally {
    prompter.close();
  }
}
