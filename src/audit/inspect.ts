import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import type { CommandSet, ProjectType } from '../config/types.ts';
import { RepoStartError } from '../config/validate.ts';
import { isDirectory, pathExists } from '../utils/filesystem.ts';
import { checkIgnore, isGitRepository, isTracked } from '../utils/git.ts';
import type { PackageManager, RepoState } from './types.ts';

/** Hygiene paths the audit asks about. Nothing else is scanned. */
export const HYGIENE_PATHS = [
  'README.md',
  '.gitignore',
  '.gitattributes',
  '.editorconfig',
  '.env.example',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  'LICENSE',
  'docs',
  '.github/pull_request_template.md',
  '.github/ISSUE_TEMPLATE',
] as const;

/** Manifests and configuration used to classify the project. */
const MANIFEST_PATHS = [
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'bun.lock',
  '.nvmrc',
  '.node-version',
  '.python-version',
  'pyproject.toml',
  'requirements.txt',
  'setup.py',
  'tsconfig.json',
  'vite.config.ts',
  'vite.config.js',
  'vite.config.mts',
  'vite.config.mjs',
  'src',
  'tests',
  'test',
] as const;

/** Documents whose contents the audit rules need to read. */
const DOCUMENT_PATHS = ['README.md', 'AGENTS.md', 'CONTRIBUTING.md', '.gitignore'] as const;

interface PackageJson {
  name?: string;
  description?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: { node?: string };
}

/** U+FEFF, written this way so no invisible character sits in the source. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

function readFileOrNull(filePath: string): string | null {
  try {
    const text = readFileSync(filePath, 'utf8');
    // Windows editors routinely write UTF-8 with a byte order mark, which
    // would otherwise make JSON.parse throw on a perfectly good manifest.
    const withoutMark = text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;

    return withoutMark.replace(/\r\n/g, '\n');
  } catch {
    return null;
  }
}

function readPackageJson(root: string): PackageJson | null {
  const contents = readFileOrNull(path.join(root, 'package.json'));

  if (contents === null) {
    return null;
  }

  try {
    return JSON.parse(contents) as PackageJson;
  } catch {
    // A malformed manifest is the repository's business, not ours. Treat it
    // as absent rather than crashing the audit.
    return null;
  }
}

function detectPackageManager(files: Set<string>): PackageManager | undefined {
  if (files.has('yarn.lock')) {
    return 'yarn';
  }
  if (files.has('pnpm-lock.yaml')) {
    return 'pnpm';
  }
  if (files.has('bun.lockb') || files.has('bun.lock')) {
    return 'bun';
  }
  if (files.has('package-lock.json') || files.has('package.json')) {
    return 'npm';
  }
  return undefined;
}

function hasDependency(manifest: PackageJson | null, name: string): boolean {
  if (!manifest) {
    return false;
  }
  return Boolean(manifest.dependencies?.[name] ?? manifest.devDependencies?.[name]);
}

/** How each package manager spells the commands Repo Start documents. */
function nodeCommands(
  manager: PackageManager,
  scripts: Record<string, string>,
): CommandSet {
  const runScript = (name: string): string => {
    if (manager === 'npm') {
      return name === 'test' || name === 'start' ? `npm ${name}` : `npm run ${name}`;
    }
    if (manager === 'bun') {
      return `bun run ${name}`;
    }
    return `${manager} ${name}`;
  };

  const commands: CommandSet = { install: [`${manager} install`] };

  if (scripts['build']) {
    commands.build = runScript('build');
  }
  if (scripts['test']) {
    commands.test = runScript('test');
  }
  if (scripts['dev']) {
    commands.dev = runScript('dev');
  }
  if (scripts['start']) {
    commands.start = runScript('start');
  }

  return commands;
}

/**
 * Python commands, derived only from evidence in the repository.
 *
 * If nothing shows that pytest is used, no test command is claimed, and the
 * generated documents omit their testing section rather than guess.
 */
function pythonCommands(root: string, files: Set<string>): CommandSet {
  const activate = 'source .venv/bin/activate  # Windows: .venv\\Scripts\\activate';
  const install = ['python -m venv .venv', activate, 'python -m pip install --upgrade pip'];
  const pyproject = files.has('pyproject.toml')
    ? (readFileOrNull(path.join(root, 'pyproject.toml')) ?? '')
    : '';
  const requirements = files.has('requirements.txt')
    ? (readFileOrNull(path.join(root, 'requirements.txt')) ?? '')
    : '';

  if (pyproject) {
    const hasDevExtra =
      /\[project\.optional-dependencies\]/.test(pyproject) && /^\s*dev\s*=/m.test(pyproject);

    install.push(hasDevExtra ? 'python -m pip install -e ".[dev]"' : 'python -m pip install -e .');
  } else if (requirements) {
    install.push('python -m pip install -r requirements.txt');
  }

  const commands: CommandSet = { install };

  if (/pytest/.test(pyproject) || /pytest/.test(requirements)) {
    commands.test = 'pytest';
  }

  return commands;
}

interface Classification {
  type: ProjectType;
  confident: boolean;
}

function classify(
  files: Set<string>,
  hasTypeScript: boolean,
  hasReact: boolean,
): Classification {
  const isNode = files.has('package.json');
  const isPython =
    files.has('pyproject.toml') || files.has('requirements.txt') || files.has('setup.py');

  if (isNode && hasReact) {
    // React without TypeScript is a real project, just not one of the four
    // shapes Repo Start models. Say so instead of pretending.
    return { type: hasTypeScript ? 'react-ts' : 'generic', confident: hasTypeScript };
  }
  if (isNode) {
    return { type: hasTypeScript ? 'node-ts' : 'generic', confident: hasTypeScript };
  }
  if (isPython) {
    return { type: 'python', confident: true };
  }

  return { type: 'generic', confident: files.size > 0 };
}

/** Relative paths of workflow files, sorted, using forward slashes. */
function listWorkflows(root: string): string[] {
  const directory = path.join(root, '.github', 'workflows');

  if (!isDirectory(directory)) {
    return [];
  }

  try {
    return readdirSync(directory)
      .filter((entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'))
      .map((entry) => `.github/workflows/${entry}`)
      .sort((a, b) => a.localeCompare(b, 'en'));
  } catch {
    return [];
  }
}

/**
 * Read an existing repository.
 *
 * This is the only part of `repo-start add` that touches the filesystem for
 * input, and it never writes. Everything downstream works from the returned
 * value.
 */
export function inspectRepository(root: string): RepoState {
  const resolved = path.resolve(root);

  if (!pathExists(resolved)) {
    throw new RepoStartError(`No such directory: ${resolved}`);
  }
  if (!isDirectory(resolved)) {
    throw new RepoStartError(`Not a directory: ${resolved}`);
  }

  const files = new Set<string>();

  for (const candidate of [...HYGIENE_PATHS, ...MANIFEST_PATHS]) {
    if (pathExists(path.join(resolved, candidate))) {
      files.add(candidate);
    }
  }

  const manifest = readPackageJson(resolved);
  const scripts = manifest?.scripts ?? {};
  const hasReact = hasDependency(manifest, 'react');
  const hasTypeScript =
    files.has('tsconfig.json') || hasDependency(manifest, 'typescript');
  const { type, confident } = classify(files, hasTypeScript, hasReact);
  const packageManager = detectPackageManager(files);

  const documents = new Map<string, string>();

  for (const document of DOCUMENT_PATHS) {
    const contents = readFileOrNull(path.join(resolved, document));

    if (contents !== null) {
      documents.set(document, contents);
    }
  }

  const workflows = listWorkflows(resolved);

  for (const workflow of workflows) {
    const contents = readFileOrNull(path.join(resolved, workflow));

    if (contents !== null) {
      documents.set(workflow, contents);
    }
  }

  let commands: CommandSet = { install: [] };

  if (files.has('package.json') && packageManager) {
    commands = nodeCommands(packageManager, scripts);
  } else if (type === 'python') {
    commands = pythonCommands(resolved, files);
  }

  const state: RepoState = {
    root: resolved,
    name: path.basename(resolved),
    detectedType: type,
    detectionIsConfident: confident,
    isGitRepository: isGitRepository(resolved),
    hasTypeScript,
    hasReact,
    files,
    commands,
    documents,
    workflows,
  };

  if (
    (type === 'node-ts' || type === 'react-ts') &&
    typeof manifest?.engines?.node === 'string' &&
    manifest.engines.node.trim().length > 0
  ) {
    state.runtimeVersionFile = 'package.json';
  } else if (
    (type === 'node-ts' || type === 'react-ts') &&
    files.has('.nvmrc')
  ) {
    state.runtimeVersionFile = '.nvmrc';
  } else if (
    (type === 'node-ts' || type === 'react-ts') &&
    files.has('.node-version')
  ) {
    state.runtimeVersionFile = '.node-version';
  } else if (type === 'python' && files.has('.python-version')) {
    state.runtimeVersionFile = '.python-version';
  } else if (type === 'python' && files.has('pyproject.toml')) {
    const pyproject = readFileOrNull(path.join(resolved, 'pyproject.toml')) ?? '';

    if (/^\s*requires-python\s*=\s*["'][^"']+["']/m.test(pyproject)) {
      state.runtimeVersionFile = 'pyproject.toml';
    }
  }

  if (packageManager) {
    state.packageManager = packageManager;
  }
  if (manifest) {
    state.packageScripts = scripts;

    if (manifest.name) {
      state.projectName = manifest.name;
    }
    if (manifest.description) {
      state.projectDescription = manifest.description;
    }
  }

  // Ask git about .env.example once, here, so the rules downstream stay pure.
  // A tracked file is never ignored, which is why both questions are asked.
  if (files.has('.env.example') && state.isGitRepository) {
    const tracked = isTracked(resolved, '.env.example');
    const match = tracked ? null : checkIgnore(resolved, '.env.example');

    state.envExampleIgnore = { ignored: !tracked && match !== null, tracked, match };
  }

  if (!state.projectName && files.has('pyproject.toml')) {
    const pyproject = readFileOrNull(path.join(resolved, 'pyproject.toml')) ?? '';
    const name = /^\s*name\s*=\s*"([^"]+)"/m.exec(pyproject)?.[1];
    const description = /^\s*description\s*=\s*"([^"]+)"/m.exec(pyproject)?.[1];

    if (name) {
      state.projectName = name;
    }
    if (description) {
      state.projectDescription = description;
    }
  }

  return state;
}
