import type { CommandSet, ProjectConfig } from '../config/types.ts';
import type { StructureNote } from '../presets/types.ts';
import { bashBlock, joinSections } from '../utils/strings.ts';

export interface AgentsInput {
  config: ProjectConfig;
  commands: CommandSet;
  structure: StructureNote[];
}

/**
 * Repository context for AI coding tools.
 *
 * Kept short on purpose: the commands must be correct and the conventions must
 * be real. A long file of generic advice is worse than a short accurate one.
 */
export function renderAgents(input: AgentsInput): string {
  const { commands, config } = input;

  const structure =
    input.structure.length > 0
      ? [
          '## Structure',
          '',
          ...input.structure.map((note) => `- \`${note.path}\` — ${note.description}`),
        ].join('\n')
      : null;

  const developmentLines: string[] = [];

  if (commands.install.length > 0) {
    developmentLines.push('', 'Install:', '', bashBlock(commands.install));
  }
  if (commands.build) {
    developmentLines.push('', 'Build:', '', bashBlock([commands.build]));
  }
  if (commands.test) {
    developmentLines.push('', 'Test:', '', bashBlock([commands.test]));
  }
  if (commands.dev) {
    developmentLines.push('', 'Run locally:', '', bashBlock([commands.dev]));
  } else if (commands.start) {
    developmentLines.push('', 'Run locally:', '', bashBlock([commands.start]));
  }

  const development =
    developmentLines.length > 0 ? ['## Development', ...developmentLines].join('\n') : null;

  const guidelines = [
    '## Guidelines',
    '',
    '- Keep changes scoped to the task at hand.',
    '- Add or update tests when behavior changes.',
    '- Do not commit credentials or secrets. Add new variables to `.env.example` instead.',
    '- Preserve existing project conventions.',
    '- Update documentation when commands or architecture change.',
  ];

  if (!config.includeEnvExample) {
    guidelines[4] = '- Do not commit credentials or secrets.';
  }

  return joinSections([
    '# AGENTS.md',
    ['## Project', '', `${config.name} — ${config.description}`].join('\n'),
    structure,
    development,
    guidelines.join('\n'),
  ]);
}
