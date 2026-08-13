# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial project structure.
- Interactive prompts for project, repository and development file choices.
- Presets: generic, Node.js + TypeScript, Python, React + TypeScript.
- Generated files: `README.md`, `.gitignore`, `.editorconfig`, `.env.example`,
  `AGENTS.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `LICENSE`, `docs/`, GitHub Actions
  workflow, issue templates and pull request template.
- Licenses: MIT, Apache-2.0 and GPL-3.0, shipped as verbatim text.
- Collision detection with `--force` and `--dry-run`.
- Non-interactive mode via command line flags and `--yes`.
- Optional `git init`.
