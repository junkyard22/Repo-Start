import type { FileEntry, ProjectConfig } from '../config/types.ts';
import { escapeQuotes, toPythonModule } from '../utils/strings.ts';
import { spdxId } from '../templates/license.ts';
import type { Preset } from './types.ts';

/** Python version used by the generated CI workflow. */
const PYTHON_VERSION = '3.13';

/** Minimum version declared in pyproject.toml. */
const REQUIRES_PYTHON = '3.10';

function moduleName(config: ProjectConfig): string {
  return toPythonModule(config.packageName);
}

function pyprojectToml(config: ProjectConfig): string {
  const license = spdxId(config.license);

  const lines = [
    '[build-system]',
    'requires = ["setuptools>=77"]',
    'build-backend = "setuptools.build_meta"',
    '',
    '[project]',
    `name = "${escapeQuotes(config.packageName)}"`,
    'version = "0.1.0"',
    `description = "${escapeQuotes(config.description)}"`,
    'readme = "README.md"',
    `requires-python = ">=${REQUIRES_PYTHON}"`,
  ];

  if (license) {
    lines.push(`license = "${license}"`);
  }
  if (config.author) {
    lines.push(`authors = [{ name = "${escapeQuotes(config.author)}" }]`);
  }

  lines.push(
    'dependencies = []',
    '',
    '[project.optional-dependencies]',
    'dev = ["pytest>=8"]',
    '',
    '[tool.setuptools.packages.find]',
    'where = ["src"]',
    '',
    '[tool.pytest.ini_options]',
    'testpaths = ["tests"]',
    '',
  );

  return lines.join('\n');
}

function initPy(config: ProjectConfig): string {
  return `"""${config.name}."""

from .core import greet

__all__ = ["greet"]
__version__ = "0.1.0"
`;
}

function corePy(config: ProjectConfig): string {
  return `"""Core logic for ${config.name}."""


def greet(name: str) -> str:
    """Return the greeting shown by the command line entry point."""
    return f"Hello, {name}!"
`;
}

function mainPy(config: ProjectConfig): string {
  return `"""Command line entry point for ${config.name}."""

import sys

from .core import greet


def main() -> int:
    name = sys.argv[1] if len(sys.argv) > 1 else "world"
    print(greet(name))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
`;
}

function testCorePy(config: ProjectConfig): string {
  return `from ${moduleName(config)}.core import greet


def test_greet_addresses_the_given_name() -> None:
    assert greet("Ada") == "Hello, Ada!"
`;
}

const CI_WORKFLOW = `name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-python@v6
        with:
          python-version: '${PYTHON_VERSION}'

      - run: python -m pip install --upgrade pip

      - run: python -m pip install -e ".[dev]"

      - run: pytest
`;

export const pythonPreset: Preset = {
  id: 'python',
  label: 'Python',

  requirements: () => [`Python ${REQUIRES_PYTHON} or newer`],

  commands: (config) => ({
    install: [
      'python -m venv .venv',
      'source .venv/bin/activate  # Windows: .venv\\Scripts\\activate',
      'python -m pip install --upgrade pip',
      'python -m pip install -e ".[dev]"',
    ],
    test: 'pytest',
    start: `python -m ${moduleName(config)}`,
  }),

  gitignore: () => [
    {
      title: 'Virtual environments',
      patterns: ['.venv/', 'venv/'],
    },
    {
      title: 'Byte-compiled and packaging output',
      patterns: ['__pycache__/', '*.py[cod]', 'build/', 'dist/', '*.egg-info/'],
    },
    {
      title: 'Tooling caches',
      patterns: ['.pytest_cache/', '.mypy_cache/', '.ruff_cache/', '.coverage'],
    },
  ],

  envExample: () => ['LOG_LEVEL=info'],

  files: (config): FileEntry[] => {
    const module = moduleName(config);

    return [
      { path: 'pyproject.toml', contents: pyprojectToml(config) },
      { path: `src/${module}/__init__.py`, contents: initPy(config) },
      { path: `src/${module}/core.py`, contents: corePy(config) },
      { path: `src/${module}/__main__.py`, contents: mainPy(config) },
      { path: 'tests/test_core.py', contents: testCorePy(config) },
    ];
  },

  directories: () => [],

  ci: () => CI_WORKFLOW,

  structure: (config) => [
    { path: `src/${moduleName(config)}/`, description: 'Python package source.' },
    { path: 'tests/', description: 'Tests run by pytest.' },
    { path: 'pyproject.toml', description: 'Project metadata, dependencies and pytest settings.' },
  ],
};
