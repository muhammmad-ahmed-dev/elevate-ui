/**
 * Phase 4E: Agent Task Builder Tests
 * Scenarios G, H, U, V
 */

import { describe, it, expect } from "vitest";
import { AgentDirector } from "../../../src/agent/design/director.js";
import { AgentTaskBuilder } from "../../../src/agent/workflow/task-builder.js";
import type { UserRequest } from "../../../src/agent/design/types.js";
import type { WorkflowOptions } from "../../../src/agent/workflow/types.js";

describe("Phase 4E: Agent Task Builder", () => {
  it("Scenario G: creates high-signal AgentTask from DesignPlanResult without secret leakage", () => {
    const request: UserRequest = {
      prompt: "Build an online store for custom handmade leather goods",
    };

    const plan = AgentDirector.plan(request);
    const options: WorkflowOptions = {
      prompt: request.prompt,
      agentName: "antigravity",
      agentModel: "gemini-3.7-flash-high",
      effort: "high",
    };

    const task = AgentTaskBuilder.buildTask(plan, options, "C:\\mock-workspace");

    expect(task.taskId).toBeDefined();
    expect(task.caseName).toContain("ecommerce");
    expect(task.targetFiles.length).toBeGreaterThanOrEqual(3);
    expect(task.problemDescription).toContain("ecommerce");
    expect(task.customInstructions).toContain("### 1. PROJECT OBJECTIVE");
    expect(task.customInstructions).toContain("### 6. RESPONSIVE RULES (375px / 768px / 1440px)");
    expect(task.customInstructions).toContain("### 9. ACCEPTANCE CRITERIA");

    // Security check: NEVER leak secrets or API keys
    expect(task.customInstructions).not.toContain("GEMINI_API_KEY");
    expect(task.customInstructions).not.toContain("ANTHROPIC_API_KEY");
    expect(task.customInstructions).not.toContain("password");
  });

  it("Scenario H: verifies context compactness and metrics tracking in task customInstructions", () => {
    const request: UserRequest = {
      prompt: "Make a dark portfolio for a 3D artist",
    };

    const plan = AgentDirector.plan(request);
    const options: WorkflowOptions = { prompt: request.prompt };
    const task = AgentTaskBuilder.buildTask(plan, options, "C:\\mock-workspace");

    expect(plan.agentContext.metrics.characterCount).toBeGreaterThan(500);
    expect(plan.agentContext.metrics.estimatedTokens).toBe(
      Math.ceil(plan.agentContext.metrics.characterCount / 4)
    );
    expect(plan.agentContext.metrics.compressionRatio).toBeGreaterThan(0);
    expect(task.customInstructions?.length).toBeGreaterThan(500);
  });
});
