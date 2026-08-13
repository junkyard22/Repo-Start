# Contributing

Thanks for taking the time to contribute to Repo Start.

## Setup

```bash
git clone <repository-url>
cd repo-start
npm install
```

## Making Changes

1. Create a branch off `main`, for example `feature/short-description` or `fix/short-description`.
2. Keep each pull request focused on one change.
3. Write clear commit messages that explain why the change was made.
4. Update documentation when behavior or commands change.
5. Add a line to the `Unreleased` section of `CHANGELOG.md` for user visible changes.

## Adding a Preset

A starter profile is one file in `src/presets/` implementing the `Preset` interface, plus
one line in `src/presets/index.ts` and one member in `ProjectType`. A preset owns its
commands, ignore rules, starter files and CI workflow; the documents are generated from
those, so nothing else needs editing.

If a preset has no legitimate build or test command, return `null` from `ci()`. Repo Start
would rather skip a workflow and say why than emit commands that do not exist.

## Testing

Run the test suite before opening a pull request:

```bash
npm test
```

Make sure the project still builds and type checks:

```bash
npm run build
npm run typecheck
```

Tests that touch the filesystem must use the `withTempDir` helper in `tests/helpers.ts`.
Nothing may be written outside a temporary directory.

## Pull Requests

- Describe what changed and why.
- Link any related issue.
- Note anything a reviewer should pay particular attention to.
- Make sure CI is green before requesting a review.
