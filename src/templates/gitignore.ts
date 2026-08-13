import type { ProjectConfig } from '../config/types.ts';
import type { GitignoreSection, Preset } from '../presets/types.ts';

/**
 * Rules every project gets.
 *
 * The environment section is the reason this file is generated rather than
 * copied: `.env.*` would otherwise swallow `.env.example`, which is the one
 * env file that must be committed.
 */
function baseSections(config: ProjectConfig): GitignoreSection[] {
  const environment = ['.env', '.env.*'];

  if (config.includeEnvExample) {
    environment.push('!.env.example');
  }

  return [
    { title: 'Logs', patterns: ['*.log', 'logs/'] },
    { title: 'Environment', patterns: environment },
    { title: 'Operating system', patterns: ['.DS_Store', 'Thumbs.db'] },
    {
      title: 'Editors',
      patterns: ['.idea/', '.vscode/*', '!.vscode/extensions.json', '*.swp'],
    },
  ];
}

export function renderGitignore(config: ProjectConfig, preset: Preset): string {
  const sections = [...preset.gitignore(config), ...baseSections(config)];

  const body = sections
    .filter((section) => section.patterns.length > 0)
    .map((section) => [`# ${section.title}`, ...section.patterns].join('\n'))
    .join('\n\n');

  return `${body}\n`;
}
