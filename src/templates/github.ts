import type { CommandSet, ProjectConfig } from '../config/types.ts';

/** `.github/ISSUE_TEMPLATE/bug_report.md` */
export function renderBugReportTemplate(): string {
  return `---
name: Bug report
about: Report something that is not working
title: ''
labels: bug
assignees: ''
---

## Summary

A clear description of what is wrong.

## Steps to reproduce

1.
2.
3.

## Expected behavior

What you expected to happen.

## Actual behavior

What happened instead. Include error output if there is any.

## Environment

- Operating system:
- Version:
`;
}

/** `.github/ISSUE_TEMPLATE/feature_request.md` */
export function renderFeatureRequestTemplate(): string {
  return `---
name: Feature request
about: Suggest an improvement
title: ''
labels: enhancement
assignees: ''
---

## Problem

The problem this feature would solve.

## Proposed solution

What you would like to happen.

## Alternatives considered

Other approaches you thought about.
`;
}

/** `.github/pull_request_template.md` */
export function renderPullRequestTemplate(
  config: ProjectConfig,
  commands: CommandSet,
): string {
  const checklist = ['- [ ] I have read the contributing guidelines.'];

  if (!config.includeContributing) {
    checklist.length = 0;
  }
  if (commands.test) {
    checklist.push(`- [ ] Tests pass locally (\`${commands.test}\`).`);
  }
  checklist.push('- [ ] Documentation is updated where needed.');

  if (config.includeChangelog) {
    checklist.push('- [ ] `CHANGELOG.md` is updated for user visible changes.');
  }

  return `## Summary

What does this pull request change, and why?

## Related issues

Closes #

## How was this tested?

Describe the checks you ran.

## Checklist

${checklist.join('\n')}
`;
}
