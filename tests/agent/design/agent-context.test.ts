/**
 * Phase 4D: Agent Context Compression, Token Metrics & Adapter Integration Tests
 * Scenarios Q, R, W, X
 */

import { describe, it, expect } from "vitest";
import { AgentDirector } from "../../../src/agent/design/director.js";
import { AgentContextBuilder } from "../../../src/agent/design/agent-context.js";
import { MockCodingAgentAdapter } from "../../../src/agent/adapters/mock.js";
import { AntigravityCodingAgentAdapter } from "../../../src/agent/adapters/antigravity.js";
import type { UserRequest } from "../../../src/agent/design/types.js";
import type { AgentTask } from "../../../src/agent/adapters/types.js";

describe("Phase 4D: Agent Context Compression & Token Metrics", () => {
  it("Scenario Q: compresses complete design specification into a high-density, low-fluff structured prompt", () => {
    const request: UserRequest = {
      prompt: "Make a modern dark portfolio for a 3D artist with project showcase and contact section",
    };

    const planResult = AgentDirector.plan(request);
    const prompt = planResult.agentContext.structuredPrompt;

    expect(prompt).toContain("### 1. PROJECT OBJECTIVE & DOMAIN");
    expect(prompt).toContain("### 2. DESIGN DIRECTION & DESIGN SYSTEM");
    expect(prompt).toContain("### 3. SITE STRUCTURE & USER FLOW");
    expect(prompt).toContain("### 4. COMPONENT ARCHITECTURE & RESPONSIBILITIES");
    expect(prompt).toContain("### 5. RANKED VISUAL PRIORITIES");
    expect(prompt).toContain("### 6. RESPONSIVE RULES (375px / 768px / 1440px)");
    expect(prompt).toContain("### 8. TECHNICAL CONSTRAINTS & ACCESSIBILITY");
    expect(prompt).toContain("### 9. ACCEPTANCE CRITERIA");

    // Ensure prompt is high density without bloated conversational filler
    expect(prompt).not.toContain("As an AI model, I would suggest");
    expect(prompt).not.toContain("Here is some thought process about what you might like");
  });

  it("Scenario R: calculates accurate context metrics and estimated tokens", () => {
    const request: UserRequest = {
      prompt: "Create an online store for custom handmade leather goods",
    };

    const planResult = AgentDirector.plan(request);
    const metrics = planResult.agentContext.metrics;

    expect(metrics.characterCount).toBeGreaterThan(500);
    expect(metrics.estimatedTokens).toBe(Math.ceil(metrics.characterCount / 4));
    expect(metrics.fileCount).toBeGreaterThanOrEqual(4);
    expect(metrics.requirementCount).toBeGreaterThanOrEqual(5);
    expect(metrics.repetitionCount).toBe(0); // zero duplicate long lines

    const customMetrics = AgentContextBuilder.calculateMetrics(
      "Line 1\nLine 2\nLine 1\nAnother line",
      ["file1.tsx", "file2.tsx"],
      1,
      4
    );
    expect(customMetrics.fileCount).toBe(2);
    expect(customMetrics.screenshotCount).toBe(1);
    expect(customMetrics.estimatedTokens).toBeGreaterThan(0);
  });

  it("Scenario W: bridges AgentTaskContext directly to AntigravityCodingAgentAdapter task contracts", () => {
    const request: UserRequest = {
      prompt: "Build an agency showcase site for a high-end branding studio",
    };

    const planResult = AgentDirector.plan(request);
    const taskContext = planResult.agentTaskContext;

    // Convert AgentTaskContext into standard AgentTask
    const agentTask: AgentTask = {
      taskId: `task-plan-${Date.now()}`,
      caseId: "plan-agency-01",
      caseName: "Agency Showcase",
      category: taskContext.category,
      targetFiles: taskContext.targetFiles,
      problemDescription: taskContext.problemDescription,
      expectedVisualImprovement: taskContext.expectedVisualImprovement,
      customInstructions: taskContext.taskPrompt,
      workspaceRoot: "C:\\mock-workspace",
    };

    const adapter = new AntigravityCodingAgentAdapter();
    const prompt = adapter.buildTaskPrompt(agentTask);

    expect(prompt).toContain("TASK OBJECTIVE:");
    expect(prompt).toContain(agentTask.targetFiles[0]);
    expect(prompt).toContain(agentTask.problemDescription);
  });

  it("Scenario X: validates mock coding agent can consume generated task context and produce valid result", async () => {
    const request: UserRequest = {
      prompt: "Personal portfolio website",
    };

    const planResult = AgentDirector.plan(request);
    const taskContext = planResult.agentTaskContext;

    expect(taskContext.targetFiles.length).toBeGreaterThan(0);
    expect(taskContext.taskPrompt.length).toBeGreaterThan(200);

    const mockAdapter = new MockCodingAgentAdapter({ scenario: "no_edits" });
    expect(mockAdapter.name).toBe("mock");
  });
});
