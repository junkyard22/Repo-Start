import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createDefaultConfig } from '../src/config/defaults.ts';
import type { ProjectConfig, ProjectPlan, ProjectType } from '../src/config/types.ts';
import { generateProject } from '../src/generators/generate-project.ts';

/** A deterministic configuration for tests, overridable field by field. */
export function testConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  const base = createDefaultConfig({
    name: overrides.name ?? 'demo-project',
    type: overrides.type ?? 'generic',
    visibility: overrides.visibility ?? 'public',
    author: 'Test Author',
    year: 2026,
  });

  return { ...base, ...overrides };
}

export function planFor(overrides: Partial<ProjectConfig> = {}): ProjectPlan {
  const config = testConfig(overrides);

  return generateProject(config, { directoryName: config.packageName });
}

export function filesByPath(plan: ProjectPlan): Map<string, string> {
  return new Map(plan.files.map((file) => [file.path, file.contents]));
}

export function pathsOf(plan: ProjectPlan): string[] {
  return plan.files.map((file) => file.path);
}

export function fileContents(plan: ProjectPlan, filePath: string): string {
  const contents = filesByPath(plan).get(filePath);

  if (contents === undefined) {
    throw new Error(`Expected the plan to contain ${filePath}. Got: ${pathsOf(plan).join(', ')}`);
  }

  return contents;
}

/** Run a callback inside a fresh temporary directory, always cleaned up. */
export async function withTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'repo-start-test-'));

  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Extract the contents of every ```bash fence in a markdown document. */
export function bashCommands(markdown: string): string[] {
  const commands: string[] = [];
  let inside = false;

  for (const line of markdown.split('\n')) {
    if (line.startsWith('```bash')) {
      inside = true;
      continue;
    }
    if (line.startsWith('```')) {
      inside = false;
      continue;
    }
    if (inside && line.trim().length > 0) {
      commands.push(line.trim());
    }
  }

  return commands;
}

export const ALL_TYPES: ProjectType[] = ['generic', 'node-ts', 'python', 'react-ts'];
