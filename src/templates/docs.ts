import type { ProjectConfig } from '../config/types.ts';

/** A starting point for `docs/` that explains what belongs there. */
export function renderDocsIndex(config: ProjectConfig): string {
  return `# ${config.name} Documentation

Longer form documentation lives in this folder. The README stays short and
points here for anything that needs more room.

Suggested starting points:

- \`architecture.md\` — how the pieces fit together.
- \`decisions/\` — short records of decisions worth remembering.
`;
}
