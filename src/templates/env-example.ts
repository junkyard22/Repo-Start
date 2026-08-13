import type { ProjectConfig } from '../config/types.ts';
import type { Preset } from '../presets/types.ts';

/**
 * A safe placeholder file. Repo Start never generates credential values, only
 * names of variables the project is likely to need.
 */
export function renderEnvExample(config: ProjectConfig, preset: Preset): string {
  const lines = [
    '# Copy this file to .env and set the values for your machine.',
    '# .env is ignored by git. Never commit real credentials.',
    '',
    'APP_ENV=development',
    ...preset.envExample(config),
    '',
  ];

  return lines.join('\n');
}
