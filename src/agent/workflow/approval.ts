/**
 * Phase 4E: Workflow Human Approval Prompt & Formatter
 *
 * Formats a comprehensive yet concise project blueprint and agent context
 * summary for terminal presentation, and prompts the user for explicit approval
 * before dispatching tasks to external coding agents or mutating files.
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import pc from "picocolors";
import type { DesignPlanResult } from "../design/types.js";
import type { WorkflowOptions } from "./types.js";

export function formatWorkflowApprovalDisplay(
  planResult: DesignPlanResult,
  options: WorkflowOptions,
  workspaceRoot: string
): string {
  const { mode, designBrief, componentPlan, responsivePlan, acceptanceCriteria, visualPriorities, agentContext } = planResult;
  const lines: string[] = [];
  const hr = pc.dim("─".repeat(72));

  lines.push(hr);
  lines.push(pc.bold(pc.cyan(` Elevate Agent Director: Project Blueprint [${mode}]`)));
  lines.push(hr);

  // 1. Goal & Brand
  lines.push(`${pc.bold("Goal:")}            ${designBrief.projectGoal}`);
  lines.push(`${pc.bold("Project Type:")}    ${pc.magenta(designBrief.projectType.toUpperCase())}`);
  lines.push(`${pc.bold("Brand Domain:")}    ${designBrief.brandDirection}`);
  lines.push(`${pc.bold("Visual Style:")}    ${pc.green(designBrief.visualDirection)}`);
  lines.push(`${pc.bold("Primary CTA:")}     "${pc.yellow(designBrief.primaryCta)}"${designBrief.secondaryCta ? ` | Secondary: "${designBrief.secondaryCta}"` : ""}`);

  // 2. Structure & Components
  lines.push("");
  lines.push(pc.bold("Planned Component Architecture:"));
  lines.push(`  Entry: ${pc.cyan(componentPlan.entryComponent)}`);
  for (const comp of componentPlan.components) {
    lines.push(`  • ${pc.bold(comp.name)} (${pc.dim(comp.filePath)}) — ${comp.role}`);
  }

  // 3. Responsive Rules & Touch Targets
  lines.push("");
  lines.push(pc.bold("Multi-Viewport Strategy:"));
  lines.push(`  • Mobile (375px):  ${responsivePlan.mobile375.layoutStructure} (Touch targets ≥ ${responsivePlan.touchTargetMinimumPx}px)`);
  lines.push(`  • Tablet (768px):  ${responsivePlan.tablet768.layoutStructure}`);
  lines.push(`  • Desktop (1440px): ${responsivePlan.desktop1440.layoutStructure}`);

  // 4. Acceptance Criteria & Priorities
  lines.push("");
  lines.push(pc.bold(`Top Visual Priorities (${visualPriorities.length}):`));
  for (const vp of visualPriorities.slice(0, 3)) {
    lines.push(`  ${vp.rank}. ${pc.bold(vp.title)} — ${pc.dim(vp.description)}`);
  }

  lines.push("");
  lines.push(pc.bold(`Acceptance Criteria (${acceptanceCriteria.length} verifiable rules):`));
  for (const ac of acceptanceCriteria.slice(0, 4)) {
    lines.push(`  ✓ [${ac.category.toUpperCase()}] ${ac.description}`);
  }
  if (acceptanceCriteria.length > 4) {
    lines.push(pc.dim(`    ... and ${acceptanceCriteria.length - 4} more acceptance criteria`));
  }

  // 5. Agent & Workspace Configuration
  const agentName = options.agentName || "antigravity";
  const agentModel = options.agentModel || (agentName === "antigravity" ? "gemini-3.7-flash-high" : "default");
  lines.push("");
  lines.push(pc.bold("Execution Target:"));
  lines.push(`  • Coding Agent:   ${pc.bold(pc.cyan(agentName))} (Model: ${agentModel})`);
  lines.push(`  • Workspace Root: ${pc.dim(workspaceRoot)}`);
  lines.push(
    `  • Context Size:   ~${agentContext.metrics.estimatedTokens} tokens (${agentContext.metrics.characterCount} chars, ${agentContext.metrics.fileCount} target files)`
  );

  lines.push(hr);
  return lines.join("\n");
}

/**
 * Prompts the user for explicit approval before dispatching the coding agent.
 */
export async function promptWorkflowApproval(
  planResult: DesignPlanResult,
  options: WorkflowOptions,
  workspaceRoot: string
): Promise<boolean> {
  const display = formatWorkflowApprovalDisplay(planResult, options, workspaceRoot);
  console.log(display);

  const rl = createInterface({
    input: stdin,
    output: stdout,
  });

  try {
    const answer = await rl.question(
      `\n${pc.bold(pc.yellow("?"))} ${pc.bold("Start coding agent execution in workspace?")} ${pc.dim("[y/N]: ")}`
    );
    const normalized = answer.trim().toLowerCase();
    const approved = normalized === "y" || normalized === "yes";

    if (approved) {
      console.log(pc.green("✔ Blueprint approved. Launching coding agent...\n"));
    } else {
      console.log(pc.yellow("✖ Execution cancelled by user. Workspace left untouched.\n"));
    }

    return approved;
  } finally {
    rl.close();
  }
}
