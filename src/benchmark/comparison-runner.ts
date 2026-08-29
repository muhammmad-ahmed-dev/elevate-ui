/**
 * Phase 5A: Controlled Agent-Alone vs Agent+Elevate Comparison Runner
 *
 * Executes identical controlled A/B benchmark runs across isolated repository pairs.
 * Evaluates quality, efficiency, safety, and time dimensions with zero answer leakage.
 */

import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { ComparisonProvisioner } from "./comparison-provisioner.js";
import { COMPARISON_CORPUS, getComparisonCases, type ComparisonCase } from "./fixtures/comparison-corpus.js";
import type {
  ComparisonExecutionMetrics,
  AgentBenchmarkComparison,
  ComparisonSuiteOptions,
  ComparisonSuiteReport,
  DimensionOutcome,
} from "./comparison-types.js";
import { CodingAgentRegistry } from "../agent/adapters/registry.js";
import type { AgentTask, AgentRunResult } from "../agent/adapters/types.js";
import { AgentDirector } from "../agent/design/director.js";
import { AgentTaskBuilder } from "../agent/workflow/task-builder.js";
import { WorkflowVerifier } from "../agent/workflow/verifier.js";
import type { DesignPlanResult, UserRequest } from "../agent/design/types.js";
import { logger } from "../utils/logger.js";

const execFileAsync = promisify(execFile);

function parseDiffLineCounts(diff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      additions++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      deletions++;
    }
  }
  return { additions, deletions };
}

export class ComparisonRunner {
  /**
   * Runs a single controlled A/B comparison case.
   */
  public static async runSingleComparison(
    comparisonCase: ComparisonCase,
    options: ComparisonSuiteOptions = {}
  ): Promise<AgentBenchmarkComparison> {
    const agentName = options.agent || "antigravity";
    const model = options.model || (agentName === "antigravity" ? "gemini-3.7-flash-high" : "default");
    const effort = options.effort || "high";
    const timeoutMs = options.timeoutMs || 120000;

    logger.info(`\n=== BENCHMARK A/B CASE: ${comparisonCase.id} [${comparisonCase.name}] ===`);

    // 1. Provision isolated identical workspace pair
    const pair = await ComparisonProvisioner.provisionIsolatedPair(comparisonCase);

    try {
      // -----------------------------------------------------------------------
      // RUN A: AGENT ALONE (Baseline)
      // -----------------------------------------------------------------------
      logger.info(`► [RUN A: AGENT ALONE] Executing ${agentName} (${model}) without Elevate planning...`);
      const baselineRun = await this.executeAgentAlone(comparisonCase, pair.aloneWorkspaceRoot, {
        agentName,
        model,
        effort,
        timeoutMs,
        dryRun: options.dryRun,
      });

      // -----------------------------------------------------------------------
      // RUN B: AGENT + ELEVATE
      // -----------------------------------------------------------------------
      logger.info(`► [RUN B: AGENT + ELEVATE] Executing ${agentName} (${model}) with Elevate planning...`);
      const elevateRun = await this.executeAgentElevate(comparisonCase, pair.elevateWorkspaceRoot, {
        agentName,
        model,
        effort,
        timeoutMs,
        dryRun: options.dryRun,
      });

      // -----------------------------------------------------------------------
      // COMPUTE DELTAS & DIMENSION WINNERS
      // -----------------------------------------------------------------------
      const qualityDelta =
        elevateRun.resolvedFindingCount -
        baselineRun.resolvedFindingCount +
        (baselineRun.finalFindingCount - elevateRun.finalFindingCount);

      const defectDelta = elevateRun.finalFindingCount - baselineRun.finalFindingCount;
      const regressionDelta = elevateRun.regressionCount - baselineRun.regressionCount;
      const timeDelta = elevateRun.totalDurationMs - baselineRun.totalDurationMs;
      const acceptanceDelta = elevateRun.acceptanceCriteriaPassed - baselineRun.acceptanceCriteriaPassed;

      // Quality Winner: Higher resolved findings, fewer residual defects, or higher AC pass rate
      let qualityWinner: DimensionOutcome = "TIE";
      if (
        elevateRun.resolvedFindingCount > baselineRun.resolvedFindingCount ||
        elevateRun.finalFindingCount < baselineRun.finalFindingCount ||
        elevateRun.acceptanceCriteriaPassed > baselineRun.acceptanceCriteriaPassed
      ) {
        qualityWinner = "WIN";
      } else if (
        baselineRun.resolvedFindingCount > elevateRun.resolvedFindingCount ||
        baselineRun.finalFindingCount < elevateRun.finalFindingCount ||
        baselineRun.acceptanceCriteriaPassed > elevateRun.acceptanceCriteriaPassed
      ) {
        qualityWinner = "LOSS";
      }

      // Efficiency Winner: Defect resolution per turn or lower token waste
      let efficiencyWinner: DimensionOutcome = "TIE";
      const elevateEff = elevateRun.resolvedFindingCount / Math.max(1, elevateRun.agentTurnCount || 1);
      const baselineEff = baselineRun.resolvedFindingCount / Math.max(1, baselineRun.agentTurnCount || 1);
      if (elevateEff > baselineEff || (elevateRun.success && !baselineRun.success)) {
        efficiencyWinner = "WIN";
      } else if (baselineEff > elevateEff) {
        efficiencyWinner = "LOSS";
      }

      // Safety Winner: Zero regressions and zero safety failures
      let safetyWinner: DimensionOutcome = "TIE";
      if (elevateRun.regressionCount < baselineRun.regressionCount || (elevateRun.success && !baselineRun.success)) {
        safetyWinner = "WIN";
      } else if (baselineRun.regressionCount < elevateRun.regressionCount) {
        safetyWinner = "LOSS";
      }

      // Time Winner: Shorter total duration
      let timeWinner: DimensionOutcome = "TIE";
      if (timeDelta < -1000) {
        timeWinner = "WIN";
      } else if (timeDelta > 1000) {
        timeWinner = "LOSS";
      }

      logger.info(
        `✔ Case ${comparisonCase.id} Complete | Quality: ${qualityWinner} | Efficiency: ${efficiencyWinner} | Safety: ${safetyWinner} | Time: ${timeWinner}`
      );

      return {
        caseId: comparisonCase.id,
        caseName: comparisonCase.name,
        category: comparisonCase.category,
        inputMode: comparisonCase.inputMode,
        agent: agentName,
        model,
        baselineRun,
        elevateRun,
        qualityDelta,
        efficiencyDelta: elevateEff - baselineEff,
        defectDelta,
        regressionDelta,
        timeDelta,
        turnDelta: (elevateRun.agentTurnCount || 1) - (baselineRun.agentTurnCount || 1),
        acceptanceDelta,
        dimensionWinners: {
          quality: qualityWinner,
          efficiency: efficiencyWinner,
          safety: safetyWinner,
          time: timeWinner,
        },
      };
    } finally {
      await pair.cleanup();
    }
  }

  /**
   * Executes Run A: Agent Alone without Elevate planning.
   */
  private static async executeAgentAlone(
    comparisonCase: ComparisonCase,
    workspaceRoot: string,
    config: { agentName: string; model: string; effort: "low" | "medium" | "high"; timeoutMs: number; dryRun?: boolean }
  ): Promise<ComparisonExecutionMetrics> {
    const startTime = Date.now();
    const adapter = CodingAgentRegistry.get(config.agentName) || CodingAgentRegistry.getDefault();

    if (config.dryRun) {
      const planResult = AgentDirector.plan({ prompt: comparisonCase.prompt });
      return {
        mode: "AGENT_ALONE",
        totalDurationMs: Date.now() - startTime,
        agentDurationMs: 0,
        planningDurationMs: 0,
        verificationDurationMs: 0,
        estimatedContextTokens: Math.ceil(comparisonCase.prompt.length / 4),
        tokenStatus: "ESTIMATED",
        filesChanged: 0,
        linesAdded: 0,
        linesDeleted: 0,
        iterations: 1,
        initialFindingCount: 0,
        finalFindingCount: 0,
        resolvedFindingCount: 0,
        newFindingCount: 0,
        regressionCount: 0,
        acceptanceCriteriaPassed: 0,
        acceptanceCriteriaTotal: planResult.acceptanceCriteria.length,
        success: true,
        classification: "SUCCESS",
        modifiedFiles: [],
        gitDiff: "",
      };
    }

    // 1. Initial baseline verification
    const planResultForVerify = AgentDirector.plan({ prompt: comparisonCase.prompt });
    const baselineVerify = await WorkflowVerifier.verify(workspaceRoot, planResultForVerify, {
      prompt: comparisonCase.prompt,
      skipVision: true,
    });
    const initialFindings = baselineVerify.findings;

    // 2. Formulate bare baseline AgentTask (NO Elevate design plan, NO token-optimized context)
    const task: AgentTask = {
      taskId: `task-alone-${comparisonCase.id}-${Date.now()}`,
      caseId: comparisonCase.id,
      caseName: comparisonCase.name,
      category: comparisonCase.category,
      targetFiles: [comparisonCase.componentPath],
      problemDescription: comparisonCase.prompt,
      workspaceRoot,
      model: config.model,
      effort: config.effort,
      timeoutMs: config.timeoutMs,
      customInstructions: `Implement or modify component at '${comparisonCase.componentPath}' to satisfy user goal: ${comparisonCase.prompt}`,
    };

    // 3. Execute agent
    const agentStart = Date.now();
    const agentResult: AgentRunResult = await adapter.executeTask(task);
    const agentDurationMs = Date.now() - agentStart;

    // 4. Post-mutation verification
    const verifyStart = Date.now();
    const postVerify = await WorkflowVerifier.verify(workspaceRoot, planResultForVerify, {
      prompt: comparisonCase.prompt,
      skipVision: true,
    });
    const verificationDurationMs = Date.now() - verifyStart;

    const diffCounts = parseDiffLineCounts(agentResult.gitDiffProduced || "");
    const finalFindings = postVerify.findings;
    const resolvedFindings = Math.max(0, initialFindings.length - finalFindings.length);
    const newFindings = Math.max(0, finalFindings.length - (initialFindings.length - resolvedFindings));
    const passedAc = postVerify.acceptanceCriteriaEvaluations.filter((e) => e.passed).length;

    return {
      mode: "AGENT_ALONE",
      totalDurationMs: Date.now() - startTime,
      agentDurationMs,
      planningDurationMs: 0,
      verificationDurationMs,
      agentTurnCount: 1,
      estimatedContextTokens: Math.ceil((task.customInstructions?.length || 0) / 4),
      tokenStatus: "ESTIMATED",
      filesChanged: agentResult.actualModifiedFiles?.length || 0,
      linesAdded: diffCounts.additions,
      linesDeleted: diffCounts.deletions,
      iterations: 1,
      initialFindingCount: initialFindings.length,
      finalFindingCount: finalFindings.length,
      resolvedFindingCount: resolvedFindings,
      newFindingCount: newFindings,
      regressionCount: postVerify.criticalFindings,
      acceptanceCriteriaPassed: passedAc,
      acceptanceCriteriaTotal: planResultForVerify.acceptanceCriteria.length,
      success: agentResult.success && postVerify.hardGatesPassed,
      classification: postVerify.hardGatesPassed ? "SUCCESS" : "PRODUCT_FAILURE",
      failureReason: agentResult.errorMessage,
      modifiedFiles: agentResult.actualModifiedFiles || [],
      gitDiff: agentResult.gitDiffProduced || "",
      findings: finalFindings,
    };
  }

  /**
   * Executes Run B: Agent + Elevate with design director planning and high-density context.
   */
  private static async executeAgentElevate(
    comparisonCase: ComparisonCase,
    workspaceRoot: string,
    config: { agentName: string; model: string; effort: "low" | "medium" | "high"; timeoutMs: number; dryRun?: boolean }
  ): Promise<ComparisonExecutionMetrics> {
    const startTime = Date.now();
    const adapter = CodingAgentRegistry.get(config.agentName) || CodingAgentRegistry.getDefault();

    // 1. Initial baseline verification
    const request: UserRequest = {
      prompt: comparisonCase.prompt,
      references: comparisonCase.references,
      targetMode: comparisonCase.inputMode,
    };

    const planStart = Date.now();
    const planResult: DesignPlanResult = AgentDirector.plan(request);
    const planningDurationMs = Date.now() - planStart;

    if (config.dryRun) {
      return {
        mode: "AGENT_ELEVATE",
        totalDurationMs: Date.now() - startTime,
        agentDurationMs: 0,
        planningDurationMs,
        verificationDurationMs: 0,
        estimatedContextTokens: planResult.agentContext.metrics.estimatedTokens,
        tokenStatus: "ESTIMATED",
        filesChanged: 0,
        linesAdded: 0,
        linesDeleted: 0,
        iterations: 1,
        initialFindingCount: 0,
        finalFindingCount: 0,
        resolvedFindingCount: 0,
        newFindingCount: 0,
        regressionCount: 0,
        acceptanceCriteriaPassed: 0,
        acceptanceCriteriaTotal: planResult.acceptanceCriteria.length,
        success: true,
        classification: "SUCCESS",
        modifiedFiles: [],
        gitDiff: "",
      };
    }

    const baselineVerify = await WorkflowVerifier.verify(workspaceRoot, planResult, {
      prompt: comparisonCase.prompt,
      skipVision: true,
    });
    const initialFindings = baselineVerify.findings;

    // 2. Build structured, high-density AgentTask via Elevate task builder
    const task = AgentTaskBuilder.buildTask(planResult, {
      prompt: comparisonCase.prompt,
      agentName: config.agentName,
      agentModel: config.model,
      effort: config.effort,
      timeoutMs: config.timeoutMs,
    }, workspaceRoot);

    // 3. Execute agent
    const agentStart = Date.now();
    const agentResult: AgentRunResult = await adapter.executeTask(task);
    const agentDurationMs = Date.now() - agentStart;

    // 4. Post-mutation verification
    const verifyStart = Date.now();
    const postVerify = await WorkflowVerifier.verify(workspaceRoot, planResult, {
      prompt: comparisonCase.prompt,
      skipVision: true,
    });
    const verificationDurationMs = Date.now() - verifyStart;

    const diffCounts = parseDiffLineCounts(agentResult.gitDiffProduced || "");
    const finalFindings = postVerify.findings;
    const resolvedFindings = Math.max(0, initialFindings.length - finalFindings.length);
    const newFindings = Math.max(0, finalFindings.length - (initialFindings.length - resolvedFindings));
    const passedAc = postVerify.acceptanceCriteriaEvaluations.filter((e) => e.passed).length;

    return {
      mode: "AGENT_ELEVATE",
      totalDurationMs: Date.now() - startTime,
      agentDurationMs,
      planningDurationMs,
      verificationDurationMs,
      agentTurnCount: 1,
      estimatedContextTokens: planResult.agentContext.metrics.estimatedTokens,
      tokenStatus: "ESTIMATED",
      filesChanged: agentResult.actualModifiedFiles?.length || 0,
      linesAdded: diffCounts.additions,
      linesDeleted: diffCounts.deletions,
      iterations: 1,
      initialFindingCount: initialFindings.length,
      finalFindingCount: finalFindings.length,
      resolvedFindingCount: resolvedFindings,
      newFindingCount: newFindings,
      regressionCount: postVerify.criticalFindings,
      acceptanceCriteriaPassed: passedAc,
      acceptanceCriteriaTotal: planResult.acceptanceCriteria.length,
      success: agentResult.success && postVerify.hardGatesPassed,
      classification: postVerify.hardGatesPassed ? "SUCCESS" : "PRODUCT_FAILURE",
      failureReason: agentResult.errorMessage,
      modifiedFiles: agentResult.actualModifiedFiles || [],
      gitDiff: agentResult.gitDiffProduced || "",
      findings: finalFindings,
    };
  }

  /**
   * Runs the full comparative benchmark suite.
   */
  public static async runSuite(options: ComparisonSuiteOptions = {}): Promise<ComparisonSuiteReport> {
    const reportId = `bench-compare-${Date.now()}`;
    const timestamp = new Date().toISOString();
    const suiteName = options.suiteName || "Elevate Controlled A/B Benchmark Suite";
    const agent = options.agent || "antigravity";
    const model = options.model || (agent === "antigravity" ? "gemini-3.7-flash-high" : "default");

    let cases: ComparisonCase[];
    if (options.caseFilter || options.categoryFilter) {
      cases = getComparisonCases({
        caseId: options.caseFilter,
        category: options.categoryFilter,
      });
    } else {
      cases = COMPARISON_CORPUS;
    }

    logger.title(`ELEVATE: CONTROLLED A/B BENCHMARK (${cases.length} cases)`);
    logger.info(`Agent: ${agent} | Model: ${model}`);

    const comparisons: AgentBenchmarkComparison[] = [];
    const fixtureHashes: Record<string, string> = {};

    for (const c of cases) {
      try {
        const comparison = await this.runSingleComparison(c, options);
        comparisons.push(comparison);
      } catch (err: any) {
        logger.error(`✖ Comparison failed for ${c.id}: ${err.message}`);
        if (options.failFast) {
          break;
        }
      }
    }

    // Tally wins across evaluated dimensions
    const elevateWins = {
      qualityWins: comparisons.filter((c) => c.dimensionWinners.quality === "WIN").length,
      efficiencyWins: comparisons.filter((c) => c.dimensionWinners.efficiency === "WIN").length,
      safetyWins: comparisons.filter((c) => c.dimensionWinners.safety === "WIN").length,
      timeWins: comparisons.filter((c) => c.dimensionWinners.time === "WIN").length,
    };

    const agentAloneWins = {
      qualityWins: comparisons.filter((c) => c.dimensionWinners.quality === "LOSS").length,
      efficiencyWins: comparisons.filter((c) => c.dimensionWinners.efficiency === "LOSS").length,
      safetyWins: comparisons.filter((c) => c.dimensionWinners.safety === "LOSS").length,
      timeWins: comparisons.filter((c) => c.dimensionWinners.time === "LOSS").length,
    };

    const ties = {
      qualityTies: comparisons.filter((c) => c.dimensionWinners.quality === "TIE").length,
      efficiencyTies: comparisons.filter((c) => c.dimensionWinners.efficiency === "TIE").length,
      safetyTies: comparisons.filter((c) => c.dimensionWinners.safety === "TIE").length,
      timeTies: comparisons.filter((c) => c.dimensionWinners.time === "TIE").length,
    };

    // Calculate aggregates
    const totalCases = comparisons.length;
    const aloneRuns = comparisons.map((c) => c.baselineRun);
    const elevateRuns = comparisons.map((c) => c.elevateRun);

    const aloneTotalDuration = aloneRuns.reduce((sum, r) => sum + r.totalDurationMs, 0);
    const elevateTotalDuration = elevateRuns.reduce((sum, r) => sum + r.totalDurationMs, 0);

    const aloneSuccess = aloneRuns.filter((r) => r.success).length;
    const elevateSuccess = elevateRuns.filter((r) => r.success).length;

    let gitCommit = "unknown";
    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"]);
      gitCommit = stdout.trim();
    } catch {
      // ignore
    }

    return {
      reportId,
      timestamp,
      suiteName,
      agent,
      model,
      totalCases,
      elevateWins,
      agentAloneWins,
      ties,
      aggregateMetrics: {
        agentAlone: {
          totalDurationMs: aloneTotalDuration,
          avgDurationMs: totalCases > 0 ? Math.round(aloneTotalDuration / totalCases) : 0,
          totalResolvedFindings: aloneRuns.reduce((sum, r) => sum + r.resolvedFindingCount, 0),
          totalFinalFindings: aloneRuns.reduce((sum, r) => sum + r.finalFindingCount, 0),
          totalRegressions: aloneRuns.reduce((sum, r) => sum + r.regressionCount, 0),
          successRate: totalCases > 0 ? Number((aloneSuccess / totalCases).toFixed(2)) : 0,
          avgAcceptanceRate:
            totalCases > 0
              ? Number(
                  (
                    aloneRuns.reduce(
                      (sum, r) => sum + (r.acceptanceCriteriaTotal > 0 ? r.acceptanceCriteriaPassed / r.acceptanceCriteriaTotal : 0),
                      0
                    ) / totalCases
                  ).toFixed(2)
                )
              : 0,
        },
        agentElevate: {
          totalDurationMs: elevateTotalDuration,
          avgDurationMs: totalCases > 0 ? Math.round(elevateTotalDuration / totalCases) : 0,
          totalResolvedFindings: elevateRuns.reduce((sum, r) => sum + r.resolvedFindingCount, 0),
          totalFinalFindings: elevateRuns.reduce((sum, r) => sum + r.finalFindingCount, 0),
          totalRegressions: elevateRuns.reduce((sum, r) => sum + r.regressionCount, 0),
          successRate: totalCases > 0 ? Number((elevateSuccess / totalCases).toFixed(2)) : 0,
          avgAcceptanceRate:
            totalCases > 0
              ? Number(
                  (
                    elevateRuns.reduce(
                      (sum, r) => sum + (r.acceptanceCriteriaTotal > 0 ? r.acceptanceCriteriaPassed / r.acceptanceCriteriaTotal : 0),
                      0
                    ) / totalCases
                  ).toFixed(2)
                )
              : 0,
        },
      },
      comparisons,
      reproducibility: {
        seed: options.seed || 42,
        agent,
        model,
        nodeVersion: process.version,
        platform: process.platform,
        gitCommit,
        timestamp,
        fixtureHashes,
      },
    };
  }
}
