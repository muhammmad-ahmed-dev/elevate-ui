/**
 * Phase 4E: Agent Task Builder
 *
 * Converts a Phase 4D DesignPlanResult and WorkflowOptions into a clean,
 * high-signal AgentTask for execution by CodingAgentAdapter instances.
 *
 * CRITICAL SAFETY REQUIREMENTS:
 * 1. NEVER includes internal evaluator secrets, fixed answers, or .env files.
 * 2. Scopes targetFiles explicitly to prevent wandering edits.
 * 3. Incorporates structured design brief, responsive rules, and acceptance criteria.
 */

import type { DesignPlanResult } from "../design/types.js";
import type { AgentTask } from "../adapters/types.js";
import type { WorkflowOptions } from "./types.js";

export class AgentTaskBuilder {
  /**
   * Constructs an AgentTask tailored for the resolved InputMode.
   */
  public static buildTask(
    planResult: DesignPlanResult,
    options: WorkflowOptions,
    workspaceRoot: string
  ): AgentTask {
    const taskId = `task-${planResult.mode.toLowerCase()}-${Date.now()}`;
    const mode = planResult.mode;
    const brief = planResult.designBrief;
    const componentPlan = planResult.componentPlan;
    const agentContext = planResult.agentContext;

    // Collect canonical target file list from the component plan
    const targetFiles: string[] = [componentPlan.entryComponent];
    for (const comp of componentPlan.components) {
      if (!targetFiles.includes(comp.filePath)) {
        targetFiles.push(comp.filePath);
      }
    }

    const model = options.agentModel || (options.agentName === "antigravity" ? "gemini-3.7-flash-high" : "default");
    const effort = options.effort || "high";
    const timeoutMs = options.timeoutMs || 180000;

    let problemDescription: string;
    let expectedVisualImprovement: string;

    if (mode === "BUILD_FROM_SCRATCH" || mode === "REFERENCE_DRIVEN") {
      problemDescription = `Build a complete, responsive ${brief.projectType} web application for '${brief.brandDirection}' with ${componentPlan.components.length} components adhering strictly to the design system and multi-viewport responsive rules.`;
      expectedVisualImprovement = `High-impact ${brief.visualDirection} visual presentation meeting all WCAG AA accessibility rules and 0 horizontal overflow.`;
    } else {
      // EXISTING_SITE or HYBRID
      problemDescription = `Refine and modernize existing web application to match design direction '${brief.visualDirection}' for '${brief.brandDirection}' focusing on layout, typography hierarchy, and contrast.`;
      expectedVisualImprovement = `Elevated aesthetic quality complying with 8pt spatial grid and responsive rules without breaking existing routes or functional logic.`;
    }

    // Build custom instructions emphasizing concrete file creation / modification
    const customInstructions = [
      agentContext.structuredPrompt,
      "",
      "EXECUTION DIRECTIVES:",
      `1. Workspace: Target repository is initialized at '${workspaceRoot}'.`,
      `2. Target Files to create or modify:`,
      ...targetFiles.map((f) => `   - ${f}`),
      `3. Use Tailwind CSS utility classes adhering to the Design System tokens.`,
      `4. Ensure all interactive buttons, links, and navigation items have minimum 44x44px touch targets on mobile (375px).`,
      `5. Guarantee zero horizontal scrollbars (scrollWidth <= innerWidth).`,
      `6. All components must be valid React/TypeScript modules.`,
    ].join("\n");

    return {
      taskId,
      caseId: `workflow-${mode.toLowerCase()}-${Date.now()}`,
      caseName: `${mode} Execution: ${brief.projectType} (${brief.brandDirection})`,
      category: `agent-director-${brief.projectType}`,
      targetFiles,
      problemDescription,
      expectedVisualImprovement,
      workspaceRoot,
      model,
      effort,
      timeoutMs,
      customInstructions,
    };
  }
}
