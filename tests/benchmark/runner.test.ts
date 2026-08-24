/**
 * Phase 4C: Benchmark Runner Integration Tests
 */

import { describe, it, expect } from "vitest";
import { BenchmarkRunner } from "../../src/benchmark/runner.js";
import { getBenchmarkCaseById } from "../../src/benchmark/fixtures/catalogue.js";
import { GitManager } from "../../src/safety/git.js";

describe("Phase 4C: Benchmark Runner & Suite Execution", () => {
  it(
    "executes a single benchmark case in isolated disposable environment",
    async () => {
      const benchCase = getBenchmarkCaseById("bench-accessibility-01")!;
      expect(benchCase).toBeDefined();

      // Verify host repo git status before run
      const hostGit = new GitManager();
      const beforeStatus = await hostGit.getStatus();

      const run = await BenchmarkRunner.runSingleCase(benchCase, {
        provider: "mock",
        maxPasses: 1,
      });

      expect(run.caseId).toBe("bench-accessibility-01");
      expect(run.classification).toBe("SUCCESS");
      expect(run.passesAccepted).toBe(1);

      // Verify host repo git status is completely unaffected
      const afterStatus = await hostGit.getStatus();
      expect(afterStatus.isClean).toBe(beforeStatus.isClean);
    },
    60000
  );

  it(
    "executes a filtered 3-case benchmark suite",
    async () => {
      const report = await BenchmarkRunner.runSuite({
        suiteName: "Small Smoke Benchmark Suite",
        categoryFilter: "accessibility",
        maxPasses: 1,
        seed: 123,
      });

      expect(report.totalCases).toBeGreaterThanOrEqual(3);
      expect(report.successfulCases).toBe(report.totalCases);
      expect(report.convergenceRate).toBe(1.0);
      expect(report.safetySummary.unsafeAcceptCount).toBe(0);
      expect(report.reproducibility.randomSeed).toBe(123);
    },
    90000
  );
});
