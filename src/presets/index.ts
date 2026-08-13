import type { ProjectType } from '../config/types.ts';
import { genericPreset } from './generic.ts';
import { nodeTypeScriptPreset } from './node-typescript.ts';
import { pythonPreset } from './python.ts';
import { reactTypeScriptPreset } from './react-typescript.ts';
import type { Preset } from './types.ts';

/**
 * The preset registry. Adding a starter profile is a one line change here
 * plus one new file, and a new entry in ProjectType.
 */
const PRESETS: Record<ProjectType, Preset> = {
  generic: genericPreset,
  'node-ts': nodeTypeScriptPreset,
  python: pythonPreset,
  'react-ts': reactTypeScriptPreset,
};

export function getPreset(type: ProjectType): Preset {
  return PRESETS[type];
}

export function allPresets(): Preset[] {
  return Object.values(PRESETS);
}

export type { Preset } from './types.ts';
