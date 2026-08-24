/**
 * Phase 4C: Benchmark Evaluator Unit Tests
 */

import { describe, it, expect } from "vitest";
import { BenchmarkEvaluator } from "../../src/benchmark/evaluator.js";
import { getBenchmarkCaseById } from "../../src/benchmark/fixtures/catalogue.js";
import type { MultiPassImproveResult } from "../../src/agent/improve/types.js";

describe("Phase 4C: Benchmark Evaluator & Aggregator", () => {
  const benchCase = getBenchmarkCaseById("bench-accessibility-01")!;

  it("classifies accepted improvement run as SUCCESS", () => {
    const mockResult: MultiPassImproveResult = {
      runId: "run-eval-success",
      targetUrl: "http://localhost:3000",
      maxPasses: 1,
      passesExecuted: 1,
      passesAccepted: 1,
      passesRolledBack: 0,
      recommendationsConsidered: 1,
      recommendationsSkipped: 0,
      stoppingReason: "MAX_PASSES_REACHED",
      baselineFindings: [
        {
          id: "f1",
          category: "accessibility",
          severity: "serious",
          title: "Low contrast",
          description: "Contrast is 2.1:1",
          evidence: {},
          viewport: "desktop",
          source: "deterministic",
          deterministic: true,
          confidence: 1.0,
        },
      ],
      finalFindings: [],
      passResults: [],
      recommendationHistory: [],
      finalStatus: "SUCCESS",
      durationMs: 1500,
      summary: "Improvement accepted",
    };

    const evaluated = BenchmarkEvaluator.evaluateCaseRun(
      benchCase,
      mockResult,
      1000,
      2500,
      "mock",
      "default"
    );

    expect(evaluated.classification).toBe("SUCCESS");
    expect(evaluated.resolvedFindings).toBe(1);
    expect(evaluated.regressions).toBe(0);
    expect(evaluated.safetyMetrics.unsafeAccepts).toBe(0);
  });

  it("classifies rolled-back run as REGRESSION", () => {
    const mockResult: MultiPassImproveResult = {
      runId: "run-eval-rollback",
      targetUrl: "http://localhost:3000",
      maxPasses: 1,
      passesExecuted: 1,
      passesAccepted: 0,
      passesRolledBack: 1,
      recommendationsConsidered: 1,
      recommendationsSkipped: 0,
      stoppingReason: "ROLLBACK",
      baselineFindings: [],
      finalFindings: [],
      passResults: [],
      recommendationHistory: [],
      finalStatus: "ROLLED_BACK",
      durationMs: 1200,
      summary: "Rolled back due to regression",
    };

    const evaluated = BenchmarkEvaluator.evaluateCaseRun(
      benchCase,
      mockResult,
      1000,
      2200,
      "mock",
      "default"
    );

    expect(evaluated.classification).toBe("REGRESSION");
    expect(evaluated.passesRolledBack).toBe(1);
  });

  it("aggregates benchmark suite report accurately", () => {
    const mockRuns = [
      {
        runId: "r1",
        caseId: "bench-a11y-01",
        caseName: "Case 1",
        category: "accessibility" as const,
        difficulty: "easy" as const,
        provider: "mock",
        model: "default",
        maxPasses: 1,
        startTime: 0,
        endTime: 1000,
        durationMs: 1000,
        initialFindings: [
          {
            id: "f1",
            category: "accessibility",
            severity: "critical" as const,
            title: "T1",
            description: "D1",
            evidence: {},
            viewport: "desktop",
            source: "deterministic" as const,
            deterministic: true,
            confidence: 1,
          },
        ],
        finalFindings: [],
        passesExecuted: 1,
        passesAccepted: 1,
        passesRolledBack: 0,
        regressions: 0,
        resolvedFindings: 1,
        stoppingReason: "MAX_PASSES_REACHED",
        finalStatus: "SUCCESS" as const,
        classification: "SUCCESS" as const,
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
    ];

    const report = BenchmarkEvaluator.aggregateReport("Test Suite", mockRuns, 42);

    expect(report.totalCases).toBe(1);
    expect(report.successfulCases).toBe(1);
    expect(report.convergenceRate).toBe(1.0);
    expect(report.safetySummary.unsafeAcceptCount).toBe(0);
    expect(report.reproducibility.randomSeed).toBe(42);
  });
});
