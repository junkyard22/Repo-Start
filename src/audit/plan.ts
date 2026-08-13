import { createDefaultConfig } from '../config/defaults.ts';
import type { FileEntry, ProjectConfig, ProjectPlan } from '../config/types.ts';
import { validateProjectName } from '../config/validate.ts';
import { getPreset } from '../presets/index.ts';
import { renderAgents } from '../templates/agents.ts';
import { renderChangelog } from '../templates/changelog.ts';
import { renderContributing } from '../templates/contributing.ts';
import { renderDocsIndex } from '../templates/docs.ts';
import { renderEnvExample } from '../templates/env-example.ts';
import {
  renderBugReportTemplate,
  renderFeatureRequestTemplate,
  renderPullRequestTemplate,
} from '../templates/github.ts';
import { renderGitAttributes } from '../templates/gitattributes.ts';
import { renderGitignore } from '../templates/gitignore.ts';
import { slugify } from '../utils/strings.ts';
import { parseNpmCommand, workflowCommands } from './analyze.ts';
import type { AuditIssue, Proposal, RepoAudit, RepoState } from './types.ts';

/**
 * A single thing `repo-start add` offers to do.
 *
 * Additions carry the file they would write; fixes carry the issue whose fix
 * they would apply. Both are inert until selected.
 */
export interface AddProposal extends Proposal {
  file?: FileEntry;
  issue?: AuditIssue;
  /**
   * Id of the proposal this one belongs to. Followers are never asked about
   * separately; they are accepted or declined with their leader.
   */
  follows?: string;
}

/**
 * Build the ProjectConfig the templates need from an inspected repository.
 *
 * The repository is the source of truth: its name, its description and its
 * own commands. The license is always "none" because Repo Start never decides
 * licensing for an existing project.
 */
export function configFromRepoState(
  state: RepoState,
  plannedPaths: Iterable<string> = [],
): ProjectConfig {
  const candidate = state.projectName ?? state.name;
  const name = validateProjectName(candidate).length === 0 ? candidate : slugify(candidate);
  const planned = new Set(plannedPaths);
  const has = (path: string): boolean => state.files.has(path) || planned.has(path);

  const defaults = createDefaultConfig({
    name,
    type: state.detectedType,
    visibility: 'public',
    author: '',
    year: new Date().getFullYear(),
  });

  return {
    ...defaults,
    packageName: slugify(name),
    description: state.projectDescription ?? '',
    license: 'none',
    initializeGit: false,
    includeEnvExample: has('.env.example'),
    includeAgents: has('AGENTS.md'),
    includeContributing: has('CONTRIBUTING.md'),
    includeChangelog: has('CHANGELOG.md'),
    includeDocs: has('docs') || planned.has('docs/README.md'),
    includeCi:
      state.workflows.length > 0 || planned.has('.github/workflows/ci.yml'),
    includeIssueTemplate:
      has('.github/ISSUE_TEMPLATE') ||
      planned.has('.github/ISSUE_TEMPLATE/bug_report.md') ||
      planned.has('.github/ISSUE_TEMPLATE/feature_request.md'),
    includePullRequestTemplate: has('.github/pull_request_template.md'),
  };
}

/** Render a selected creation against the final, accepted repository shape. */
function renderAcceptedFile(
  proposal: AddProposal,
  config: ProjectConfig,
  state: RepoState,
): FileEntry {
  const preset = getPreset(state.detectedType);

  switch (proposal.id) {
    case 'gitignore':
      return { path: proposal.path, contents: renderGitignore(config, preset) };
    case 'gitattributes':
      return { path: proposal.path, contents: renderGitAttributes() };
    case 'env-example':
      return { path: proposal.path, contents: renderEnvExample(config, preset) };
    case 'agents':
      return {
        path: proposal.path,
        contents: renderAgents({
          config,
          commands: state.commands,
          structure: preset.structure(config),
        }),
      };
    case 'contributing':
      return {
        path: proposal.path,
        contents: renderContributing({
          config,
          commands: state.commands,
          directoryName: state.name,
        }),
      };
    case 'changelog':
      return { path: proposal.path, contents: renderChangelog() };
    case 'docs':
      return { path: proposal.path, contents: renderDocsIndex(config) };
    case 'issue-template':
      return { path: proposal.path, contents: renderBugReportTemplate() };
    case 'issue-template-feature':
      return { path: proposal.path, contents: renderFeatureRequestTemplate() };
    case 'pr-template':
      return {
        path: proposal.path,
        contents: renderPullRequestTemplate(config, state.commands),
      };
    case 'ci': {
      const workflow = workflowForExistingRepository(config, state);

      if (workflow) {
        return { path: proposal.path, contents: workflow };
      }
      break;
    }
  }

  if (!proposal.file) {
    throw new Error(`Creation proposal ${proposal.id} has no file.`);
  }

  return proposal.file;
}

/** True when every npm script the workflow runs exists in the repository. */
function workflowMatchesRepository(workflow: string, state: RepoState): boolean {
  const scripts = state.packageScripts;

  if (!scripts) {
    return false;
  }

  return workflowCommands(workflow).every((found) => {
    const invocation = parseNpmCommand(found.command);

    if (!invocation || invocation.kind === 'install' || !invocation.script) {
      return true;
    }

    return Boolean(scripts[invocation.script]);
  });
}

/**
 * Build CI only when the existing repository declares which runtime it uses.
 * The setup action reads that file directly, so Repo Start never substitutes
 * a preset version that may violate the project's own supported range.
 */
function workflowForExistingRepository(
  config: ProjectConfig,
  state: RepoState,
): string | null {
  if (!state.runtimeVersionFile) {
    return null;
  }

  return getPreset(state.detectedType).ci(config, {
    runtimeVersionFile: state.runtimeVersionFile,
  });
}

/**
 * Everything Repo Start is willing to add or fix, in the order it asks.
 *
 * README.md and LICENSE are deliberately absent: a README is content rather
 * than boilerplate, and licensing is never Repo Start's decision. Both are
 * still reported as missing.
 */
export function buildProposals(audit: RepoAudit): AddProposal[] {
  const { state } = audit;
  const config = configFromRepoState(state);
  const preset = getPreset(state.detectedType);
  const commands = state.commands;
  const missing = new Set(audit.missing.map((item) => item.code));
  const proposals: AddProposal[] = [];

  const add = (id: string, question: string, path: string, contents: string): void => {
    proposals.push({ id, question, kind: 'create', path, file: { path, contents } });
  };

  if (missing.has('missing-gitignore')) {
    add('gitignore', 'Add .gitignore?', '.gitignore', renderGitignore(config, preset));
  }
  if (missing.has('missing-gitattributes')) {
    add('gitattributes', 'Add .gitattributes?', '.gitattributes', renderGitAttributes());
  }
  if (missing.has('missing-env-example')) {
    add('env-example', 'Add .env.example?', '.env.example', renderEnvExample(config, preset));
  }
  if (missing.has('missing-agents')) {
    add(
      'agents',
      'Add AGENTS.md?',
      'AGENTS.md',
      renderAgents({ config, commands, structure: preset.structure(config) }),
    );
  }
  if (missing.has('missing-contributing')) {
    add(
      'contributing',
      'Add CONTRIBUTING.md?',
      'CONTRIBUTING.md',
      renderContributing({ config, commands, directoryName: state.name }),
    );
  }
  if (missing.has('missing-changelog')) {
    add('changelog', 'Add CHANGELOG.md?', 'CHANGELOG.md', renderChangelog());
  }
  if (missing.has('missing-docs')) {
    add('docs', 'Add docs/?', 'docs/README.md', renderDocsIndex(config));
  }
  if (missing.has('missing-issue-template')) {
    proposals.push({
      id: 'issue-template',
      question: 'Add GitHub issue templates?',
      kind: 'create',
      path: '.github/ISSUE_TEMPLATE/bug_report.md',
      file: { path: '.github/ISSUE_TEMPLATE/bug_report.md', contents: renderBugReportTemplate() },
    });
    proposals.push({
      id: 'issue-template-feature',
      question: 'Add GitHub issue templates?',
      follows: 'issue-template',
      kind: 'create',
      path: '.github/ISSUE_TEMPLATE/feature_request.md',
      file: {
        path: '.github/ISSUE_TEMPLATE/feature_request.md',
        contents: renderFeatureRequestTemplate(),
      },
    });
  }
  if (missing.has('missing-pr-template')) {
    add(
      'pr-template',
      'Add GitHub pull request template?',
      '.github/pull_request_template.md',
      renderPullRequestTemplate(config, commands),
    );
  }

  // A workflow is only offered when every command it would run already exists
  // in this repository. Otherwise Repo Start would be adding CI that fails.
  if (missing.has('missing-ci')) {
    const workflow = workflowForExistingRepository(config, state);

    if (workflow && workflowMatchesRepository(workflow, state)) {
      add(
        'ci',
        'Add GitHub Actions workflow?',
        '.github/workflows/ci.yml',
        workflow,
      );
    }
  }

  for (const issue of [...audit.issues, ...audit.warnings]) {
    if (!issue.fix) {
      continue;
    }

    // The line is part of the id because one file can have two issues of the
    // same kind, and two proposals sharing an id would be accepted together.
    const anchor = issue.fix.edits[0]?.line ?? 0;

    proposals.push({
      id: `fix-${issue.code}-${issue.fix.file}:${anchor}`,
      question: `Fix ${issue.fix.file}: ${issue.fix.description}?`,
      kind: 'fix',
      path: issue.fix.file,
      issue,
    });
  }

  return proposals;
}

/**
 * Turn the accepted proposals into a plan.
 *
 * Pure: no filesystem access. The resulting plan goes to the same writePlan
 * that creates new projects, which is what keeps dry-run honest.
 */
export function buildAddPlan(audit: RepoAudit, accepted: AddProposal[]): ProjectPlan {
  const { state } = audit;
  const acceptedPaths = accepted
    .filter((proposal) => proposal.file !== undefined)
    .map((proposal) => proposal.path);
  const config = configFromRepoState(state, acceptedPaths);
  const files: FileEntry[] = [];
  const editsByFile = new Map<string, ProjectPlan['edits'][number]>();
  const notes: string[] = [];

  for (const proposal of accepted) {
    if (proposal.file) {
      files.push(renderAcceptedFile(proposal, config, state));
      continue;
    }

    const fix = proposal.issue?.fix;

    if (!fix) {
      continue;
    }

    const existing = editsByFile.get(fix.file);

    if (existing) {
      existing.edits.push(...fix.edits);
      existing.summary.push(fix.description);
    } else {
      editsByFile.set(fix.file, {
        path: fix.file,
        edits: [...fix.edits],
        summary: [fix.description],
      });
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));

  const missingReadme = audit.missing.some((item) => item.code === 'missing-readme');

  if (missingReadme) {
    notes.push('README.md is missing. Repo Start does not write one for an existing project.');
  }

  return {
    config,
    commands: state.commands,
    files,
    directories: [],
    edits: [...editsByFile.values()],
    notes,
  };
}
