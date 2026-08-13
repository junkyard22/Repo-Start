# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Refuse symbolic links and Windows junctions anywhere inside a write target,
  preventing generated files from being redirected outside the project.
- Prefix Python keywords when deriving module names, so names such as `class`
  produce valid imports.
- Reject create-only options passed to `repo-start add` instead of silently
  ignoring an explicit flag such as `--no-env`.
- Render accepted `add` documents from the final selection, so they never
  reference optional files the user declined.
- Read an existing repository's runtime version file when adding CI rather
  than substituting a preset Node.js or Python version.
- Correct the Node.js floors used by this repository and the React preset.

### Security

- Pin GitHub Actions to immutable commits, grant the workflow read-only
  repository contents, use `npm ci` when a lockfile exists, and add Dependabot
  update configuration.

## [0.2.0]

### Added

- `repo-start add`: audit an existing repository and fill in the missing
  repository hygiene. It inspects read-only, reports what is present, missing
  or inconsistent, and changes only what you approve.
- Audit checks: missing hygiene files, a `.env.example` that git ignores,
  documented npm commands that do not match `package.json`, and GitHub Actions
  steps that run scripts which do not exist.
- Safe targeted fixes: un-ignore `.env.example` by adding one line to
  `.gitignore`, and correct a documented command. Both are narrow line edits
  that leave the rest of the file untouched.
- `repo-start add --dry-run` is a complete audit on its own and writes nothing.
- `repo-start add --yes` applies every change classified as safe.

### Changed

- `ProjectPlan` can now carry narrow edits to existing files, applied by the
  same single writer that creates new files. Creating a project never uses them.

## [0.1.0]

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
- A `.gitattributes` with LF normalization in every generated project, and in
  Repo Start itself.

### Changed

- Build on `prepack` instead of `prepublishOnly`, so `npm pack` always produces
  a tarball containing the compiled CLI.
