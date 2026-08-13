# Repo Start

A small CLI that creates the boring foundational files of a new repository, correctly.

**Start clean. Build faster.**

Every new repository needs the same unglamorous things: a `.gitignore` that does not
accidentally swallow `.env.example`, a README whose install command matches the project,
a CI workflow that runs commands that actually exist. Repo Start writes those files in
one pass, and makes sure they agree with each other.

It is deliberately not a project generator, not an AI agent, and not a framework. It works
offline and has no runtime dependencies.

## Requirements

- Node.js 22 or newer

## Getting Started

```bash
npm install
npm run build
node dist/index.js my-project
```

Once published, the same thing is:

```bash
npx repo-start my-project
```

Answer a few questions and you get a clean repository:

```text
my-project/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   ├── workflows/
│   │   └── ci.yml
│   └── pull_request_template.md
├── docs/
│   └── README.md
├── src/
│   ├── greet.ts
│   └── index.ts
├── tests/
│   └── greet.test.ts
├── .editorconfig
├── .env.example
├── .gitignore
├── AGENTS.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
├── package.json
├── README.md
└── tsconfig.json
```

## Presets

| Preset      | What you get                                                    |
| ----------- | --------------------------------------------------------------- |
| `generic`   | Hygiene files, `src/` and `tests/`. No language assumptions.      |
| `node-ts`   | `package.json`, `tsconfig.json`, an entry point and a `node --test` starter test. |
| `python`    | `pyproject.toml`, a `src/` package with a CLI entry point and a pytest starter test. |
| `react-ts`  | The smallest reasonable Vite + React + Vitest structure.          |

Each preset is one file in [`src/presets`](src/presets). Adding another one does not
require touching anything else.

## Usage

```bash
repo-start                                  # interactive
repo-start my-project                       # interactive, directory already chosen
repo-start my-project --type node-ts        # skip the questions you already answered
repo-start my-project --type python --yes   # no questions at all
repo-start my-project --dry-run             # show what would happen, change nothing
```

Run `repo-start --help` for the full list of options.

### Safety

Repo Start never overwrites a file you did not ask it to write.

- Existing files are detected before anything is written. On a collision it lists the
  files, changes nothing, and exits non-zero.
- `--force` overwrites exactly the colliding files, and nothing else. It still refuses
  when a directory sits where a file needs to go.
- `--dry-run` prints the plan and touches nothing.
- The filesystem root and your home directory are always refused as targets.

## Development

Install dependencies:

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

Type check the sources and the tests:

```bash
npm run typecheck
```

## Project Structure

```text
repo-start/
├── assets/licenses/       Verbatim license texts, so generation works offline
├── src/
│   ├── cli/               Argument parsing, prompts, terminal output
│   ├── config/            ProjectConfig, defaults and validation
│   ├── generators/        Config to plan, plan to disk
│   ├── presets/           One file per starter profile
│   ├── templates/         One function per generated document
│   └── utils/             Filesystem, git, strings, tree rendering
└── tests/                 Unit, filesystem and end-to-end CLI tests
```

The data flow is one directional and the only impure step is last:

```text
CLI flags ─┐
           ├─→ ProjectConfig ─→ generateProject() ─→ ProjectPlan ─→ writePlan()
prompts ───┘                     pure, in memory                    the only writer
```

Because `generateProject` never touches the filesystem, `--dry-run` is correct by
construction and the tests run in memory.

Every command that appears in a generated README, `AGENTS.md`, `CONTRIBUTING.md` or CI
workflow comes from a single `CommandSet` owned by the preset. `tests/consistency.test.ts`
enforces that: a document may not print a command the preset does not have.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

Notable changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## License

Released under the Apache-2.0 license. See [LICENSE](LICENSE) for the full text.
