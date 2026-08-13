import { analyzeRepository } from '../audit/analyze.ts';
import { inspectRepository } from '../audit/inspect.ts';
import { buildAddPlan, buildProposals } from '../audit/plan.ts';
import type { AddProposal } from '../audit/plan.ts';
import type { ProjectType } from '../config/types.ts';
import { RepoStartError } from '../config/validate.ts';
import { writePlan } from '../generators/write-files.ts';
import { resolveTarget } from '../utils/filesystem.ts';
import { renderAddPlan, renderAudit } from './audit-output.ts';
import { dim } from './output.ts';
import { Prompter } from './prompts.ts';

export interface AddCommandOptions {
  /** Directory to inspect. Defaults to the current directory. */
  directory: string;
  dryRun: boolean;
  yes: boolean;
  /** Overrides detection when the user knows better. */
  type?: ProjectType;
  /** True when Repo Start may ask questions. */
  interactive: boolean;
}

/** Ask about each proposal, carrying followers along with their leader. */
async function selectProposals(proposals: AddProposal[]): Promise<AddProposal[]> {
  const prompter = new Prompter();
  const accepted = new Set<string>();

  try {
    prompter.write('\n');

    for (const proposal of proposals) {
      if (proposal.follows) {
        continue;
      }
      if (await prompter.confirm(proposal.question, true)) {
        accepted.add(proposal.id);
      }
    }
  } finally {
    prompter.close();
  }

  return proposals.filter(
    (proposal) => accepted.has(proposal.follows ?? proposal.id),
  );
}

/**
 * `repo-start add`: inspect an existing repository, report what is missing or
 * inconsistent, and apply only what the user approves.
 *
 * The whole command is read-only until the final writePlan call.
 */
export async function runAddCommand(
  options: AddCommandOptions,
  cwd: string,
  write: (text: string) => void,
): Promise<number> {
  const root = resolveTarget(cwd, options.directory);
  const state = inspectRepository(root);

  if (options.type) {
    state.detectedType = options.type;
    state.detectionIsConfident = true;
  }

  const audit = analyzeRepository(state);

  write(`${renderAudit(audit)}\n`);

  const proposals = buildProposals(audit);

  if (proposals.length === 0) {
    write(`\n${dim('Nothing to add. This repository already has what Repo Start offers.')}\n`);
    return 0;
  }

  let accepted: AddProposal[];

  if (options.dryRun || options.yes) {
    // Both modes take every safe proposal: dry run so the report is complete,
    // --yes because every proposal is a safe addition or a precise fix.
    accepted = proposals;
  } else if (options.interactive) {
    accepted = await selectProposals(proposals);
  } else {
    throw new RepoStartError('Repo Start cannot ask which changes to apply here.', [
      'Re-run with --dry-run to see the plan, or --yes to apply every safe change.',
    ]);
  }

  const plan = buildAddPlan(audit, accepted);
  const result = await writePlan(root, plan, { dryRun: options.dryRun, force: false });

  write(`${renderAddPlan(plan, result)}\n`);

  return 0;
}
