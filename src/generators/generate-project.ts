import type { FileEntry, ProjectConfig, ProjectPlan } from '../config/types.ts';
import { RepoStartError, validateConfig } from '../config/validate.ts';
import { getPreset } from '../presets/index.ts';
import { renderAgents } from '../templates/agents.ts';
import { renderChangelog } from '../templates/changelog.ts';
import { renderContributing } from '../templates/contributing.ts';
import { renderDocsIndex } from '../templates/docs.ts';
import { renderEditorConfig } from '../templates/editorconfig.ts';
import { renderEnvExample } from '../templates/env-example.ts';
import {
  renderBugReportTemplate,
  renderFeatureRequestTemplate,
  renderPullRequestTemplate,
} from '../templates/github.ts';
import { renderGitAttributes } from '../templates/gitattributes.ts';
import { renderGitignore } from '../templates/gitignore.ts';
import { renderLicense } from '../templates/license.ts';
import { renderReadme } from '../templates/readme.ts';

export interface GenerateOptions {
  /** Name of the directory the project is generated into. */
  directoryName: string;
}

function assertRelativePath(filePath: string): void {
  const isAbsolute = filePath.startsWith('/') || /^[a-zA-Z]:/.test(filePath);
  const segments = filePath.split('/');

  if (isAbsolute || segments.includes('..') || filePath.includes('\\')) {
    throw new RepoStartError(`Generated an unsafe file path: ${filePath}`);
  }
}

/**
 * Turn a configuration into an in-memory plan.
 *
 * This function is pure: it reads no user files and writes nothing. That is
 * what makes `--dry-run` trustworthy and what lets the tests run entirely in
 * memory.
 */
export function generateProject(config: ProjectConfig, options: GenerateOptions): ProjectPlan {
  const problems = validateConfig(config);

  if (problems.length > 0) {
    throw new RepoStartError('This project configuration is not valid.', problems);
  }

  const preset = getPreset(config.type);
  const commands = preset.commands(config);
  const notes: string[] = [];
  const files: FileEntry[] = [...preset.files(config)];

  files.push(
    { path: '.gitignore', contents: renderGitignore(config, preset) },
    { path: '.gitattributes', contents: renderGitAttributes() },
    { path: '.editorconfig', contents: renderEditorConfig(config) },
  );

  if (config.includeEnvExample) {
    files.push({ path: '.env.example', contents: renderEnvExample(config, preset) });
  }

  const licenseText = renderLicense(config.license, config.author, config.year);

  if (licenseText) {
    files.push({ path: 'LICENSE', contents: licenseText });
  }

  if (config.includeChangelog) {
    files.push({ path: 'CHANGELOG.md', contents: renderChangelog() });
  }

  if (config.includeContributing) {
    files.push({
      path: 'CONTRIBUTING.md',
      contents: renderContributing({ config, commands, directoryName: options.directoryName }),
    });
  }

  if (config.includeDocs) {
    files.push({ path: 'docs/README.md', contents: renderDocsIndex(config) });
  }

  if (config.includeCi) {
    const workflow = preset.ci(config);

    if (workflow) {
      files.push({ path: '.github/workflows/ci.yml', contents: workflow });
    } else {
      notes.push(
        `Skipped GitHub Actions CI: the ${preset.label} preset has no build or test command to run yet.`,
      );
    }
  }

  if (config.includeIssueTemplate) {
    files.push(
      { path: '.github/ISSUE_TEMPLATE/bug_report.md', contents: renderBugReportTemplate() },
      {
        path: '.github/ISSUE_TEMPLATE/feature_request.md',
        contents: renderFeatureRequestTemplate(),
      },
    );
  }

  if (config.includePullRequestTemplate) {
    files.push({
      path: '.github/pull_request_template.md',
      contents: renderPullRequestTemplate(config, commands),
    });
  }

  if (config.includeAgents) {
    files.push({
      path: 'AGENTS.md',
      contents: renderAgents({ config, commands, structure: preset.structure(config) }),
    });
  }

  const directories = preset.directories(config);

  // Git cannot track an empty directory, so any directory the preset asked for
  // that received no file gets a .gitkeep.
  for (const directory of directories) {
    const prefix = `${directory}/`;
    const hasFile = files.some((file) => file.path.startsWith(prefix));

    if (!hasFile) {
      files.push({ path: `${prefix}.gitkeep`, contents: '' });
    }
  }

  // The README is generated last so its project structure reflects everything
  // else that was planned, including the README itself.
  const filePaths = [...files.map((file) => file.path), 'README.md'];

  files.push({
    path: 'README.md',
    contents: renderReadme({
      config,
      commands,
      requirements: preset.requirements(config),
      directoryName: options.directoryName,
      filePaths,
      directories,
    }),
  });

  for (const file of files) {
    assertRelativePath(file.path);
  }

  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));

  return { config, commands, files, directories, notes };
}
