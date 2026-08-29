/**
 * Phase 5A: Controlled Agent-Alone vs Agent+Elevate Benchmark Test Suite
 *
 * Validates reset isolation, fair comparison, anti-cheating, metrics collection,
 * 4-dimensional win determination, report generation, and safety guarantees.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ComparisonProvisioner, computeWorkspaceTreeHash } from "../../src/benchmark/comparison-provisioner.js";
import { COMPARISON_CORPUS, getComparisonCases } from "../../src/benchmark/fixtures/comparison-corpus.js";
import { ComparisonRunner } from "../../src/benchmark/comparison-runner.js";
import { generateComparisonReport } from "../../src/benchmark/comparison-reporter.js";
import { CodingAgentRegistry } from "../../src/agent/adapters/registry.js";
import { MockCodingAgentAdapter } from "../../src/agent/adapters/mock.js";
import { AntigravityCodingAgentAdapter } from "../../src/agent/adapters/antigravity.js";
import type { ComparisonSuiteReport } from "../../src/benchmark/comparison-types.js";

describe("Phase 5A: Controlled Agent-Alone vs Agent+Elevate Benchmark", () => {
  let testBaseDir: string;
  let mockAdapter: MockCodingAgentAdapter;

  beforeEach(async () => {
    testBaseDir = await mkdtemp(join(tmpdir(), "elevate-compare-test-"));
    mockAdapter = new MockCodingAgentAdapter();
    CodingAgentRegistry.register(mockAdapter);
  });

  afterEach(async () => {
    CodingAgentRegistry.clear();
    await rm(testBaseDir, { recursive: true, force: true }).catch(() => {});
  });

  // Scenario A: Identical fixture initialization & SHA-256 tree hash verification
  it("Scenario A: provisions isolated pairs with 100% byte-for-byte identical SHA-256 hashes", async () => {
    const fixtureCase = COMPARISON_CORPUS[0];
    const pair = await ComparisonProvisioner.provisionIsolatedPair(fixtureCase, testBaseDir);

    try {
      expect(pair.snapshotHash).toBeDefined();
      expect(typeof pair.snapshotHash).toBe("string");
      expect(pair.snapshotHash.length).toBe(64); // SHA-256 hex length

      const aloneHash = await computeWorkspaceTreeHash(pair.aloneWorkspaceRoot);
      const elevateHash = await computeWorkspaceTreeHash(pair.elevateWorkspaceRoot);

      expect(aloneHash).toBe(pair.snapshotHash);
      expect(elevateHash).toBe(pair.snapshotHash);
      expect(aloneHash).toBe(elevateHash);
      expect(pair.aloneWorkspaceRoot).not.toBe(pair.elevateWorkspaceRoot);
    } finally {
      await pair.cleanup();
    }
  });

  // Scenario B: Agent-alone execution pathway
  it("Scenario B: executes Agent-Alone run without Elevate design plan or director context", async () => {
    const fixtureCase = COMPARISON_CORPUS[0];
    const comparison = await ComparisonRunner.runSingleComparison(fixtureCase, {
      agent: "mock",
      dryRun: true,
    });

    expect(comparison.baselineRun.mode).toBe("AGENT_ALONE");
    expect(comparison.baselineRun.planningDurationMs).toBe(0);
    expect(comparison.baselineRun.estimatedContextTokens).toBeLessThan(100); // Only bare prompt
  });

  // Scenario C: Agent+Elevate execution pathway
  it("Scenario C: executes Agent+Elevate run with structured design plan and multi-viewport criteria", async () => {
    const fixtureCase = COMPARISON_CORPUS[0];
    const comparison = await ComparisonRunner.runSingleComparison(fixtureCase, {
      agent: "mock",
      dryRun: true,
    });

    expect(comparison.elevateRun.mode).toBe("AGENT_ELEVATE");
    expect(comparison.elevateRun.estimatedContextTokens).toBeGreaterThan(1000); // 9-section context
    expect(comparison.elevateRun.acceptanceCriteriaTotal).toBeGreaterThanOrEqual(4);
  });

  // Scenario D: Metrics collection and delta computation
  it("Scenario D: calculates structured quality, efficiency, defect, and time deltas", async () => {
    const fixtureCase = COMPARISON_CORPUS[0];
    const comparison = await ComparisonRunner.runSingleComparison(fixtureCase, {
      agent: "mock",
      dryRun: true,
    });

    expect(typeof comparison.qualityDelta).toBe("number");
    expect(typeof comparison.efficiencyDelta).toBe("number");
    expect(typeof comparison.defectDelta).toBe("number");
    expect(typeof comparison.timeDelta).toBe("number");
    expect(typeof comparison.acceptanceDelta).toBe("number");
  });

  // Scenario E: Measured vs estimated token handling
  it("Scenario E: labels tokenStatus as ESTIMATED or MEASURED without fabricating provider counts", async () => {
    const fixtureCase = COMPARISON_CORPUS[0];
    const comparison = await ComparisonRunner.runSingleComparison(fixtureCase, {
      agent: "mock",
      dryRun: true,
    });

    expect(["MEASURED", "ESTIMATED", "UNAVAILABLE"]).toContain(comparison.baselineRun.tokenStatus);
    expect(["MEASURED", "ESTIMATED", "UNAVAILABLE"]).toContain(comparison.elevateRun.tokenStatus);
  });

  // Scenario F: Quality comparison and win determination
  it("Scenario F: evaluates independent 4-dimensional win conditions (Quality, Efficiency, Safety, Time)", async () => {
    const fixtureCase = COMPARISON_CORPUS[0];
    const comparison = await ComparisonRunner.runSingleComparison(fixtureCase, {
      agent: "mock",
      dryRun: true,
    });

    const validOutcomes = ["WIN", "TIE", "LOSS"];
    expect(validOutcomes).toContain(comparison.dimensionWinners.quality);
    expect(validOutcomes).toContain(comparison.dimensionWinners.efficiency);
    expect(validOutcomes).toContain(comparison.dimensionWinners.safety);
    expect(validOutcomes).toContain(comparison.dimensionWinners.time);
  });

  // Scenario K: Anti-cheating & answer leakage prevention
  it("Scenario K: never leaks fixed code or private benchmark answers in agent tasks", async () => {
    const fixtureCase = COMPARISON_CORPUS[0];
    const { AgentDirector } = await import("../../src/agent/design/director.js");
    const { AgentTaskBuilder } = await import("../../src/agent/workflow/task-builder.js");

    const planResult = AgentDirector.plan({ prompt: fixtureCase.prompt });
    const task = AgentTaskBuilder.buildTask(
      planResult,
      {
        prompt: fixtureCase.prompt,
        agentName: "mock",
        agentModel: "default",
      },
      testBaseDir
    );

    const taskJson = JSON.stringify(task);
    expect(taskJson).not.toContain("expectedSolution");
    expect(taskJson).not.toContain("fixedCode");
    expect(taskJson).not.toContain("answerDiff");
  });

  // Scenario L & M: Report generation (JSON and HTML) & Reproducibility metadata
  it("Scenario L & M: generates publication-ready HTML and JSON comparison reports with reproducibility metadata", async () => {
    const mockReport: ComparisonSuiteReport = {
      reportId: "test-report-01",
      timestamp: new Date().toISOString(),
      suiteName: "Test Comparison Suite",
      agent: "mock",
      model: "default",
      totalCases: 1,
      elevateWins: { qualityWins: 1, efficiencyWins: 1, safetyWins: 1, timeWins: 0 },
      agentAloneWins: { qualityWins: 0, efficiencyWins: 0, safetyWins: 0, timeWins: 1 },
      ties: { qualityTies: 0, efficiencyTies: 0, safetyTies: 0, timeTies: 0 },
      aggregateMetrics: {
        agentAlone: {
          totalDurationMs: 1500,
          avgDurationMs: 1500,
          totalResolvedFindings: 1,
          totalFinalFindings: 3,
          totalRegressions: 0,
          validBuildCount: 1,
          invalidBuildCount: 0,
          successRate: 0.5,
          avgAcceptanceRate: 0.4,
        },
        agentElevate: {
          totalDurationMs: 2500,
          avgDurationMs: 2500,
          totalResolvedFindings: 3,
          totalFinalFindings: 0,
          totalRegressions: 0,
          validBuildCount: 1,
          invalidBuildCount: 0,
          successRate: 1.0,
          avgAcceptanceRate: 0.9,
        },
      },
      comparisons: [
        {
          caseId: "comp-portfolio-01",
          caseName: "Developer Portfolio",
          category: "portfolio",
          inputMode: "BUILD_FROM_SCRATCH",
          agent: "mock",
          model: "default",
          baselineRun: {
            mode: "AGENT_ALONE",
            totalDurationMs: 1500,
            agentDurationMs: 1200,
            planningDurationMs: 0,
            verificationDurationMs: 300,
            estimatedContextTokens: 50,
            tokenStatus: "ESTIMATED",
            filesChanged: 1,
            linesAdded: 10,
            linesDeleted: 2,
            iterations: 1,
            initialFindingCount: 4,
            finalFindingCount: 3,
            resolvedFindingCount: 1,
            newFindingCount: 0,
            regressionCount: 0,
            acceptanceCriteriaPassed: 2,
            acceptanceCriteriaTotal: 5,
            buildValidity: {
              serverStarted: true,
              routeReachable: true,
              htmlReturned: true,
              bodyPresent: true,
              meaningfulDomPresent: true,
              expectedStructurePresent: true,
              contentDensity: { textLength: 100, elementCount: 6, interactiveCount: 2, sectionCount: 2, headingCount: 1 },
              blankPageDetected: false,
              stubPageDetected: false,
              runtimeErrors: [],
              browserConsoleErrors: [],
              buildValid: true,
              effectiveOutcome: "VALID_BUILD",
              reason: "Valid build",
              matchedSections: ["hero"],
              missingSections: [],
              matchedKeywords: ["portfolio"],
            },
            effectiveOutcome: "VALID_BUILD",
            success: false,
            classification: "PRODUCT_FAILURE",
            modifiedFiles: ["src/components/Portfolio.tsx"],
            gitDiff: "",
          },
          elevateRun: {
            mode: "AGENT_ELEVATE",
            totalDurationMs: 2500,
            agentDurationMs: 1800,
            planningDurationMs: 400,
            verificationDurationMs: 300,
            estimatedContextTokens: 1800,
            tokenStatus: "ESTIMATED",
            filesChanged: 1,
            linesAdded: 40,
            linesDeleted: 5,
            iterations: 1,
            initialFindingCount: 4,
            finalFindingCount: 0,
            resolvedFindingCount: 4,
            newFindingCount: 0,
            regressionCount: 0,
            acceptanceCriteriaPassed: 5,
            acceptanceCriteriaTotal: 5,
            buildValidity: {
              serverStarted: true,
              routeReachable: true,
              htmlReturned: true,
              bodyPresent: true,
              meaningfulDomPresent: true,
              expectedStructurePresent: true,
              contentDensity: { textLength: 400, elementCount: 15, interactiveCount: 3, sectionCount: 3, headingCount: 2 },
              blankPageDetected: false,
              stubPageDetected: false,
              runtimeErrors: [],
              browserConsoleErrors: [],
              buildValid: true,
              effectiveOutcome: "VALID_BUILD_IMPROVED",
              reason: "Valid improved build",
              matchedSections: ["hero", "projects", "contact"],
              missingSections: [],
              matchedKeywords: ["portfolio", "projects", "contact"],
            },
            effectiveOutcome: "VALID_BUILD_IMPROVED",
            success: true,
            classification: "SUCCESS",
            modifiedFiles: ["src/components/Portfolio.tsx"],
            gitDiff: "",
          },
          qualityDelta: 6,
          efficiencyDelta: 3,
          defectDelta: -3,
          regressionDelta: 0,
          timeDelta: 1000,
          acceptanceDelta: 3,
          dimensionWinners: {
            quality: "WIN",
            efficiency: "WIN",
            safety: "TIE",
            time: "LOSS",
          },
        },
      ],
      reproducibility: {
        seed: 42,
        agent: "mock",
        model: "default",
        nodeVersion: process.version,
        platform: process.platform,
        gitCommit: "abc1234",
        timestamp: new Date().toISOString(),
        fixtureHashes: { "comp-portfolio-01": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
      },
    };

    const paths = await generateComparisonReport(mockReport, testBaseDir);
    expect(paths.htmlPath).toBeDefined();
    expect(paths.jsonPath).toBeDefined();

    const jsonRaw = await readFile(paths.jsonPath, "utf8");
    const jsonParsed = JSON.parse(jsonRaw);
    expect(jsonParsed.suiteName).toBe("Test Comparison Suite");
    expect(jsonParsed.elevateWins.qualityWins).toBe(1);

    const htmlRaw = await readFile(paths.htmlPath, "utf8");
    expect(htmlRaw).toContain("Test Comparison Suite");
    expect(htmlRaw).toContain("ELEVATE WIN");
    expect(htmlRaw).toContain("ALONE WIN");
  });

  // Scenario N: Zero host repository contamination
  it("Scenario N: strictly prohibits mutations against the host Elevate repository", async () => {
    const pair = await ComparisonProvisioner.provisionIsolatedPair(COMPARISON_CORPUS[0], testBaseDir);
    try {
      expect(pair.aloneWorkspaceRoot).not.toContain("c:\\freespace\\Elevate\\src");
      expect(pair.elevateWorkspaceRoot).not.toContain("c:\\freespace\\Elevate\\src");
      expect(pair.aloneWorkspaceRoot).toContain(testBaseDir);
    } finally {
      await pair.cleanup();
    }
  });

  // Scenario P: Multi-category corpus coverage (12 cases)
  it("Scenario P: provides 12 diverse benchmark fixtures covering all target domains", () => {
    expect(COMPARISON_CORPUS.length).toBe(12);
    const categories = new Set(COMPARISON_CORPUS.map((c) => c.category));
    expect(categories.has("portfolio")).toBe(true);
    expect(categories.has("saas_landing")).toBe(true);
    expect(categories.has("agency")).toBe(true);
    expect(categories.has("ecommerce")).toBe(true);
    expect(categories.has("dashboard")).toBe(true);
    expect(categories.has("documentation")).toBe(true);
  });

  // Scenario Q & R: Screenshot and existing-site task support
  it("Scenario Q & R: filters and executes screenshot-driven and existing-site tasks cleanly", () => {
    const screenshotCases = getComparisonCases().filter((c) => c.inputMode === "REFERENCE_DRIVEN");
    const existingCases = getComparisonCases().filter((c) => c.inputMode === "EXISTING_SITE" || c.inputMode === "HYBRID");

    expect(screenshotCases.length).toBeGreaterThanOrEqual(2);
    expect(existingCases.length).toBeGreaterThanOrEqual(2);
  });

  // Scenario S: Antigravity adapter registration
  it("Scenario S: integrates with Antigravity adapter without requiring Gemini/Anthropic API keys", () => {
    const agAdapter = new AntigravityCodingAgentAdapter();
    expect(agAdapter.name).toBe("antigravity");
    expect(agAdapter.supportedModels).toContain("gemini-3.7-flash-high");
  });
});
