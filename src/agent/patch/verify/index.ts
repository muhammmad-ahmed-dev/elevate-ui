/**
 * Phase 3E: Verification Pipeline — Main Orchestrator
 *
 * Takes an APPLIED MutationTransaction (from Phase 3D) and drives the full
 * verification pipeline:
 *
 *   1. Hard gates (TypeScript + build)
 *   2. Optional runtime startup (if devServerCmd provided)
 *   3. Browser verification (3 viewports)
 *   4. Route smoke test
 *   5. Deterministic re-audit
 *   6. Visual re-analysis (if enabled)
 *   7. Regression analysis + Before/After comparison
 *   8. DecisionGate → ACCEPT | ROLLBACK | ERROR | BLOCKED
 *
 * BINDING SAFETY RULES (enforced throughout):
 *  - NEVER calls legacy safety git rollback.
 *  - NEVER calls blanket cleanup operations.
 */
export * from "./types.js";
export * from "./typecheck.js";
export * from "./build.js";
export * from "./runtime.js";
export * from "./browser.js";
export * from "./regression.js";
export * from "./decision.js";
export * from "./gates.js";

import { logger } from "../../../utils/logger.js";
import type { MutationTransaction } from "../../types.js";
import type { Finding, MutationRecommendation } from "../../../analysis/types.js";
import { VisualEvaluator } from "../../../analysis/heuristic/evaluator.js";
import { runHardGates } from "./gates.js";
import { startRuntime, runRouteSmoke } from "./runtime.js";
import { runBrowserVerification } from "./browser.js";
import { runDeterministicReaudit, assembleBeforeAfterComparison } from "./regression.js";
import { DecisionGate } from "./decision.js";
import type {
  VerificationPipelineOptions,
  VerificationPipelineResult,
  VisualReanalysisResult,
  BrowserVerificationResult,
  RuntimeHandle,
} from "./types.js";

export class VerificationPipeline {
  private options: VerificationPipelineOptions;

  constructor(options: VerificationPipelineOptions) {
    this.options = options;
  }

  /**
   * Run the full Phase 3E verification pipeline for an APPLIED transaction.
   *
   * @param transaction  The MutationTransaction in APPLIED state.
   * @param findingsBefore  Findings captured BEFORE this mutation (from Phase 2 analysis).
   * @param recommendation  The MutationRecommendation that drove this mutation.
   */
  public async run(
    transaction: MutationTransaction,
    findingsBefore: Finding[],
    recommendation: MutationRecommendation
  ): Promise<VerificationPipelineResult> {
    const start = Date.now();
    const errors: string[] = [];
    let runtimeHandle: RuntimeHandle | undefined;

    logger.title(
      `Phase 3E: Verification Pipeline for transaction ${transaction.transactionId.slice(0, 8)}`
    );

    // -----------------------------------------------------------------------
    // 1. Hard gates (TypeScript + build)
    // -----------------------------------------------------------------------
    const hardGates = await runHardGates({
      projectRoot: this.options.projectRoot,
      targetUrl: this.options.targetUrl,
      typecheckCmd: this.options.typecheckCmd,
      buildCmd: this.options.buildCmd,
      navigationTimeoutMs: this.options.navigationTimeoutMs,
      serverAlreadyRunning: this.options.serverAlreadyRunning,
    });

    // -----------------------------------------------------------------------
    // 2. Optional runtime startup (if devServerCmd provided and server not already running)
    // -----------------------------------------------------------------------
    if (!this.options.serverAlreadyRunning && this.options.devServerCmd) {
      const runtimeResult = await startRuntime({
        cwd: this.options.projectRoot,
        command: this.options.devServerCmd,
        targetUrl: this.options.targetUrl,
        startupTimeoutMs: this.options.startupTimeoutMs,
      });

      if (runtimeResult.success && runtimeResult.handle) {
        runtimeHandle = runtimeResult.handle;
      } else {
        errors.push(runtimeResult.error ?? "Runtime startup failed");
        // Add a failed runtime gate to the hard gates list
        hardGates.push({
          name: "Runtime Startup",
          passed: false,
          output: runtimeResult.error ?? "Failed to start dev server",
          error: runtimeResult.error,
          durationMs: runtimeResult.durationMs,
          mandatory: true,
        });
      }
    }

    // -----------------------------------------------------------------------
    // 3. Browser verification + route smoke test
    // -----------------------------------------------------------------------
    let browserResult: BrowserVerificationResult = {
      success: false,
      viewportsCaptured: 0,
      screenshotPaths: [] as string[],
      errors: ["Browser verification not attempted"],
      durationMs: 0,
    };

    const serverIsAvailable =
      this.options.serverAlreadyRunning || runtimeHandle !== undefined;

    if (serverIsAvailable) {
      // Route smoke test first
      const routeSmoke = await runRouteSmoke({
        targetUrl: this.options.targetUrl,
        navigationTimeoutMs: this.options.navigationTimeoutMs,
      });
      hardGates.push(routeSmoke);

      if (routeSmoke.passed) {
        // Full browser verification
        browserResult = await runBrowserVerification({
          targetUrl: this.options.targetUrl,
          screenshotDir: this.options.screenshotDir,
          navigationTimeoutMs: this.options.navigationTimeoutMs,
        });
        if (!browserResult.success) {
          errors.push(...browserResult.errors);
        }
      } else {
        errors.push("Route smoke test failed — browser verification skipped");
        browserResult = {
          success: false,
          viewportsCaptured: 0,
          screenshotPaths: [],
          errors: ["Skipped — route smoke test failed"],
          durationMs: 0,
        };
      }
    }

    // -----------------------------------------------------------------------
    // 4. Deterministic re-audit
    // -----------------------------------------------------------------------
    let findingsAfter: Finding[] = [];
    if (browserResult.success && browserResult.captureResult) {
      const reauditResult = await runDeterministicReaudit(browserResult.captureResult);
      findingsAfter = reauditResult.findings;
      errors.push(...reauditResult.errors);
    } else {
      logger.warn("Deterministic re-audit skipped — no browser capture available.");
    }

    // -----------------------------------------------------------------------
    // 5. Visual re-analysis (optional, non-blocking)
    // -----------------------------------------------------------------------
    let visualResult: VisualReanalysisResult = {
      available: false,
      findings: [],
      errors: [],
      durationMs: 0,
    };

    const enableVisual = this.options.enableVisualReanalysis ?? true;
    if (enableVisual && browserResult.success && browserResult.captureResult) {
      const visualStart = Date.now();
      try {
        const evaluator = new VisualEvaluator({
          providerName: this.options.visionProviderName,
          apiKey: this.options.visionApiKey,
          enabled: true,
        });

        const { findings, errors: vErrors } = await evaluator.evaluateVisual(
          this.options.targetUrl,
          browserResult.captureResult,
          findingsAfter
        );

        visualResult = {
          available: true,
          providerName: this.options.visionProviderName ?? "gemini",
          findings,
          errors: vErrors,
          durationMs: Date.now() - visualStart,
        };

        if (vErrors.length > 0) {
          // Provider failure is non-blocking — logged but not treated as hard failure
          logger.warn(`Visual re-analysis had errors: ${vErrors.join("; ")}`);
        }
      } catch (err: any) {
        const msg = `Visual re-analysis provider threw: ${err.message}`;
        logger.warn(msg);
        visualResult = {
          available: false,
          findings: [],
          errors: [msg],
          durationMs: Date.now() - visualStart,
        };
      }
    } else if (enableVisual) {
      logger.warn("Visual re-analysis skipped — browser capture unavailable.");
    }

    // -----------------------------------------------------------------------
    // 6. Assemble Before/After comparison + regression summary
    // -----------------------------------------------------------------------
    const comparison = assembleBeforeAfterComparison(
      transaction.transactionId,
      recommendation,
      findingsBefore,
      findingsAfter,
      hardGates,
      browserResult,
      visualResult,
      { allowNeutralVisualResult: this.options.allowNeutralVisualResult }
    );

    // -----------------------------------------------------------------------
    // 7. Decision Gate (performs rollback if needed via authorized path only)
    // -----------------------------------------------------------------------
    const gate = new DecisionGate(this.options.projectRoot);
    const decisionResult = await gate.evaluate(transaction, comparison, {
      allowNeutralVisualResult: this.options.allowNeutralVisualResult,
      enableVisualReanalysis: enableVisual,
    });

    // -----------------------------------------------------------------------
    // 8. Cleanup: shutdown runtime process (always, even on error)
    // -----------------------------------------------------------------------
    if (runtimeHandle) {
      try {
        logger.info("Shutting down runtime process...");
        await runtimeHandle.shutdown();
        logger.success("Runtime process terminated cleanly.");
      } catch (cleanupErr: any) {
        logger.error(`Runtime shutdown failed: ${cleanupErr.message}`);
        errors.push(`Runtime cleanup warning: ${cleanupErr.message}`);
      }
    }

    // -----------------------------------------------------------------------
    // 9. Structured observability log
    // -----------------------------------------------------------------------
    logger.info(JSON.stringify({
      transactionId: transaction.transactionId,
      decision: decisionResult.decision,
      hardGatesPassed: comparison.regression.hardGatesPassed,
      targetedIssueImproved: comparison.regression.targetedIssueImproved,
      newCriticalFindings: comparison.regression.newCriticalFindings,
      newSeriousFindings: comparison.regression.newSeriousFindings,
      viewportsCaptured: browserResult.viewportsCaptured,
      durationMs: Date.now() - start,
    }));

    return {
      transactionId: transaction.transactionId,
      decision: decisionResult.decision,
      decisionRationale: decisionResult.rationale,
      comparison,
      rollbackResult: decisionResult.rollbackResult,
      recoveryInstructions: decisionResult.recoveryInstructions,
      durationMs: Date.now() - start,
      errors,
    };
  }
}
