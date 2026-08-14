# Security Policy

## Supported versions

Repo Start is pre-1.0. Only the most recent release receives security fixes.

| Version | Supported |
| ------- | --------- |
| 0.2.x   | Yes       |
| < 0.2   | No        |

## Reporting a vulnerability

Please report vulnerabilities privately, not in a public issue.

Use GitHub's [private vulnerability reporting](https://github.com/junkyard22/Repo-Start/security/advisories/new)
for this repository. If that is unavailable to you, email
<jamesryarber@gmail.com> with `repo-start security` in the subject.

Please include:

- what an attacker can do, and what they need in order to do it
- the version, operating system and Node.js version you saw it on
- the smallest sequence of commands that reproduces it

You can expect an acknowledgement within 7 days and an assessment within 30. If
the report is accepted, you will be credited in the advisory and the changelog
unless you would rather not be.

Please give a fix a reasonable chance to ship before disclosing publicly.

## What is in scope

Repo Start is an offline command line tool with no runtime dependencies and no
network access. It reads a directory and writes files into it. The interesting
security boundary is therefore the filesystem, and the things worth reporting
look like:

- writing outside the target directory, including through a symbolic link,
  a Windows junction, a hard link or a `..` path segment
- overwriting an existing file without `--force`, or writing anything at all
  under `--dry-run`
- a generated file that embeds attacker-controlled input in a way that executes
  it, for example through a project name that reaches a shell or a workflow file
- the published npm tarball containing something the repository does not

## What is not in scope

- vulnerabilities in the dependencies of a *generated* project, such as Vite or
  pytest; report those upstream
- the generated CI workflows or `.gitignore` not matching your organization's
  policy
- running Repo Start against a directory you do not control, and being surprised
  by what is already in it

## Verifying a release

Releases are published from a tag by
[`.github/workflows/release.yml`](.github/workflows/release.yml) using npm
trusted publishing, so no long-lived npm token exists for this package. Each
published version carries provenance linking it to the commit and workflow run
that built it:

```bash
npm audit signatures
```
