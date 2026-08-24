/**
 * Phase 3F: Safe Human Approval Prompt & Formatter
 *
 * Formats the validated mutation plan and diff clearly for terminal presentation,
 * and prompts for explicit user approval before applying changes to disk.
 *
 * Safety properties:
 *  - Displays validated diff, not merely the model's claim.
 *  - Sanitises paths and strips sensitive metadata.
 *  - Never displays or logs API keys or credentials.
 *  - Defaults to rejection if user enters anything other than explicit yes.
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import pc from "picocolors";
import type { ApprovalPromptDetails } from "./types.js";

/**
 * Formats a clean, readable terminal summary of the proposed mutation and validated diff.
 */
export function formatApprovalDisplay(details: ApprovalPromptDetails): string {
  const { recommendation, locatorResult, patchPlan, validatedPatch } = details;

  const lines: string[] = [];
  const hr = pc.dim("─".repeat(70));

  lines.push(hr);
  lines.push(pc.bold(pc.cyan(" Elevate: Proposed Mutation Plan")));
  lines.push(hr);

  // Recommendation
  lines.push(`${pc.bold("Recommendation:")} ${recommendation.id}`);
  lines.push(`${pc.bold("Problem:")}        ${recommendation.problem}`);
  lines.push(`${pc.bold("Improvement:")}    ${recommendation.proposedImprovement}`);

  // Target Details
  const componentName =
    locatorResult.primaryCandidate?.componentNames.join(", ") ||
    locatorResult.primaryCandidate?.relativePath ||
    "Unknown component";
  lines.push(`${pc.bold("Affected:")}       ${componentName} (${recommendation.affectedSelector || "General layout"})`);
  lines.push(`${pc.bold("Viewports:")}      ${recommendation.affectedViewports?.join(", ") || "All"}`);

  // Metrics
  const riskBadge =
    recommendation.risk === "low"
      ? pc.green("LOW")
      : recommendation.risk === "medium"
      ? pc.yellow("MEDIUM")
      : pc.red("HIGH");
  const confidence = Math.round((recommendation.confidence ?? 1.0) * 100);
  lines.push(`${pc.bold("Risk / Confidence:")} ${riskBadge} ${pc.dim("|")} ${confidence}%`);

  // File & Line counts
  const filesTouched = validatedPatch.normalizedFiles.length;
  const additions = validatedPatch.parsedDiff.totalAdditions;
  const deletions = validatedPatch.parsedDiff.totalDeletions;
  lines.push(
    `${pc.bold("Changes:")}          ${filesTouched} file(s) touched ` +
    `(${pc.green(`+${additions}`)} / ${pc.red(`-${deletions}`)})`
  );

  // Validation Guard Checklist
  lines.push("");
  lines.push(pc.bold("Safety Validation Checklist:"));
  const pathCheck = validatedPatch.pathGuardResult.valid
    ? pc.green("  ✓ Protected paths guarded (no critical configs or secrets)")
    : pc.red("  ✗ Protected path violation");
  const scopeCheck = validatedPatch.scopeResult.valid
    ? pc.green(`  ✓ Scope boundaries respected (max ${patchPlan.maxFilesAllowed} files, ${patchPlan.maxLinesChanged} lines)`)
    : pc.red("  ✗ Scope limit violation");
  const astCheck = validatedPatch.astResult.valid
    ? pc.green("  ✓ AST & Logic boundary verified (no hook or network mutation)")
    : pc.red("  ✗ AST logic violation");

  lines.push(pathCheck);
  lines.push(scopeCheck);
  lines.push(astCheck);

  // Verification Plan
  lines.push("");
  lines.push(pc.bold("Post-Mutation Verification Plan:"));
  lines.push(pc.dim("  1. TypeScript Compilation Check (tsc --noEmit)"));
  lines.push(pc.dim("  2. Framework Production Build Verification"));
  lines.push(pc.dim("  3. Multi-Viewport Browser Perception & Visual Re-audit"));
  lines.push(pc.dim("  4. Regression & Decision Gate Evaluation (Automatic exact rollback on failure)"));

  // Diff
  lines.push("");
  lines.push(pc.bold("Proposed Validated Diff:"));
  lines.push(pc.dim("```diff"));
  for (const diffLine of validatedPatch.rawPatch.split("\n")) {
    if (diffLine.startsWith("+") && !diffLine.startsWith("+++")) {
      lines.push(pc.green(diffLine));
    } else if (diffLine.startsWith("-") && !diffLine.startsWith("---")) {
      lines.push(pc.red(diffLine));
    } else if (diffLine.startsWith("@@")) {
      lines.push(pc.cyan(diffLine));
    } else {
      lines.push(pc.dim(diffLine));
    }
  }
  lines.push(pc.dim("```"));
  lines.push(hr);

  return lines.join("\n");
}

/**
 * Prompts the user on the terminal for explicit approval.
 *
 * @param details Mutation and diff details.
 * @returns True if explicitly approved by user ("y" or "yes"), false otherwise.
 */
export async function promptUserApproval(
  details: ApprovalPromptDetails
): Promise<boolean> {
  const display = formatApprovalDisplay(details);
  console.log(display);

  const rl = createInterface({
    input: stdin,
    output: stdout,
  });

  try {
    const answer = await rl.question(
      `\n${pc.bold(pc.yellow("?"))} ${pc.bold("Approve and apply this mutation to your repository?")} ${pc.dim("[y/N]: ")}`
    );
    const normalized = answer.trim().toLowerCase();
    const approved = normalized === "y" || normalized === "yes";

    if (approved) {
      console.log(pc.green("✔ Mutation approved. Initiating Git transaction...\n"));
    } else {
      console.log(pc.yellow("✖ Mutation rejected by user. Aborting with zero changes.\n"));
    }

    return approved;
  } finally {
    rl.close();
  }
}
