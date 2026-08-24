/**
 * Phase 4B: MCP End-to-End & Integration Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createElevateMcpServer } from "../../src/mcp/server.js";
import { createCli } from "../../src/cli/index.js";
import * as auditModule from "../../src/cli/commands/audit.js";
import * as loopModule from "../../src/agent/improve/loop.js";

let testDir: string;

beforeEach(async () => {
  const reportsParent = join(process.cwd(), "elevate-report", "mcp-test-tmp");
  await mkdir(join(process.cwd(), "elevate-report"), { recursive: true });
  testDir = await mkdtemp(reportsParent);
});

afterEach(async () => {
  try {
    await rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup error
  }
  vi.restoreAllMocks();
});

describe("Phase 4B: MCP End-to-End & Integration Tests", () => {
  it("registers MCP command in CLI program", () => {
    const program = createCli();
    const mcpCmd = program.commands.find((c) => c.name() === "mcp");
    expect(mcpCmd).toBeDefined();
    expect(mcpCmd?.description()).toContain("Model Context Protocol");
  });

  it("creates MCP server with all tools and resources registered", () => {
    const { server, store } = createElevateMcpServer();
    expect(server).toBeDefined();
    expect(store).toBeDefined();

    const toolNames = Object.keys((server as any)._registeredTools || {});
    expect(toolNames).toContain("audit");
    expect(toolNames).toContain("improve");
    expect(toolNames).toContain("verify");
    expect(toolNames).toContain("compare");
    expect(toolNames).toContain("report");
  });

  it("executes audit tool and saves run to store", async () => {
    const mockAuditResult: any = {
      runMetadata: { timestamp: Date.now(), targetUrl: "http://localhost:3000", durationMs: 120 },
      viewportMetadata: ["desktop"],
      deterministicFindings: [],
      heuristicFindings: [],
      normalizedFindings: [],
      deduplicatedFindings: [
        {
          id: "f1",
          category: "accessibility",
          severity: "serious",
          title: "Missing button name",
          description: "Button has no accessible name",
          evidence: {},
          viewport: "desktop",
          source: "deterministic",
          deterministic: true,
          confidence: 1.0,
        },
      ],
      prioritizedFindings: [],
      recommendations: [
        {
          id: "rec1",
          problem: "Missing button name",
          evidence: {},
          affectedSelector: "button.submit",
          affectedViewports: ["desktop"],
          proposedImprovement: "Add aria-label",
          rationale: "WCAG 4.1.2",
          confidence: 0.9,
          estimatedMutationScope: "single-element",
          risk: "low",
          sourceFindingIds: ["f1"],
        },
      ],
      errors: [],
    };

    vi.spyOn(auditModule, "runAuditPipeline").mockResolvedValue(mockAuditResult);

    const { server, store } = createElevateMcpServer();

    const tool = (server as any)._registeredTools["audit"];
    const result = await tool.handler({ url: "http://localhost:3000" });

    expect(result.content).toBeDefined();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.status).toBe("NO_ACTIONABLE_IMPROVEMENT");
    expect(payload.summary).toContain("1 findings");
    expect(store.getLatestRun()).toBeDefined();
  });

  it("enforces APPROVAL_REQUIRED when improve is called with dryRun=false and autoApprove=false", async () => {
    const mockImproveResult: any = {
      runId: "run-dry-001",
      targetUrl: "http://localhost:3000",
      maxPasses: 1,
      passesExecuted: 1,
      passesAccepted: 0,
      passesRolledBack: 0,
      recommendationsConsidered: 1,
      recommendationsSkipped: 0,
      stoppingReason: "DRY_RUN",
      baselineFindings: [],
      finalFindings: [],
      passResults: [
        {
          passNumber: 1,
          runId: "run-dry-p1",
          recommendation: {
            id: "rec-dry",
            problem: "Button contrast",
            evidence: {},
            affectedSelector: "button.cta",
            affectedViewports: ["desktop"],
            proposedImprovement: "Improve contrast to 4.5:1",
            rationale: "WCAG AA",
            confidence: 0.95,
            estimatedMutationScope: "single-element",
            risk: "low",
            sourceFindingIds: ["f1"],
          },
          status: "DRY_RUN",
          decision: "ACCEPT",
          targetedImprovement: true,
          newRegressions: 0,
          durationMs: 100,
          summary: "Dry run pass validated",
          validationResult: {
            valid: true,
            rawPatch: "+<button className=\"bg-blue-600\">",
            normalizedFiles: ["Button.tsx"],
            parsedDiff: { files: [], totalAdditions: 1, totalDeletions: 0, rawDiff: "" },
            pathGuardResult: { valid: true, violations: [] },
            scopeResult: { valid: true, violations: [] },
            astResult: { valid: true, violations: [] },
            violations: [],
          },
        },
      ],
      recommendationHistory: [],
      finalStatus: "DRY_RUN",
      durationMs: 250,
      summary: "Dry run completed",
    };

    vi.spyOn(loopModule, "runMultiPassImproveLoop").mockResolvedValue(mockImproveResult);

    const { server } = createElevateMcpServer();

    const tool = (server as any)._registeredTools["improve"];
    const result = await tool.handler({
      url: "http://localhost:3000",
      autoApprove: false,
      dryRun: false,
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.status).toBe("APPROVAL_REQUIRED");
    expect(payload.summary).toContain("Explicit human approval is required");
    expect(payload.details.recommendation.id).toBe("rec-dry");
    expect(payload.details.filesTouched).toContain("Button.tsx");
  });

  it("delegates autonomous improve execution when autoApprove=true", async () => {
    const mockAcceptedResult: any = {
      runId: "run-accept-002",
      targetUrl: "http://localhost:3000",
      maxPasses: 1,
      passesExecuted: 1,
      passesAccepted: 1,
      passesRolledBack: 0,
      recommendationsConsidered: 1,
      recommendationsSkipped: 0,
      stoppingReason: "MAX_PASSES_REACHED",
      baselineFindings: [],
      finalFindings: [],
      passResults: [],
      recommendationHistory: [],
      finalStatus: "SUCCESS",
      durationMs: 1500,
      summary: "Improvement loop converged successfully",
    };

    vi.spyOn(loopModule, "runMultiPassImproveLoop").mockResolvedValue(mockAcceptedResult);

    const { server } = createElevateMcpServer();

    const tool = (server as any)._registeredTools["improve"];
    const result = await tool.handler({
      url: "http://localhost:3000",
      autoApprove: true,
      maxPasses: 1,
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.status).toBe("SUCCESS");
    expect(payload.summary).toBe("Improvement loop converged successfully");
    expect(payload.details.passesAccepted).toBe(1);
  });

  it("executes report tool safely from JSON file", async () => {
    const sampleReportJson = join(testDir, "report.json");
    await writeFile(
      sampleReportJson,
      JSON.stringify({
        reportId: "rep-tool-test",
        reportType: "audit",
        targetUrl: "http://localhost:3000",
        timestamp: "2026-08-25T00:00:00.000Z",
        durationMs: 100,
        executiveSummary: {
          status: "SUCCESS",
          passesExecuted: 0,
          passesAccepted: 0,
          passesRolledBack: 0,
        },
        viewports: [],
        findingsBaseline: [],
        findingsFinal: [],
        recommendations: [],
        passHistory: [],
        verificationGates: [],
        generatorMetadata: { version: "0.1.0", generatedAt: "2026-08-25", environment: "Node" },
      }),
      "utf8"
    );

    const { server } = createElevateMcpServer();

    const tool = (server as any)._registeredTools["report"];
    const result = await tool.handler({
      reportJsonPath: sampleReportJson,
      outputDir: join(testDir, "out-report"),
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.status).toBe("SUCCESS");
    expect(payload.reportPath).toContain("summary.html");
  });
});
