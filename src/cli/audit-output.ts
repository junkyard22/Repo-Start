import type { ProjectPlan } from '../config/types.ts';
import { PROJECT_TYPE_LABELS } from '../config/types.ts';
import type { AuditIssue, RepoAudit, RepoState } from '../audit/types.ts';
import type { WriteResult } from '../generators/write-files.ts';
import { bold, dim, green, red, yellow } from './output.ts';

/** The one-line "what is this project" summary. */
function detected(state: RepoState): string[] {
  const facts = [PROJECT_TYPE_LABELS[state.detectedType]];

  if (state.packageManager) {
    facts.push(state.packageManager);
  }
  if (state.isGitRepository) {
    facts.push('git repository');
  }
  if (state.workflows.length > 0) {
    facts.push('GitHub Actions');
  }

  return facts;
}

function issueLines(issue: AuditIssue, marker: string): string[] {
  const lines = [`  ${marker} ${issue.message}`];

  for (const detail of issue.details) {
    lines.push(`    ${dim(detail)}`);
  }
  if (issue.fix) {
    lines.push(`    ${dim(`fixable: ${issue.fix.description}`)}`);
  }

  return lines;
}

function count(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

/** The audit report, which is useful on its own. */
export function renderAudit(audit: RepoAudit): string {
  const { state } = audit;
  const lines = [
    bold('Repo Start Audit'),
    '',
    `Project: ${state.projectName ?? state.name}`,
    `Detected: ${detected(state).join(', ')}`,
    '',
    `${count(audit.missing.length, 'file')} missing, ${count(
      audit.issues.length + audit.warnings.length,
      'issue',
    )} found`,
  ];

  if (audit.present.length > 0) {
    lines.push('', 'Present:');

    for (const item of audit.present) {
      lines.push(`  ${green('✓')} ${item.label}`);
    }
  }

  if (audit.missing.length > 0) {
    lines.push('', 'Missing:');

    for (const item of audit.missing) {
      lines.push(`  ${red('✗')} ${item.label}`);
    }
  }

  const hasFindings =
    audit.issues.length > 0 || audit.warnings.length > 0 || audit.verified.length > 0;

  if (hasFindings) {
    lines.push('', 'Issues:');

    for (const issue of audit.issues) {
      lines.push(...issueLines(issue, red('!')));
    }
    for (const warning of audit.warnings) {
      lines.push(...issueLines(warning, yellow('!')));
    }
    for (const item of audit.verified) {
      lines.push(`  ${green('✓')} ${item.label}`);
    }
  }

  return lines.join('\n');
}

/** What the plan would do, printed before anything is written. */
export function renderAddPlan(plan: ProjectPlan, result: WriteResult): string {
  const lines: string[] = [];

  if (result.createdFiles.length > 0) {
    lines.push('', result.dryRun ? 'Would create:' : 'Created:');

    for (const file of result.createdFiles) {
      lines.push(`  ${file}`);
    }
  }

  if (plan.edits.length > 0) {
    lines.push('', result.dryRun ? 'Would modify:' : 'Modified:');

    for (const edit of plan.edits) {
      lines.push(`  ${edit.path}`);

      for (const summary of edit.summary) {
        lines.push(`    ${summary}`);
      }
    }
  }

  for (const note of plan.notes) {
    lines.push('', yellow(`Note: ${note}`));
  }

  if (result.dryRun) {
    lines.push('', dim('No files were changed.'));
  } else if (result.createdFiles.length === 0 && plan.edits.length === 0) {
    lines.push('', dim('Nothing was changed.'));
  } else {
    lines.push(
      '',
      `${green('✓')} ${count(result.createdFiles.length, 'file')} added, ${count(
        plan.edits.length,
        'file',
      )} updated.`,
    );
  }

  return lines.join('\n');
}
