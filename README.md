# Repo Start

A small CLI that creates the boring foundational files of a new repository, correctly.

**Start clean. Build faster.**

Every new repository needs the same unglamorous things: a `.gitignore` that does not
accidentally swallow `.env.example`, a `.gitattributes` that keeps line endings from
turning every diff into noise, a README whose install command matches the project, a CI
workflow that runs commands that actually exist. Repo Start writes those files in one
pass, and makes sure they agree with each other.

It is deliberately not a project generator, not an AI agent, and not a framework. It works
offline and has no runtime dependencies.

## Requirements

- Node.js 22.18 or newer

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
├── .gitattributes
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

## Existing repositories

`repo-start add` brings the same idea to a repository that already exists. It
inspects the repository, reports what is missing or inconsistent, and changes
only what you approve.

```bash
repo-start add                     # audit the current directory, then ask
repo-start add ./some-project      # audit somewhere else
repo-start add --dry-run           # audit only, guaranteed to write nothing
repo-start add --yes               # apply every change it considers safe
```

```text
Repo Start Audit

Project: demo-app
Detected: Node.js + TypeScript, npm, git repository, GitHub Actions

7 files missing, 3 issues found

Missing:
  ✗ .gitattributes
  ✗ AGENTS.md
  ✗ CHANGELOG.md

Issues:
  ! .env.example exists but git ignores it, so nobody else will receive it
    Ignored by .gitignore:3 (rule: .env*)
    fixable: add `!.env.example` after `.env*`
  ! README.md uses `npm run test` where package.json defines it as `npm test`
    fixable: npm run test → npm test
  ✓ CI build command exists
  ✓ CI test command exists
```

What it checks:

- hygiene files that are missing: `.gitattributes`, `.env.example`, `AGENTS.md`,
  `CONTRIBUTING.md`, `CHANGELOG.md`, `docs/`, issue and pull request templates,
  a CI workflow
- whether git actually ignores your `.env.example`, asked of git itself
- whether the npm commands in your README, `AGENTS.md` and `CONTRIBUTING.md`
  match the scripts in `package.json`
- whether the npm scripts your GitHub Actions workflow runs exist

What it will not do:

- overwrite a file you already have, for any reason
- write a README or choose a license for an existing project
- touch source code, dependencies, git history, or anything outside repository
  hygiene
- apply a fix it cannot describe precisely; ambiguous findings are reported and
  left alone

Generated documents are built from your repository's real commands, so
`repo-start add` cannot introduce a command your project does not have. If your
`package.json` has no `build` script, nothing it writes will mention one.

### Safety

Repo Start never overwrites a file you did not ask it to write.

- Existing files are detected before anything is written. On a collision it lists the
  files, changes nothing, and exits non-zero.
- `--force` overwrites exactly the colliding files, and nothing else. It still refuses
  when a directory sits where a file needs to go.
- `--dry-run` prints the plan and touches nothing.
- The filesystem root and your home directory are always refused as targets.
- Existing symbolic links and Windows junctions inside the target are refused,
  so a generated path cannot be redirected outside the project.

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

Test with coverage, which fails below 95% lines, 88% branches and 95% functions:

```bash
npm run coverage
```

CI runs all of the above on Node.js 22.18 and 24, on Ubuntu and Windows, and
additionally generates a React and a Python project and builds and tests each
one for real.

## Project Structure

```text
repo-start/
├── assets/licenses/       Verbatim license texts, so generation works offline
├── src/
│   ├── audit/             Inspecting and analysing an existing repository
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

`repo-start add` reuses the same spine, with a read-only front end:

```text
existing repo ─→ inspectRepository() ─→ RepoState ─→ analyzeRepository() ─→ RepoAudit
                   read-only               typed          pure                  │
                                                                     selection ─┤
                                                                                ↓
                                                          buildAddPlan() ─→ ProjectPlan ─→ writePlan()
```

Both paths end at the same writer, so `--dry-run` is correct by construction in
both modes rather than by a check at every filesystem call.

Because `generateProject` never touches the filesystem, `--dry-run` is correct by
construction and the tests run in memory.

Every command that appears in a generated README, `AGENTS.md`, `CONTRIBUTING.md` or CI
workflow comes from a single `CommandSet` owned by the preset. `tests/consistency.test.ts`
enforces that: a document may not print a command the preset does not have.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

Notable changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md). Please do not open a
public issue for one.

Releases are published from a tag using npm trusted publishing, so no long-lived
npm token exists for this package, and every published version carries
provenance. Verify it with `npm audit signatures`.

## License

Released under the Apache-2.0 license. See [LICENSE](LICENSE) for the full text.
