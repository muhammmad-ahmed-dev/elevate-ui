/**
 * Phase 4C: Benchmark Reporter Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  renderBenchmarkHtmlReport,
  generateBenchmarkReport,
} from "../../src/benchmark/reporter.js";
import type { BenchmarkReport } from "../../src/benchmark/types.js";

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "elevate-bench-report-test-"));
});

afterEach(async () => {
  try {
    await rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup error
  }
});

const sampleReport: BenchmarkReport = {
  reportId: "bench-rep-sample",
  timestamp: "2026-08-25T00:00:00.000Z",
  suiteName: "Core Visual Benchmark Suite",
  totalCases: 2,
  successfulCases: 2,
  failedCases: 0,
  rolledBackCases: 0,
  safetyFailures: 0,
  regressionsCount: 0,
  averagePasses: 1.0,
  averageDurationMs: 1200,
  issueResolutionRate: 1.0,
  regressionRate: 0.0,
  convergenceRate: 1.0,
  safetySummary: {
    rollbackCorrectnessRate: 1.0,
    protectedPathViolationRate: 0.0,
    outOfScopeMutationRate: 0.0,
    stagedStatePreservationRate: 1.0,
    untrackedFilePreservationRate: 1.0,
    buildRegressionRate: 0.0,
    runtimeFailureRate: 0.0,
    orphanProcessRate: 0.0,
    unsafeAcceptCount: 0,
  },
  productSummary: {
    passAcceptanceRate: 1.0,
    repeatedRecommendationRate: 0.0,
    noNetProgressRate: 0.0,
    p50RuntimeMs: 1200,
    p95RuntimeMs: 1200,
    beforeTotalFindings: 2,
    afterTotalFindings: 0,
    beforeCriticalFindings: 0,
    afterCriticalFindings: 0,
    beforeSeriousFindings: 2,
    afterSeriousFindings: 0,
  },
  providerStats: {
    mock: {
      totalRuns: 2,
      successCount: 2,
      successRate: 1.0,
      averageDurationMs: 1200,
      averagePasses: 1.0,
    },
  },
  modelStats: {
    default: {
      totalRuns: 2,
      successCount: 2,
      successRate: 1.0,
      averageDurationMs: 1200,
    },
  },
  caseResults: [
    {
      runId: "r1",
      caseId: "bench-accessibility-01",
      caseName: "Contrast Fix 1",
      category: "accessibility",
      difficulty: "medium",
      provider: "mock",
      model: "default",
      maxPasses: 1,
      startTime: 0,
      endTime: 1200,
      durationMs: 1200,
      initialFindings: [],
      finalFindings: [],
      passesExecuted: 1,
      passesAccepted: 1,
      passesRolledBack: 0,
      regressions: 0,
      resolvedFindings: 1,
      stoppingReason: "MAX_PASSES_REACHED",
      finalStatus: "SUCCESS",
      classification: "SUCCESS",
      safetyMetrics: {
        rollbackCorrectness: true,
        protectedPathViolations: 0,
        outOfScopeMutations: 0,
        stagedStatePreserved: true,
        untrackedFilesPreserved: true,
        buildRegressions: 0,
        runtimeFailures: 0,
        orphanProcesses: 0,
        unsafeAccepts: 0,
      },
    },
  ],
  reproducibility: {
    benchmarkVersion: "0.1.0",
    fixtureVersion: "0.1.0",
    randomSeed: 42,
    gitCommit: "main",
    nodeVersion: "v20.0.0",
    platform: "win32",
    timestamp: "2026-08-25T00:00:00.000Z",
  },
};

describe("Phase 4C: Benchmark Reporter", () => {
  it("renders valid standalone HTML report", () => {
    const html = renderBenchmarkHtmlReport(sampleReport);
    expect(html).toContain("Core Visual Benchmark Suite");
    expect(html).toContain("Convergence Rate");
    expect(html).toContain("bench-accessibility-01");
    expect(html).toContain("Seed: <code>42</code>");
  });

  it("generates benchmark-summary.html and benchmark-report.json on disk", async () => {
    const { htmlPath, jsonPath } = await generateBenchmarkReport(sampleReport, testDir);

    const html = await readFile(htmlPath, "utf8");
    expect(html).toContain("Core Visual Benchmark Suite");

    const json = await readFile(jsonPath, "utf8");
    const parsed = JSON.parse(json);
    expect(parsed.suiteName).toBe("Core Visual Benchmark Suite");
    expect(parsed.totalCases).toBe(2);
  });
});
