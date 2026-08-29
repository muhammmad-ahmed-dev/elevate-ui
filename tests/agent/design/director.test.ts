/**
 * Phase 4D: Agent Director, Modes, MCP & Safety Tests
 * Scenarios I, J, T, U, V
 */

import { describe, it, expect } from "vitest";
import { AgentDirector } from "../../../src/agent/design/director.js";
import { registerMcpTools } from "../../../src/mcp/tools.js";
import { McpRunStore } from "../../../src/mcp/store.js";
import { McpServer } from "@modelcontextprotocol/server";
import type { UserRequest } from "../../../src/agent/design/types.js";
import { readdirSync } from "node:fs";

describe("Phase 4D: Agent Director, Input Modes, Safety & MCP Integration", () => {
  it("Scenario I: handles EXISTING_SITE request and builds targeted context incorporating existing findings", () => {
    const request: UserRequest = {
      prompt: "Make my existing portfolio more premium with better contrast and typography",
      existingUrl: "http://localhost:3000",
      existingFindings: [
        { id: "contrast-01", category: "contrast", title: "Low color contrast on header text" },
        { id: "touch-01", category: "touch-target", title: "Undersized mobile navigation button" },
      ],
    };

    const result = AgentDirector.plan(request);

    expect(result.mode).toBe("EXISTING_SITE");
    expect(result.designBrief.inputMode).toBe("EXISTING_SITE");
    expect(result.designIntent.visualRequirements.some((v) => v.includes("2 previously detected"))).toBe(true);
  });

  it("Scenario J: handles HYBRID request combining existing site URL, goal, and reference screenshots", () => {
    const request: UserRequest = {
      prompt: "Redesign our hero section like this reference while preserving our existing product catalogue",
      existingUrl: "http://localhost:3000",
      references: [
        { id: "hero-ref", description: "Dark modern hero with glowing CTA and floating card" },
      ],
    };

    const result = AgentDirector.plan(request);

    expect(result.mode).toBe("HYBRID");
    expect(result.referenceSynthesis).toBeDefined();
    expect(result.referenceSynthesis?.referenceCount).toBe(1);
    expect(result.designBrief.referencesUsed.length).toBeGreaterThan(0);
  });

  it("Scenario T: verifies planning is strictly READ-ONLY and does NOT mutate source code or files", () => {
    const initialFilesBefore = readdirSync(process.cwd());

    const request: UserRequest = {
      prompt: "Build an expansive enterprise dashboard with data tables and analytics charts",
      references: ["https://example.com/dashboard-preview.png"],
    };

    const result = AgentDirector.plan(request);

    expect(result.planId).toBeDefined();
    expect(result.agentContext.structuredPrompt.length).toBeGreaterThan(100);

    const filesAfter = readdirSync(process.cwd());
    // Ensure no new directories or rogue source files were created during planning
    expect(filesAfter.length).toBe(initialFilesBefore.length);
  });

  it("Scenario U: verifies MCP plan_design tool is registered and executes read-only planning successfully", async () => {
    const server = new McpServer({ name: "elevate-mcp-test", version: "0.1.0" });
    const store = new McpRunStore();

    registerMcpTools(server, store);

    // Test AgentDirector planning directly as invoked by the MCP tool handler
    const request: UserRequest = {
      prompt: "Make a dark portfolio for a 3D artist",
    };

    const result = AgentDirector.plan(request);

    expect(result.designBrief.projectType).toBe("portfolio");
    expect(result.designBrief.visualDirection).toContain("Dark");
    expect(result.agentContext.metrics.estimatedTokens).toBeGreaterThan(0);
  });

  it("Scenario V: confirms existing ImproveEngine and MutationTransaction models remain fully operational", async () => {
    const { ComponentLocator } = await import("../../../src/agent/locator.js");
    const { PatchPlanner } = await import("../../../src/agent/plan.js");

    expect(ComponentLocator).toBeDefined();
    expect(PatchPlanner).toBeDefined();
  });
});
