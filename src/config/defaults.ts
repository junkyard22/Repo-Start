import { slugify } from '../utils/strings.ts';
import { PROJECT_TYPE_LABELS } from './types.ts';
import type { LicenseId, ProjectConfig, ProjectType, Visibility } from './types.ts';

export interface DefaultsInput {
  name: string;
  type: ProjectType;
  visibility: Visibility;
  author: string;
  year: number;
}

export function defaultDescription(type: ProjectType): string {
  return type === 'generic' ? 'A new project.' : `A new ${PROJECT_TYPE_LABELS[type]} project.`;
}

export function defaultLicense(visibility: Visibility): LicenseId {
  // A public repository without a license grants nobody any rights, so MIT is
  // the friendlier default. Private repositories default to no license.
  return visibility === 'public' ? 'mit' : 'none';
}

/**
 * The configuration a user gets by pressing Enter through every prompt, or by
 * passing --yes. Defaults that depend on the project type or visibility are
 * computed here so the CLI and the prompts cannot disagree about them.
 */
export function createDefaultConfig(input: DefaultsInput): ProjectConfig {
  return {
    name: input.name,
    packageName: slugify(input.name),
    description: defaultDescription(input.type),
    type: input.type,
    visibility: input.visibility,
    initializeGit: true,
    license: defaultLicense(input.visibility),
    author: input.author,
    year: input.year,
    includeEnvExample: true,
    includeAgents: true,
    includeContributing: true,
    includeChangelog: true,
    includeDocs: true,
    // The generic preset has no build or test command, so a workflow would
    // have nothing real to run.
    includeCi: input.type !== 'generic',
    includeIssueTemplate: input.visibility === 'public',
    includePullRequestTemplate: true,
  };
}
