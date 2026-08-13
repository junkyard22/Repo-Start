import type { CommandSet, ProjectPlan } from '../config/types.ts';
import { LICENSE_LABELS, PROJECT_TYPE_LABELS } from '../config/types.ts';
import type { WriteResult } from '../generators/write-files.ts';

const useColor =
  process.env['NO_COLOR'] === undefined &&
  process.env['TERM'] !== 'dumb' &&
  process.stdout.isTTY === true;

/** Escape character, written this way so no raw control byte lands in source. */
const ESC = String.fromCharCode(27);

function style(code: string, value: string): string {
  return useColor ? `${ESC}[${code}m${value}${ESC}[0m` : value;
}

export const bold = (value: string): string => style('1', value);
export const dim = (value: string): string => style('2', value);
export const green = (value: string): string => style('32', value);
export const red = (value: string): string => style('31', value);
export const yellow = (value: string): string => style('33', value);

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Where the project was generated, as the user should see it described. */
export interface TargetDisplay {
  /** What to call the project directory in prose. */
  label: string;
  /** True when generating into the directory the user is already in. */
  isCurrentDirectory: boolean;
}

/** The commands to suggest after generation, in the order a user runs them. */
function nextSteps(target: TargetDisplay, commands: CommandSet): string[] {
  const steps = target.isCurrentDirectory
    ? [...commands.install]
    : [`cd ${target.label}`, ...commands.install];

  if (commands.dev) {
    steps.push(commands.dev);
  } else if (commands.test) {
    steps.push(commands.test);
  }

  return steps;
}

export function renderDryRun(
  plan: ProjectPlan,
  result: WriteResult,
  target: TargetDisplay,
): string {
  const lines = [
    bold('Repo Start'),
    '',
    `Target: ${target.isCurrentDirectory ? `${target.label} (current directory)` : target.label}`,
    `Preset: ${PROJECT_TYPE_LABELS[plan.config.type]}`,
    `License: ${LICENSE_LABELS[plan.config.license]}`,
    '',
    'Would create:',
  ];

  for (const directory of result.createdDirectories) {
    lines.push(`  ${directory}/`);
  }
  for (const file of result.createdFiles) {
    lines.push(`  ${file}`);
  }

  if (result.overwrittenFiles.length > 0) {
    lines.push('', yellow('Would overwrite:'));

    for (const file of result.overwrittenFiles) {
      lines.push(`  ${file}`);
    }
  }

  if (plan.config.initializeGit) {
    lines.push('', 'Would run: git init');
  }

  for (const note of plan.notes) {
    lines.push('', yellow(`Note: ${note}`));
  }

  lines.push('', dim('No files were changed.'));

  return lines.join('\n');
}

export function renderSummary(
  plan: ProjectPlan,
  result: WriteResult,
  target: TargetDisplay,
  gitNote: string | null,
): string {
  const fileCount = result.createdFiles.length + result.overwrittenFiles.length;
  const lines = [
    `${green('✓')} Repo Start created ${bold(target.label)}`,
    '',
    `Created ${pluralize(fileCount, 'file')} and ${pluralize(result.createdDirectories.length, 'directory', 'directories')}.`,
  ];

  if (result.overwrittenFiles.length > 0) {
    lines.push(yellow(`Overwrote ${pluralize(result.overwrittenFiles.length, 'existing file')}.`));
  }

  for (const note of plan.notes) {
    lines.push(yellow(`Note: ${note}`));
  }
  if (gitNote) {
    lines.push(yellow(`Note: ${gitNote}`));
  }

  lines.push('', 'Next:', '');

  for (const step of nextSteps(target, plan.commands)) {
    lines.push(`  ${step}`);
  }

  lines.push('', dim('Start clean. Build faster.'));

  return lines.join('\n');
}

export function renderError(message: string, details: string[]): string {
  const lines = [`${red('✗')} ${message}`];

  if (details.length > 0) {
    lines.push('');

    for (const detail of details) {
      lines.push(detail.length > 0 ? `  ${detail}` : '');
    }
  }

  return lines.join('\n');
}
