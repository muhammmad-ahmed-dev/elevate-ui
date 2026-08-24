/**
 * Phase 4C: Benchmark Suite Runner
 *
 * Coordinates execution of benchmark cases, concurrency, infrastructure retries,
 * progress reporting, and result aggregation.
 */

import { BENCHMARK_CATALOGUE, getBenchmarkCases } from "./fixtures/catalogue.js";
import {
  provisionBenchmarkRepository,
  startBenchmarkFixtureServer,
} from "./fixtures/provisioner.js";
import { BenchmarkEvaluator } from "./evaluator.js";
import type {
  BenchmarkCase,
  BenchmarkRun,
  BenchmarkReport,
  BenchmarkSuiteOptions,
} from "./types.js";
import { runMultiPassImproveLoop } from "../agent/improve/loop.js";
import type { MultiPassImproveOptions } from "../agent/improve/types.js";
import { logger } from "../utils/logger.js";

export class BenchmarkRunner {
  /**
   * Runs a single benchmark case in an isolated, disposable Git environment.
   */
  public static async runSingleCase(
    benchCase: BenchmarkCase,
    options: BenchmarkSuiteOptions = {}
  ): Promise<BenchmarkRun> {
    const provider = options.provider || "mock";
    const model = options.model || "default";
    const maxPasses = options.maxPasses || 1;
    const startTime = Date.now();

    // 1. Provision isolated repository
    const provisioned = await provisionBenchmarkRepository(benchCase);
    const fixtureServer = await startBenchmarkFixtureServer(
      provisioned.projectRoot,
      benchCase.componentPath
    );

    try {
      // 2. Prepare improve execution options
      const improveOptions: MultiPassImproveOptions = {
        targetUrl: fixtureServer.url,
        projectRoot: provisioned.projectRoot,
        maxPasses,
        dryRun: Boolean(options.dryRun),
        autoApprove: true,
        patchProvider: provider,
        patchModel: model,
        mockPatchScenario: "valid_single_file",
        customPatch: benchCase.mockPatchOverride,
        customTargetFiles: [benchCase.componentPath],
        typecheckCmd: process.platform === "win32" ? "cmd.exe /c exit 0" : "true",
        buildCmd: process.platform === "win32" ? "cmd.exe /c exit 0" : "true",
        serverAlreadyRunning: true,
        allowNeutralVisualResult: true,
        skipVision: true,
      };

      // 3. Execute Elevate improve loop
      const result = await runMultiPassImproveLoop(improveOptions);
      const endTime = Date.now();

      // 4. Evaluate and classify result
      return BenchmarkEvaluator.evaluateCaseRun(
        benchCase,
        result,
        startTime,
        endTime,
        provider,
        model
      );
    } finally {
      // 5. Always clean up server and disposable repository
      await fixtureServer.close();
      await provisioned.cleanup();
    }
  }

  /**
   * Executes a full or filtered benchmark suite.
   */
  public static async runSuite(
    options: BenchmarkSuiteOptions = {}
  ): Promise<BenchmarkReport> {
    const suiteName = options.suiteName || "Elevate Core Visual Benchmark";
    const seed = options.seed ?? 42;

    // Filter cases
    let cases = getBenchmarkCases({
      category: options.categoryFilter,
      tag: options.tagFilter,
      caseId: options.caseFilter,
    });

    if (cases.length === 0) {
      cases = BENCHMARK_CATALOGUE;
    }

    logger.title(`BENCHMARK SUITE: ${suiteName} (${cases.length} cases)`);

    const runs: BenchmarkRun[] = [];
    const concurrency = Math.min(Math.max(1, options.concurrency || 1), 8);

    // Sequential execution or bounded concurrency
    if (concurrency === 1) {
      for (const [idx, benchCase] of cases.entries()) {
        logger.info(`[${idx + 1}/${cases.length}] Running ${benchCase.id} (${benchCase.category})...`);

        let run: BenchmarkRun;
        let attempts = 0;
        const maxInfraRetries = 2;

        while (true) {
          try {
            attempts++;
            run = await BenchmarkRunner.runSingleCase(benchCase, options);
            break;
          } catch (err: any) {
            if (attempts <= maxInfraRetries && err.message?.includes("provision")) {
              logger.warn(`Infrastructure failure on ${benchCase.id}, retrying provisioning (${attempts}/${maxInfraRetries})...`);
              continue;
            }
            run = {
              runId: `infra-err-${Date.now()}`,
              caseId: benchCase.id,
              caseName: benchCase.name,
              category: benchCase.category,
              difficulty: benchCase.difficulty,
              provider: options.provider || "mock",
              model: options.model || "default",
              maxPasses: options.maxPasses || 1,
              startTime: Date.now(),
              endTime: Date.now(),
              durationMs: 0,
              initialFindings: [],
              finalFindings: [],
              passesExecuted: 0,
              passesAccepted: 0,
              passesRolledBack: 0,
              regressions: 0,
              resolvedFindings: 0,
              stoppingReason: "INFRASTRUCTURE_FAILURE",
              finalStatus: "ERROR",
              classification: "INFRASTRUCTURE_FAILURE",
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
              errorMessage: err.message,
            };
            break;
          }
        }

        runs.push(run);

        if (options.failFast && run.classification === "PRODUCT_FAILURE") {
          logger.error(`Fail-fast triggered on ${benchCase.id}`);
          break;
        }
      }
    } else {
      // Chunked concurrent execution
      for (let i = 0; i < cases.length; i += concurrency) {
        const chunk = cases.slice(i, i + concurrency);
        const chunkPromises = chunk.map((benchCase) =>
          BenchmarkRunner.runSingleCase(benchCase, options)
        );
        const results = await Promise.all(chunkPromises);
        runs.push(...results);

        if (options.failFast && results.some((r) => r.classification === "PRODUCT_FAILURE")) {
          break;
        }
      }
    }

    const report = BenchmarkEvaluator.aggregateReport(suiteName, runs, seed);
    logger.success(
      `Benchmark complete: ${report.successfulCases}/${report.totalCases} passed (${Math.round(
        report.convergenceRate * 100
      )}% success rate)`
    );

    return report;
  }
}
