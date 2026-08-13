import { LICENSE_IDS, PROJECT_TYPES } from './types.ts';
import type { LicenseId, ProjectConfig, ProjectType } from './types.ts';

/** Characters that are illegal in a path segment on Windows (and unwise elsewhere). */
const ILLEGAL_NAME_CHARS = /[<>:"/\\|?*]/;

/** Device names Windows still reserves, with or without an extension. */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

const MAX_NAME_LENGTH = 100;

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) {
      return true;
    }
  }
  return false;
}

/**
 * Validate a project (or directory) name. Returns human readable problems;
 * an empty array means the name is usable.
 */
export function validateProjectName(name: string): string[] {
  const problems: string[] = [];
  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return ['Project name cannot be empty.'];
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    problems.push(`Project name cannot be longer than ${MAX_NAME_LENGTH} characters.`);
  }
  if (ILLEGAL_NAME_CHARS.test(trimmed) || hasControlCharacter(trimmed)) {
    problems.push('Project name cannot contain control characters or any of: < > : " / \\ | ? *');
  }
  if (trimmed === '.' || trimmed === '..') {
    problems.push('Project name cannot be "." or "..".');
  }
  if (WINDOWS_RESERVED.test(trimmed)) {
    problems.push(`"${trimmed}" is a reserved device name on Windows.`);
  }
  if (trimmed.endsWith('.')) {
    problems.push('Project name cannot end with a period.');
  }
  if (!/[a-zA-Z0-9]/.test(trimmed)) {
    problems.push('Project name must contain at least one letter or digit.');
  }

  return problems;
}

export function isProjectType(value: string): value is ProjectType {
  return (PROJECT_TYPES as readonly string[]).includes(value);
}

export function isLicenseId(value: string): value is LicenseId {
  return (LICENSE_IDS as readonly string[]).includes(value);
}

/**
 * Validate a fully assembled configuration. This runs before anything touches
 * the filesystem so a bad configuration fails with a message, not a half
 * written directory.
 */
export function validateConfig(config: ProjectConfig): string[] {
  const problems = validateProjectName(config.name);

  if (!isProjectType(config.type)) {
    problems.push(
      `Unknown project type "${config.type}". Expected one of: ${PROJECT_TYPES.join(', ')}.`,
    );
  }
  if (!isLicenseId(config.license)) {
    problems.push(`Unknown license "${config.license}". Expected one of: ${LICENSE_IDS.join(', ')}.`);
  }
  if (config.visibility !== 'public' && config.visibility !== 'private') {
    problems.push(`Unknown visibility "${config.visibility}". Expected "public" or "private".`);
  }
  if (config.packageName.length === 0) {
    problems.push('Package name could not be derived from the project name.');
  }
  if (config.description.includes('\n')) {
    problems.push('Project description must be a single line.');
  }
  if (!Number.isInteger(config.year)) {
    problems.push('Copyright year must be an integer.');
  }

  return problems;
}

/** Thrown for user-facing errors that should print a message, not a stack. */
export class RepoStartError extends Error {
  readonly details: string[];

  constructor(message: string, details: string[] = []) {
    super(message);
    this.name = 'RepoStartError';
    this.details = details;
  }
}
