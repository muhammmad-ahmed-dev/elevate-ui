/**
 * Phase 4A: End-to-End Report Generation Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, writeFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateReport } from "../../src/reports/index.js";
import { createCli } from "../../src/cli/index.js";
import type { MultiPassImproveResult } from "../../src/agent/improve/types.js";

let testDir: string;
let dummyScreenshotPath: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "elevate-report-test-"));
  dummyScreenshotPath = join(testDir, "dummy-screenshot.png");
  await writeFile(dummyScreenshotPath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
});

afterEach(async () => {
  try {
    await rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup error
  }
});

const sampleResult: MultiPassImproveResult = {
  runId: "run-e2e-report",
  targetUrl: "http://localhost:3000",
  maxPasses: 2,
  passesExecuted: 1,
  passesAccepted: 1,
  passesRolledBack: 0,
  recommendationsConsidered: 1,
  recommendationsSkipped: 0,
  stoppingReason: "MAX_PASSES_REACHED",
  baselineFindings: [
    {
      id: "f1",
      category: "touch-target",
      severity: "serious",
      title: "Touch target too small",
      description: "Button height is only 28px",
      evidence: {},
      selector: "button.nav",
      viewport: "mobile",
      source: "deterministic",
      deterministic: true,
      confidence: 1.0,
    },
  ],
  finalFindings: [],
  passResults: [
    {
      passNumber: 1,
      runId: "run-e2e-p1",
      recommendation: {
        id: "rec1",
        problem: "Touch target too small",
        evidence: {},
        affectedSelector: "button.nav",
        affectedViewports: ["mobile"],
        proposedImprovement: "Add min-h-12",
        rationale: "WCAG 2.5.5",
        confidence: 0.95,
        estimatedMutationScope: "single-element",
        risk: "low",
        sourceFindingIds: ["f1"],
      },
      status: "SUCCESS",
      decision: "ACCEPT",
      targetedImprovement: true,
      newRegressions: 0,
      durationMs: 1500,
      summary: "Pass 1 accepted",
    },
  ],
  recommendationHistory: [],
  finalStatus: "SUCCESS",
  durationMs: 3500,
  summary: "Completed successfully",
};

describe("Phase 4A: End-to-End Report Generation", () => {
  it("generates summary.html and report.json on disk", async () => {
    const reportDir = join(testDir, "output-report");

    const result = await generateReport(sampleResult, {
      outputDir: reportDir,
    });

    expect(result.htmlPath).toBe(join(reportDir, "summary.html"));
    expect(result.jsonPath).toBe(join(reportDir, "report.json"));

    // Check files exist
    const htmlStat = await stat(result.htmlPath);
    expect(htmlStat.isFile()).toBe(true);

    const jsonStat = await stat(result.jsonPath);
    expect(jsonStat.isFile()).toBe(true);

    // Check HTML content
    const html = await readFile(result.htmlPath, "utf8");
    expect(html).toContain("Elevate Visual Refinement Report");
    expect(html).toContain("http://localhost:3000");
    expect(html).toContain("Touch target too small");

    // Check JSON content
    const json = await readFile(result.jsonPath, "utf8");
    const parsed = JSON.parse(json);
    expect(parsed.reportType).toBe("multi-pass");
    expect(parsed.executiveSummary.passesAccepted).toBe(1);
  });

  it("embeds images as base64 when embedImages: true", async () => {
    const reportDir = join(testDir, "embed-report");

    const customData = {
      ...sampleResult,
      passResults: [
        {
          ...sampleResult.passResults[0],
          verificationResult: {
            transactionId: "tx-1",
            decision: "ACCEPT" as const,
            decisionRationale: ["OK"],
            durationMs: 100,
            errors: [],
            comparison: {
              transactionId: "tx-1",
              recommendationId: "rec1",
              findingsBefore: [],
              findingsAfter: [],
              hardGates: [],
              browserResult: {
                success: true,
                viewportsCaptured: 1,
                screenshotPaths: [dummyScreenshotPath],
                errors: [],
                durationMs: 50,
              },
              regression: {
                hardGatesPassed: true,
                targetedIssueImproved: true,
                targetedIssueDegraded: false,
                newCriticalFindings: 0,
                newSeriousFindings: 0,
                newAccessibilityFindings: 0,
                newOverflowFindings: 0,
                newBrokenImageFindings: 0,
                newTouchTargetFindings: 0,
                newRuntimeFailures: false,
                visualRegressionDetected: false,
                anyHardRegression: false,
              },
            },
          },
        },
      ],
    };

    const result = await generateReport(customData, {
      outputDir: reportDir,
      embedImages: true,
    });

    const html = await readFile(result.htmlPath, "utf8");
    expect(html).toContain("data:image/png;base64,");
  });

  it("CLI report command is registered in program", () => {
    const program = createCli();
    const reportCmd = program.commands.find((c) => c.name() === "report");
    expect(reportCmd).toBeDefined();

    const options = reportCmd?.options.map((o) => o.long);
    expect(options).toContain("--output-dir");
    expect(options).toContain("--embed-images");
  });
});
