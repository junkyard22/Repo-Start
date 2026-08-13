#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { runAddCommand } from './cli/add.ts';
import type { AddCommandOptions } from './cli/add.ts';
import { HELP_TEXT, parseCliArgs } from './cli/args.ts';
import type { CliOptions } from './cli/args.ts';
import { renderDryRun, renderError, renderSummary } from './cli/output.ts';
import { promptForConfig } from './cli/prompts.ts';
import { createDefaultConfig } from './config/defaults.ts';
import type { ProjectConfig } from './config/types.ts';
import { RepoStartError } from './config/validate.ts';
import { generateProject } from './generators/generate-project.ts';
import { writePlan } from './generators/write-files.ts';
import { resolveTarget } from './utils/filesystem.ts';
import { gitUserName, initializeGitRepository } from './utils/git.ts';
import { slugify } from './utils/strings.ts';

function readVersion(): string {
  try {
    const contents = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    const pkg = JSON.parse(contents) as { version?: string };

    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Build a configuration from command line options alone, for --yes and pipes. */
function configFromOptions(
  options: CliOptions,
  input: { name: string; author: string; year: number },
): ProjectConfig {
  const defaults = createDefaultConfig({
    name: input.name,
    type: options.type ?? 'generic',
    visibility: options.visibility ?? 'public',
    author: input.author,
    year: input.year,
  });

  return {
    ...defaults,
    description: options.description ?? defaults.description,
    initializeGit: options.initializeGit ?? defaults.initializeGit,
    license: options.license ?? defaults.license,
    includeEnvExample: options.includeEnvExample ?? defaults.includeEnvExample,
    includeAgents: options.includeAgents ?? defaults.includeAgents,
    includeContributing: options.includeContributing ?? defaults.includeContributing,
    includeChangelog: options.includeChangelog ?? defaults.includeChangelog,
    includeDocs: options.includeDocs ?? defaults.includeDocs,
    includeCi: options.includeCi ?? defaults.includeCi,
    includeIssueTemplate: options.includeIssueTemplate ?? defaults.includeIssueTemplate,
    includePullRequestTemplate:
      options.includePullRequestTemplate ?? defaults.includePullRequestTemplate,
  };
}

export async function run(argv: string[], cwd: string = process.cwd()): Promise<number> {
  const options = parseCliArgs(argv);

  if (options.help) {
    process.stdout.write(HELP_TEXT);
    return 0;
  }
  if (options.version) {
    process.stdout.write(`${readVersion()}\n`);
    return 0;
  }

  const interactive =
    !options.yes && process.stdin.isTTY === true && process.stdout.isTTY === true;

  if (options.command === 'add') {
    const addOptions: AddCommandOptions = {
      directory: options.directory ?? '.',
      dryRun: options.dryRun,
      yes: options.yes,
      interactive,
    };

    if (options.type) {
      addOptions.type = options.type;
    }

    return runAddCommand(addOptions, cwd, (text) => process.stdout.write(text));
  }

  const author = options.author ?? gitUserName() ?? '';
  const year = new Date().getFullYear();

  let config: ProjectConfig;
  let directoryName: string;

  if (interactive) {
    const answers = await promptForConfig({
      options,
      directoryName: options.directory,
      author,
      year,
    });

    config = answers.config;
    directoryName = answers.directoryName;
  } else {
    if (!options.directory && !options.name) {
      throw new RepoStartError('A project directory is required when Repo Start cannot prompt.', [
        'For example: repo-start my-project --yes',
        'Run `repo-start --help` to see the available options.',
      ]);
    }

    directoryName = options.directory ?? slugify(options.name ?? '');

    const name = options.name ?? path.basename(path.resolve(cwd, directoryName));

    config = configFromOptions(options, { name, author, year });
  }

  if (config.author.length === 0) {
    config = { ...config, author: `The ${config.name} authors` };
  }

  const targetDir = resolveTarget(cwd, directoryName);
  const plan = generateProject(config, { directoryName: path.basename(targetDir) });
  const result = await writePlan(targetDir, plan, {
    dryRun: options.dryRun,
    force: options.force,
  });

  const isCurrentDirectory = path.resolve(cwd) === targetDir;
  const target = {
    label: isCurrentDirectory ? path.basename(targetDir) : directoryName,
    isCurrentDirectory,
  };

  if (result.dryRun) {
    process.stdout.write(`${renderDryRun(plan, result, target)}\n`);
    return 0;
  }

  const gitResult = config.initializeGit
    ? initializeGitRepository(targetDir)
    : { initialized: false, note: null };

  process.stdout.write(`${renderSummary(plan, result, target, gitResult.note)}\n`);

  return 0;
}

async function main(): Promise<void> {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (error) {
    if (error instanceof RepoStartError) {
      process.stderr.write(`${renderError(error.message, error.details)}\n`);
    } else if (error instanceof Error) {
      process.stderr.write(`${renderError(error.message, [])}\n`);
    } else {
      process.stderr.write(`${renderError(String(error), [])}\n`);
    }

    process.exitCode = 1;
  }
}

await main();
