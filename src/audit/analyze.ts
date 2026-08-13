import type { AuditCode, AuditFix, AuditIssue, AuditItem, RepoAudit, RepoState } from './types.ts';

/**
 * The audit rules.
 *
 * Every rule is a plain deterministic check over RepoState. There is no rule
 * engine and no plugin surface on purpose: a reader should be able to see the
 * complete list of things Repo Start looks for by scrolling this file.
 *
 * The guiding bias is that a false positive is worse than a missed exotic
 * problem, so anything ambiguous is reported as a warning, or not at all.
 */

interface HygieneCheck {
  code: AuditCode;
  path: string;
  label: string;
}

const HYGIENE_CHECKS: HygieneCheck[] = [
  { code: 'missing-readme', path: 'README.md', label: 'README.md' },
  { code: 'missing-gitignore', path: '.gitignore', label: '.gitignore' },
  { code: 'missing-gitattributes', path: '.gitattributes', label: '.gitattributes' },
  { code: 'missing-env-example', path: '.env.example', label: '.env.example' },
  { code: 'missing-agents', path: 'AGENTS.md', label: 'AGENTS.md' },
  { code: 'missing-contributing', path: 'CONTRIBUTING.md', label: 'CONTRIBUTING.md' },
  { code: 'missing-changelog', path: 'CHANGELOG.md', label: 'CHANGELOG.md' },
  { code: 'missing-docs', path: 'docs', label: 'docs/' },
  {
    code: 'missing-issue-template',
    path: '.github/ISSUE_TEMPLATE',
    label: 'GitHub issue templates',
  },
  {
    code: 'missing-pr-template',
    path: '.github/pull_request_template.md',
    label: 'pull request template',
  },
];

/** A command line found inside a document, with the line it came from. */
export interface FoundCommand {
  /** 1-based line number within the file. */
  line: number;
  /** The full original line, indentation included. */
  raw: string;
  /** The command itself, trimmed. */
  command: string;
}

/** Pull command lines out of fenced code blocks in a markdown document. */
export function fencedCommands(markdown: string): FoundCommand[] {
  const found: FoundCommand[] = [];
  const lines = markdown.split('\n');
  let inside = false;

  lines.forEach((raw, index) => {
    const trimmed = raw.trim();

    if (trimmed.startsWith('```')) {
      // Only shell-ish blocks are considered; a fence with no language, or a
      // ts/json block, is not a command list.
      inside = inside ? false : /^```(bash|sh|shell|console|zsh)$/.test(trimmed);
      return;
    }
    if (inside && trimmed.length > 0 && !trimmed.startsWith('#')) {
      found.push({ line: index + 1, raw, command: trimmed });
    }
  });

  return found;
}

/** Pull `run:` command lines out of a workflow file. */
export function workflowCommands(yaml: string): FoundCommand[] {
  const found: FoundCommand[] = [];

  yaml.split('\n').forEach((raw, index) => {
    const match = /^\s*-?\s*run:\s*(.+)$/.exec(raw);
    const command = match?.[1]?.trim();

    // `run: |` opens a block scalar; its body is not read, which is a known
    // and documented limitation rather than a guess.
    if (command && command !== '|' && command !== '>') {
      found.push({ line: index + 1, raw, command });
    }
  });

  return found;
}

interface NpmInvocation {
  kind: 'install' | 'run' | 'shorthand';
  /** The script the command would run, for 'run' and 'shorthand'. */
  script?: string;
}

/**
 * Recognise a simple npm invocation.
 *
 * Anything compound, quoted or chained returns null. Repo Start would rather
 * say nothing than misread a shell line.
 */
export function parseNpmCommand(command: string): NpmInvocation | null {
  const withoutComment = command.split('#')[0]?.trim() ?? '';

  if (/[&|;><`$()]/.test(withoutComment)) {
    return null;
  }

  const parts = withoutComment.split(/\s+/);

  if (parts[0] !== 'npm') {
    return null;
  }

  const verb = parts[1];

  if (verb === 'install' || verb === 'ci' || verb === 'i') {
    return { kind: 'install' };
  }
  if (verb === 'run' || verb === 'run-script') {
    const script = parts[2];

    return script && !script.startsWith('-') ? { kind: 'run', script } : null;
  }
  if (verb === 'test' || verb === 'start') {
    return parts.length === 2 ? { kind: 'shorthand', script: verb } : null;
  }

  return null;
}

/** The canonical way to invoke a script with npm. */
function canonicalNpmCommand(script: string): string {
  return script === 'test' || script === 'start' ? `npm ${script}` : `npm run ${script}`;
}

function replaceInLine(found: FoundCommand, from: string, to: string): AuditFix['edits'] {
  return [{ line: found.line, before: found.raw, after: [found.raw.replace(from, to)] }];
}

/** Check the npm commands a document shows against the scripts that exist. */
function auditDocumentCommands(
  state: RepoState,
  file: string,
  issues: AuditIssue[],
  warnings: AuditIssue[],
): void {
  const contents = state.documents.get(file);
  const scripts = state.packageScripts;

  if (!contents || !scripts) {
    return;
  }

  for (const found of fencedCommands(contents)) {
    const invocation = parseNpmCommand(found.command);

    if (!invocation || invocation.kind === 'install' || !invocation.script) {
      continue;
    }

    const { script } = invocation;
    const canonical = canonicalNpmCommand(script);

    if (!scripts[script]) {
      issues.push({
        code: 'doc-command-missing',
        message: `${file} documents \`${found.command}\` but package.json has no \`${script}\` script`,
        details: [`${file}:${found.line}`],
        file,
      });
      continue;
    }

    // `npm run test` works, so this is a consistency problem rather than a
    // broken command. It is reported as a warning and fixed only on request.
    // The check is deliberately narrow: only an exact `npm run test` or
    // `npm run start`, with no extra arguments, is flagged.
    if (invocation.kind === 'run' && found.command === `npm run ${script}` && canonical !== found.command) {
      warnings.push({
        code: 'doc-command-mismatch',
        message: `${file} uses \`${found.command}\` where package.json defines it as \`${canonical}\``,
        details: [`${file}:${found.line}`],
        file,
        fix: {
          file,
          description: `${found.command} → ${canonical}`,
          edits: replaceInLine(found, found.command, canonical),
        },
      });
    }
  }
}

/** Check that every npm script a workflow runs actually exists. */
function auditWorkflows(
  state: RepoState,
  issues: AuditIssue[],
  verified: AuditItem[],
): void {
  const scripts = state.packageScripts;

  if (!scripts) {
    return;
  }

  const confirmed = new Set<string>();

  for (const workflow of state.workflows) {
    const contents = state.documents.get(workflow);

    if (!contents) {
      continue;
    }

    for (const found of workflowCommands(contents)) {
      const invocation = parseNpmCommand(found.command);

      if (!invocation || invocation.kind === 'install' || !invocation.script) {
        continue;
      }

      const { script } = invocation;

      if (scripts[script]) {
        confirmed.add(script);
      } else {
        issues.push({
          code: 'ci-command-missing',
          message: `CI runs \`${found.command}\` but package.json has no \`${script}\` script`,
          details: [`${workflow}:${found.line}`],
          file: workflow,
        });
      }
    }
  }

  for (const script of [...confirmed].sort((a, b) => a.localeCompare(b, 'en'))) {
    verified.push({ code: 'ci-command-ok', label: `CI ${script} command exists` });
  }
}

/** Report a .env.example that git will not track, and fix it when it is safe. */
function auditEnvExample(
  state: RepoState,
  issues: AuditIssue[],
  warnings: AuditIssue[],
): void {
  if (!state.files.has('.env.example')) {
    return;
  }

  if (!state.isGitRepository) {
    warnings.push({
      code: 'check-skipped',
      message: 'Could not check whether .env.example is ignored: this is not a git repository',
      details: [],
    });
    return;
  }

  const status = state.envExampleIgnore;

  if (!status || !status.ignored || !status.match) {
    return;
  }

  const { match } = status;
  const gitignore = state.documents.get('.gitignore');
  const issue: AuditIssue = {
    code: 'env-example-ignored',
    message: '.env.example exists but git ignores it, so nobody else will receive it',
    details: [`Ignored by ${match.source}:${match.line} (rule: ${match.pattern})`],
    file: '.gitignore',
  };

  const lines = gitignore?.split('\n') ?? [];
  const offending = lines[match.line - 1];

  // Only the repository's own root .gitignore is edited, and only when the
  // matched line is exactly where git said it would be. Anything else (a
  // nested, global or excluded-file rule) is reported and left alone.
  const fixable =
    match.source === '.gitignore' &&
    gitignore !== undefined &&
    offending !== undefined &&
    offending.trim() === match.pattern &&
    !lines.some((line) => line.trim() === '!.env.example');

  if (fixable && offending !== undefined) {
    issue.fix = {
      file: '.gitignore',
      description: `add \`!.env.example\` after \`${match.pattern}\``,
      edits: [{ line: match.line, before: offending, after: [offending, '!.env.example'] }],
    };
  } else {
    issue.details.push('Repo Start will not edit this rule automatically.');
  }

  issues.push(issue);
}

/**
 * Turn an inspected repository into a structured audit.
 *
 * Pure: same RepoState in, same RepoAudit out, no filesystem access.
 */
export function analyzeRepository(state: RepoState): RepoAudit {
  const present: AuditItem[] = [];
  const missing: AuditItem[] = [];
  const issues: AuditIssue[] = [];
  const warnings: AuditIssue[] = [];
  const verified: AuditItem[] = [];

  for (const check of HYGIENE_CHECKS) {
    const item: AuditItem = { code: check.code, path: check.path, label: check.label };

    if (state.files.has(check.path)) {
      present.push(item);
    } else {
      missing.push(item);
    }
  }

  const ciItem: AuditItem = {
    code: 'missing-ci',
    path: '.github/workflows/ci.yml',
    label: 'GitHub Actions workflow',
  };

  if (state.workflows.length > 0) {
    present.push(ciItem);
  } else {
    missing.push(ciItem);
  }

  auditEnvExample(state, issues, warnings);

  if (state.packageManager === 'npm' && state.packageScripts) {
    for (const document of ['README.md', 'AGENTS.md', 'CONTRIBUTING.md']) {
      auditDocumentCommands(state, document, issues, warnings);
    }
    auditWorkflows(state, issues, verified);
  } else if (state.files.has('package.json')) {
    // An unreadable manifest is the blocking reason when there is one: naming
    // the package manager instead would be true and useless.
    const reason = state.packageScripts
      ? `Repo Start only validates npm commands, and this project uses ${state.packageManager ?? 'an unrecognised package manager'}`
      : 'package.json could not be read, so there are no scripts to check against';

    warnings.push({
      code: 'check-skipped',
      message: `Command checks were skipped: ${reason}`,
      details: [],
    });
  }

  if (!state.detectionIsConfident) {
    warnings.push({
      code: 'detection-ambiguous',
      message: `Could not confidently classify this project, treating it as ${state.detectedType}`,
      details: ['Pass --type to state the project type explicitly.'],
    });
  }

  return { state, present, missing, issues, warnings, verified };
}
