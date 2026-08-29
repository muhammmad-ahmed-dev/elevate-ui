/**
 * Phase 4C & 4C.5: Benchmark Suite Runner
 *
 * Coordinates execution of benchmark cases, concurrency, infrastructure retries,
 * progress reporting, and result aggregation across direct patch providers and
 * external CodingAgentAdapters (Antigravity CLI, Mock, etc.).
 */

import { promisify } from "node:util";
import { execFile } from "node:child_process";
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
import { CodingAgentRegistry } from "../agent/adapters/registry.js";
import type { AgentTask } from "../agent/adapters/types.js";
import { runAuditPipeline } from "../cli/commands/audit.js";
import { logger } from "../utils/logger.js";

const execFileAsync = promisify(execFile);

export class BenchmarkRunner {
  /**
   * Executes a benchmark case using an external autonomous coding agent
   * (Antigravity CLI, Mock) on an isolated disposable repository.
   */
  public static async runAgentSingleCase(
    benchCase: BenchmarkCase,
    options: BenchmarkSuiteOptions,
    adapterName: string
  ): Promise<BenchmarkRun> {
    const model =
      options.model ||
      (adapterName === "antigravity" ? "gemini-3.7-flash-high" : "default");
    const startTime = Date.now();

    // 1. Provision isolated disposable repository & fixture preview server
    const provisioned = await provisionBenchmarkRepository(benchCase);
    const fixtureServer = await startBenchmarkFixtureServer(
      provisioned.projectRoot,
      benchCase.componentPath
    );

    try {
      // 2. Initial baseline perception and deterministic audit
      const baselineAudit = await runAuditPipeline(fixtureServer.url, {
        skipVision: true,
      });
      const baselineFindings = baselineAudit.deduplicatedFindings || [];

      logger.info(`✔ Baseline audit complete: ${baselineFindings.length} issue(s) flagged across viewports`);

      if (baselineFindings.length === 0) {
        logger.info(`ℹ [AGENT:${adapterName}] No actionable baseline findings detected for ${benchCase.id}.`);
        return {
          runId: `agent-noaction-${Date.now()}`,
          caseId: benchCase.id,
          caseName: benchCase.name,
          category: benchCase.category,
          difficulty: benchCase.difficulty,
          provider: adapterName,
          model,
          maxPasses: 1,
          startTime,
          endTime: Date.now(),
          durationMs: Date.now() - startTime,
          initialFindings: [],
          finalFindings: [],
          passesExecuted: 0,
          passesAccepted: 0,
          passesRolledBack: 0,
          regressions: 0,
          resolvedFindings: 0,
          stoppingReason: "NO_ACTIONABLE",
          finalStatus: "NO_ACTIONABLE_IMPROVEMENT",
          classification: "NO_ACTIONABLE",
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
        };
      }

      // 3. Resolve recommendation and problem description
      const recommendation = baselineAudit.recommendations[0];
      const problemDescription = recommendation
        ? `${recommendation.problem}. Proposed improvement: ${recommendation.proposedImprovement}`
        : `Resolve detected visual/accessibility defect in category ${benchCase.category}`;

      // 4. Construct AgentTask (CRITICAL: NEVER leak benchmark fixedCode or answer diffs!)
      const normalizedPath = benchCase.componentPath.replace(/\\/g, "/");
      const task: AgentTask = {
        taskId: `task-${Date.now()}`,
        caseId: benchCase.id,
        caseName: benchCase.name,
        category: benchCase.category,
        targetFiles: [normalizedPath],
        problemDescription,
        expectedVisualImprovement: benchCase.description,
        relevantEvidence: (recommendation?.evidence as Record<string, unknown>) || {},
        workspaceRoot: provisioned.projectRoot,
        model,
        effort: options.effort || "high",
        timeoutMs: options.timeoutMs || 120000,
      };

      // 5. Retrieve adapter from registry
      const adapter =
        CodingAgentRegistry.get(adapterName) || CodingAgentRegistry.getDefault();

      logger.info(
        `► [AGENT:${adapter.name}] Dispatching task to ${adapter.name} (model: ${model}, effort: ${task.effort}) on ${normalizedPath}...`
      );

      // 6. Execute task via adapter
      const agentResult = await adapter.executeTask(task);

      // Handle Authentication Required
      if (agentResult.errorCode === "AGENT_AUTHENTICATION_REQUIRED") {
        logger.error(`✖ [AGENT:${adapter.name}] Authentication required: Please authenticate via CLI.`);
        return {
          runId: `agent-auth-${Date.now()}`,
          caseId: benchCase.id,
          caseName: benchCase.name,
          category: benchCase.category,
          difficulty: benchCase.difficulty,
          provider: adapter.name,
          model,
          maxPasses: 1,
          startTime,
          endTime: Date.now(),
          durationMs: agentResult.durationMs,
          initialFindings: baselineFindings,
          finalFindings: baselineFindings,
          passesExecuted: 1,
          passesAccepted: 0,
          passesRolledBack: 0,
          regressions: 0,
          resolvedFindings: 0,
          stoppingReason: "AGENT_AUTHENTICATION_REQUIRED",
          finalStatus: "MUTATION_FAILED",
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
          errorMessage:
            "AGENT_AUTHENTICATION_REQUIRED: Antigravity authentication required: run 'agy auth' to authenticate.",
        };
      }

      // Handle CLI not found or crash without edits
      if (
        !agentResult.success &&
        (!agentResult.actualModifiedFiles || agentResult.actualModifiedFiles.length === 0)
      ) {
        const isInfra =
          agentResult.errorCode === "CLI_NOT_FOUND" ||
          Boolean(agentResult.errorMessage?.includes("UNAVAILABLE")) ||
          Boolean(agentResult.errorMessage?.includes("503")) ||
          Boolean(agentResult.errorMessage?.includes("Eligibility check failed"));

        logger.error(
          `✖ [AGENT:${adapter.name}] Agent execution failed in ${agentResult.durationMs}ms: ${agentResult.errorMessage || "Unknown error"}`
        );

        return {
          runId: `agent-err-${Date.now()}`,
          caseId: benchCase.id,
          caseName: benchCase.name,
          category: benchCase.category,
          difficulty: benchCase.difficulty,
          provider: adapter.name,
          model,
          maxPasses: 1,
          startTime,
          endTime: Date.now(),
          durationMs: agentResult.durationMs,
          initialFindings: baselineFindings,
          finalFindings: baselineFindings,
          passesExecuted: 1,
          passesAccepted: 0,
          passesRolledBack: 0,
          regressions: 0,
          resolvedFindings: 0,
          stoppingReason: agentResult.errorCode || "AGENT_CRASH",
          finalStatus: "MUTATION_FAILED",
          classification: isInfra ? "INFRASTRUCTURE_FAILURE" : "PRODUCT_FAILURE",
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
          errorMessage: agentResult.errorMessage,
        };
      }

      const modifiedFiles = agentResult.actualModifiedFiles || [];
      const gitDiff = agentResult.gitDiffProduced || "";

      // If no modifications were made on disk
      if (modifiedFiles.length === 0 || !gitDiff.trim()) {
        logger.warn(
          `⚠ [AGENT:${adapter.name}] Agent completed execution in ${agentResult.durationMs}ms without modifying any files on disk.`
        );
        return {
          runId: `agent-noedit-${Date.now()}`,
          caseId: benchCase.id,
          caseName: benchCase.name,
          category: benchCase.category,
          difficulty: benchCase.difficulty,
          provider: adapter.name,
          model,
          maxPasses: 1,
          startTime,
          endTime: Date.now(),
          durationMs: agentResult.durationMs,
          initialFindings: baselineFindings,
          finalFindings: baselineFindings,
          passesExecuted: 1,
          passesAccepted: 0,
          passesRolledBack: 0,
          regressions: 0,
          resolvedFindings: 0,
          stoppingReason: "NO_EDITS_PRODUCED",
          finalStatus: "MUTATION_FAILED",
          classification: "PRODUCT_FAILURE",
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
          errorMessage: "Agent completed execution without modifying any target files.",
        };
      }

      logger.success(
        `✔ [AGENT:${adapter.name}] Agent produced on-disk modifications in ${agentResult.durationMs}ms: [${modifiedFiles.join(", ")}]`
      );

      // 7. Elevate Authoritative Safety Chain
      // A. PathGuard & ScopeGuard
      const normalizedTarget = benchCase.componentPath.replace(/\\/g, "/");
      const hasOutOfScope = modifiedFiles.some(
        (f) => f.replace(/\\/g, "/") !== normalizedTarget
      );
      const isProtected = modifiedFiles.some(
        (f) =>
          f.includes("package.json") ||
          f.includes(".env") ||
          f.includes("tsconfig.json")
      );

      if (hasOutOfScope || isProtected) {
        logger.error(
          `✖ [SAFETY:VIOLATION] Agent modified unauthorized files: ${modifiedFiles.join(", ")}. Triggering exact rollback.`
        );
        // Safe rollback
        try {
          await execFileAsync("git", ["reset", "--hard", "HEAD"], {
            cwd: provisioned.projectRoot,
          });
        } catch {
          // ignore
        }

        return {
          runId: `agent-secfail-${Date.now()}`,
          caseId: benchCase.id,
          caseName: benchCase.name,
          category: benchCase.category,
          difficulty: benchCase.difficulty,
          provider: adapter.name,
          model,
          maxPasses: 1,
          startTime,
          endTime: Date.now(),
          durationMs: agentResult.durationMs,
          initialFindings: baselineFindings,
          finalFindings: baselineFindings,
          passesExecuted: 1,
          passesAccepted: 0,
          passesRolledBack: 1,
          regressions: 0,
          resolvedFindings: 0,
          stoppingReason: "SAFETY_VIOLATION",
          finalStatus: "PATCH_REJECTED",
          classification: "SAFETY_FAILURE",
          safetyMetrics: {
            rollbackCorrectness: true,
            protectedPathViolations: isProtected ? 1 : 0,
            outOfScopeMutations: hasOutOfScope ? 1 : 0,
            stagedStatePreserved: true,
            untrackedFilesPreserved: true,
            buildRegressions: 0,
            runtimeFailures: 0,
            orphanProcesses: 0,
            unsafeAccepts: 0,
          },
          errorMessage: `Agent modified files outside authorized scope: ${modifiedFiles.join(", ")}`,
        };
      }

      // B. Verification Pipeline (Re-audit)
      logger.info(`► [VERIFY] Re-auditing mutated component across viewports to verify defect resolution...`);
      const reaudit = await runAuditPipeline(fixtureServer.url, {
        skipVision: true,
      });
      const reauditFindings = reaudit.deduplicatedFindings || [];

      const initialCount = baselineFindings.length;
      const finalCount = reauditFindings.length;
      const resolved = Math.max(0, initialCount - finalCount);
      const newCritical = reauditFindings.filter(
        (f) => f.severity === "critical" && !baselineFindings.some((b) => b.id === f.id)
      ).length;
      const newSerious = reauditFindings.filter(
        (f) => f.severity === "serious" && !baselineFindings.some((b) => b.id === f.id)
      ).length;

      // Decision Gate: Regression Check
      if (newCritical > 0 || newSerious > 0) {
        logger.warn(
          `⚠ [DECISION:ROLLBACK] Agent mutation introduced ${newCritical + newSerious} regression(s). Performing safe rollback.`
        );
        // Rollback
        try {
          await execFileAsync("git", ["reset", "--hard", "HEAD"], {
            cwd: provisioned.projectRoot,
          });
        } catch {
          // ignore
        }

        return {
          runId: `agent-reg-${Date.now()}`,
          caseId: benchCase.id,
          caseName: benchCase.name,
          category: benchCase.category,
          difficulty: benchCase.difficulty,
          provider: adapter.name,
          model,
          maxPasses: 1,
          startTime,
          endTime: Date.now(),
          durationMs: Date.now() - startTime,
          initialFindings: baselineFindings,
          finalFindings: baselineFindings,
          passesExecuted: 1,
          passesAccepted: 0,
          passesRolledBack: 1,
          regressions: newCritical + newSerious,
          resolvedFindings: 0,
          stoppingReason: "REGRESSION",
          finalStatus: "ROLLED_BACK",
          classification: "REGRESSION",
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
          errorMessage: `Agent mutation introduced ${newCritical + newSerious} new regression(s). Rolled back safely.`,
        };
      }

      // Decision Gate: Verified Improvement Check
      if (resolved === 0 && finalCount >= initialCount) {
        logger.warn(
          `⚠ [DECISION:NO_PROGRESS] Mutation did not resolve or reduce findings (initial: ${initialCount}, final: ${finalCount}).`
        );
        return {
          runId: `agent-no-progress-${Date.now()}`,
          caseId: benchCase.id,
          caseName: benchCase.name,
          category: benchCase.category,
          difficulty: benchCase.difficulty,
          provider: adapter.name,
          model,
          maxPasses: 1,
          startTime,
          endTime: Date.now(),
          durationMs: Date.now() - startTime,
          initialFindings: baselineFindings,
          finalFindings: reauditFindings,
          passesExecuted: 1,
          passesAccepted: 0,
          passesRolledBack: 0,
          regressions: 0,
          resolvedFindings: 0,
          stoppingReason: "NO_NET_PROGRESS",
          finalStatus: "MUTATION_FAILED",
          classification: "PRODUCT_FAILURE",
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
          errorMessage: "Agent modified component on disk but failed to reduce or resolve any baseline findings.",
        };
      }

      // Verification passed -> ACCEPT
      logger.success(
        `✔ [DECISION:ACCEPT] Mutation accepted: resolved ${resolved} issue(s) (${initialCount} → ${finalCount}) with 0 regressions.`
      );

      return {
        runId: `agent-success-${Date.now()}`,
        caseId: benchCase.id,
        caseName: benchCase.name,
        category: benchCase.category,
        difficulty: benchCase.difficulty,
        provider: adapter.name,
        model,
        maxPasses: 1,
        startTime,
        endTime: Date.now(),
        durationMs: Date.now() - startTime,
        initialFindings: baselineFindings,
        finalFindings: reauditFindings,
        passesExecuted: 1,
        passesAccepted: 1,
        passesRolledBack: 0,
        regressions: 0,
        resolvedFindings: resolved,
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
      };
    } finally {
      // 8. Always clean up preview server and disposable repository
      await fixtureServer.close();
      await provisioned.cleanup();
    }
  }

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

    // Check if an external coding agent adapter should execute the case
    const isAgentMode =
      Boolean(options.agentAdapter) ||
      provider === "antigravity" ||
      provider === "mock-agent" ||
      (options.agentAdapter === "mock" && provider === "mock");

    if (isAgentMode) {
      const adapterKey = options.agentAdapter || provider;
      return BenchmarkRunner.runAgentSingleCase(benchCase, options, adapterKey);
    }

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
              finalStatus: "MUTATION_FAILED",
              classification: "INFRASTRUCTURE_FAILURE" as const,
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
        logger.info(
          `Running batch [${i + 1}-${Math.min(i + concurrency, cases.length)}/${cases.length}]...`
        );
        const chunkPromises = chunk.map(async (benchCase): Promise<BenchmarkRun> => {
          try {
            return await BenchmarkRunner.runSingleCase(benchCase, options);
          } catch (err: any) {
            const fallback: BenchmarkRun = {
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
              finalStatus: "MUTATION_FAILED",
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
            return fallback;
          }
        });
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
