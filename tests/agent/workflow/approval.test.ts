/**
 * Phase 4E: Workflow Approval & Display Tests
 * Scenarios I, J, K
 */

import { describe, it, expect } from "vitest";
import { AgentDirector } from "../../../src/agent/design/director.js";
import { formatWorkflowApprovalDisplay } from "../../../src/agent/workflow/approval.js";
import type { UserRequest } from "../../../src/agent/design/types.js";
import type { WorkflowOptions } from "../../../src/agent/workflow/types.js";

describe("Phase 4E: Workflow Approval & Display", () => {
  it("Scenario I: formats clear, readable project blueprint display for terminal presentation", () => {
    const request: UserRequest = {
      prompt: "Create a modern SaaS landing page for an AI developer platform with pricing tiers",
    };

    const plan = AgentDirector.plan(request);
    const options: WorkflowOptions = {
      prompt: request.prompt,
      agentName: "antigravity",
      agentModel: "gemini-3.7-flash-high",
    };

    const display = formatWorkflowApprovalDisplay(plan, options, "C:\\mock-workspace");

    expect(display).toContain("Elevate Agent Director: Project Blueprint");
    expect(display).toContain("BUILD_FROM_SCRATCH");
    expect(display).toContain("SAAS_LANDING");
    expect(display).toContain("Planned Component Architecture:");
    expect(display).toContain("Multi-Viewport Strategy:");
    expect(display).toContain("Mobile (375px)");
    expect(display).toContain("Desktop (1440px)");
    expect(display).toContain("Acceptance Criteria");
    expect(display).toContain("Coding Agent:");
    expect(display).toContain("antigravity");
    expect(display).toContain("gemini-3.7-flash-high");
    expect(display).toContain("Context Size:");
  });

  it("Scenario K: formats display with custom constraints and target workspace", () => {
    const request: UserRequest = {
      prompt: "Personal portfolio website",
    };

    const plan = AgentDirector.plan(request);
    const options: WorkflowOptions = {
      prompt: request.prompt,
      agentName: "mock",
      agentModel: "default",
      workspaceRoot: "C:\\custom-dest-dir",
    };

    const display = formatWorkflowApprovalDisplay(plan, options, "C:\\custom-dest-dir");

    expect(display).toContain("C:\\custom-dest-dir");
    expect(display).toContain("mock");
  });
});
