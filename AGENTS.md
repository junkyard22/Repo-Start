# AGENTS.md

## Project

Repo Start — a CLI that creates the boring foundational files of a new repository.
Deterministic, offline, no runtime dependencies.

## Structure

- `src/audit/` — `repo-start add`: `inspect.ts` reads an existing repository,
  `analyze.ts` turns that state into an audit, `plan.ts` turns approved
  proposals into a ProjectPlan.
- `src/cli/` — argument parsing, prompts and terminal output.
- `src/config/` — `ProjectConfig`, defaults and validation.
- `src/generators/` — `generateProject` (pure) and `writePlan` (the only filesystem writer).
- `src/presets/` — one file per starter profile, registered in `src/presets/index.ts`.
- `src/templates/` — one function per generated document.
- `src/utils/` — filesystem, git, string and tree helpers.
- `assets/licenses/` — verbatim license texts, shipped with the package.
- `tests/` — unit, filesystem and end-to-end CLI tests.

## Development

Install:

```bash
npm install
```

Build:

```bash
npm run build
```

Test:

```bash
npm test
```

Type check sources and tests:

```bash
npm run typecheck
```

## Conventions

- `generateProject` must stay pure. It reads no user files and writes nothing, which is
  what makes `--dry-run` trustworthy. Filesystem access belongs in `writePlan`.
- A preset's `CommandSet` is the single source of truth for commands. Never hard code a
  command inside a template; read it from the config the template is given.
- Never generate a command that does not exist in the generated project. If a preset has
  nothing real to run, return `null` and add a note instead.
- `inspectRepository` is the only place `repo-start add` reads the filesystem, and
  `analyzeRepository` must stay pure. Ask git its own questions (`check-ignore`,
  `ls-files`) rather than reimplementing gitignore semantics.
- An audit rule reports rather than guesses. A false positive costs more than a
  missed exotic case, and a fix ships only when the exact lines to change are known.
- Never generate credential values. `.env.example` holds variable names and placeholders.
- Internal imports use explicit `.ts` extensions; `tsc` rewrites them on build.
- No runtime dependencies. Node's standard library is expected to be enough.

## Guidelines

- Keep changes scoped to the task at hand.
- Add or update tests when behavior changes.
- Do not commit credentials or secrets.
- Preserve existing project conventions.
- Update documentation when commands or architecture change.
