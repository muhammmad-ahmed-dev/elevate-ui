/**
 * Phase 3G: Bounded Multi-Pass Improvement Engine
 *
 * Coordinates multi-pass closed-loop visual elevation with strict convergence controls:
 *  - Configurable bounded passes (1-10, ceiling enforced).
 *  - Initial baseline captured once and preserved.
 *  - Re-audit of application state after each ACCEPTED pass.
 *  - Recommendation history tracking and deduplication/fingerprinting.
 *  - Deterministic progress evaluation to avoid pseudo-improvements.
 *  - Immediate safe termination on ROLLBACK, ERROR, or USER_CANCELLED.
 *  - Strict adherence to Phase 3 transaction and verification boundaries.
 */

import { randomUUID } from "node:crypto";
import { logger } from "../../utils/logger.js";
import { runAuditPipeline } from "../../cli/commands/audit.js";
import { ComponentLocator } from "../locator.js";
import { PatchPlanner } from "../plan.js";
import { SourceContextBuilder } from "../patch/context.js";
import { selectPatchProvider } from "../patch/selector.js";
import { PatchValidator } from "../patch/validate/validator.js";
import { MutationTransactionRunner } from "../patch/transaction/transaction.js";
import { VerificationPipeline } from "../patch/verify/index.js";
import { selectBestRecommendation } from "./selector.js";
import { promptUserApproval } from "./approval.js";
import { RecommendationHistoryTracker } from "./history.js";
import { ProgressEvaluator } from "./progress.js";
import type {
  MultiPassImproveOptions,
  MultiPassImproveResult,
  ImprovePassResult,
  MultiPassStoppingReason,
  ImproveRunStatus,
} from "./types.js";
import type { Finding } from "../../analysis/types.js";
import type { PatchGenerationRequest } from "../patch/types.js";

const DEFAULT_MAX_ALLOWED_PASSES = 10;

export class MultiPassImproveEngine {
  private options: MultiPassImproveOptions;
  private historyTracker: RecommendationHistoryTracker;

  constructor(options: MultiPassImproveOptions) {
    this.options = options;
    this.historyTracker = new RecommendationHistoryTracker();
  }

  /**
   * Validate options and pass boundaries.
   */
  private validateOptions(): { valid: boolean; error?: string; maxPasses: number } {
    const rawPasses = this.options.maxPasses ?? 1;
    const maxCeiling = this.options.maxAllowedPasses ?? DEFAULT_MAX_ALLOWED_PASSES;

    if (typeof rawPasses !== "number" || isNaN(rawPasses) || !isFinite(rawPasses)) {
      return { valid: false, error: `Invalid max-passes value: '${rawPasses}'. Must be a positive integer.`, maxPasses: 1 };
    }

    if (!Number.isInteger(rawPasses) || rawPasses < 1) {
      return { valid: false, error: `max-passes must be an integer >= 1 (received ${rawPasses}).`, maxPasses: 1 };
    }

    if (rawPasses > maxCeiling) {
      return { valid: false, error: `max-passes (${rawPasses}) exceeds maximum safety ceiling of ${maxCeiling}.`, maxPasses: maxCeiling };
    }

    return { valid: true, maxPasses: rawPasses };
  }

  /**
   * Executes the bounded multi-pass improvement loop.
   */
  public async runLoop(): Promise<MultiPassImproveResult> {
    const runId = `elevate-multipass-${randomUUID().slice(0, 8)}`;
    const startTime = Date.now();

    const validation = this.validateOptions();
    if (!validation.valid) {
      const msg = validation.error ?? "Invalid multi-pass options.";
      logger.error(`MultiPassImproveEngine: ${msg}`);
      return {
        runId,
        targetUrl: this.options.targetUrl,
        maxPasses: 1,
        passesExecuted: 0,
        passesAccepted: 0,
        passesRolledBack: 0,
        recommendationsConsidered: 0,
        recommendationsSkipped: 0,
        stoppingReason: "SAFETY_ERROR",
        baselineFindings: [],
        finalFindings: [],
        passResults: [],
        recommendationHistory: [],
        finalStatus: "ERROR",
        durationMs: Date.now() - startTime,
        summary: msg,
      };
    }

    const maxPasses = validation.maxPasses;
    logger.title(`ELEVATE: BOUNDED MULTI-PASS IMPROVE [${runId}]`);
    logger.info(`Target URL: ${this.options.targetUrl}`);
    logger.info(`Project Root: ${this.options.projectRoot}`);
    logger.info(`Configured Max Passes: ${maxPasses}`);
    if (this.options.dryRun) logger.warn("Mode: DRY RUN (No mutations will be applied to disk)");
    if (this.options.autoApprove) logger.info("Approval: AUTO-APPROVE (Autonomous execution)");

    const passResults: ImprovePassResult[] = [];
    let stoppingReason: MultiPassStoppingReason = "MAX_PASSES_REACHED";
    let finalStatus: ImproveRunStatus = "SUCCESS";
    let baselineFindings: Finding[] = [];
    let currentFindings: Finding[] = [];
    let recoveryInstructions: string[] | undefined;

    try {
      // ---------------------------------------------------------------------
      // 1. Initial Baseline Audit
      // ---------------------------------------------------------------------
      logger.info("[BASELINE] Running initial perception and multi-viewport audit...");
      const baselineAudit = await runAuditPipeline(this.options.targetUrl, {
        screenshotsDir: this.options.screenshotDir,
        visionProvider: this.options.visionProvider,
        visionModel: this.options.visionModel,
        skipVision: this.options.skipVision,
      });

      baselineFindings = baselineAudit.deduplicatedFindings;
      currentFindings = baselineFindings;
      let currentRecommendations = baselineAudit.recommendations;

      logger.info(
        `Baseline captured: ${baselineFindings.length} finding(s), ${currentRecommendations.length} recommendation(s).`
      );

      // ---------------------------------------------------------------------
      // 2. Multi-Pass Improvement Loop
      // ---------------------------------------------------------------------
      for (let pass = 1; pass <= maxPasses; pass++) {
        logger.title(`=== PASS ${pass} of ${maxPasses} ===`);

        // If pass > 1, perform fresh re-audit of the mutated application state
        if (pass > 1) {
          logger.info(`[PASS ${pass}] Re-auditing application after previous accepted mutation...`);
          const reaudit = await runAuditPipeline(this.options.targetUrl, {
            screenshotsDir: this.options.screenshotDir,
            visionProvider: this.options.visionProvider,
            visionModel: this.options.visionModel,
            skipVision: this.options.skipVision,
          });

          currentFindings = reaudit.deduplicatedFindings;
          currentRecommendations = reaudit.recommendations;
          logger.info(
            `[PASS ${pass}] Fresh state: ${currentFindings.length} finding(s), ${currentRecommendations.length} recommendation(s).`
          );
        }

        // Filter out previously attempted/failed recommendations
        const unattemptedRecs = this.historyTracker.filterCandidates(currentRecommendations);

        // Select best actionable candidate
        const recommendation = selectBestRecommendation(unattemptedRecs, {
          minConfidence: this.options.minConfidence ?? 0.5,
        });

        if (!recommendation) {
          logger.info(`[PASS ${pass}] No actionable recommendations remain.`);
          stoppingReason = "NO_ACTIONABLE_IMPROVEMENTS";
          if (pass === 1) finalStatus = "NO_ACTIONABLE_IMPROVEMENT";
          break;
        }

        // Check for repeated recommendation / duplicate proposal fingerprint
        if (this.historyTracker.isRepeated(recommendation)) {
          logger.warn(
            `[PASS ${pass}] Analyzer proposed repeated recommendation '${recommendation.id}' matching earlier fingerprint. Stopping loop.`
          );
          this.historyTracker.recordSkipped(
            recommendation,
            pass,
            "SUPERSEDED",
            "Repeated proposal with identical fingerprint"
          );
          stoppingReason = "REPEATED_RECOMMENDATION";
          break;
        }

        // Register candidate as attempted
        this.historyTracker.recordAttempt(recommendation, pass);
        logger.info(`[PASS ${pass}] Selected: ${recommendation.id} — ${recommendation.problem}`);

        // Execute single-pass steps for this recommendation
        const passStartTime = Date.now();

        // Step 3. Component Location
        const locator = new ComponentLocator({ projectRoot: this.options.projectRoot });
        const locatorResult = await locator.locate(recommendation);

        if (locatorResult.isAmbiguous || !locatorResult.primaryCandidate) {
          const msg = `Component mapping ambiguous: ${locatorResult.summary}`;
          logger.warn(`[PASS ${pass}] ${msg}`);
          this.historyTracker.updateStatus(recommendation.id, "REJECTED", { reason: msg });
          passResults.push({
            passNumber: pass,
            runId: `${runId}-p${pass}`,
            recommendation,
            locatorResult,
            status: "AMBIGUOUS_TARGET",
            targetedImprovement: false,
            newRegressions: 0,
            durationMs: Date.now() - passStartTime,
            summary: msg,
          });
          stoppingReason = "NO_ACTIONABLE_IMPROVEMENTS";
          finalStatus = "AMBIGUOUS_TARGET";
          break;
        }

        // Step 4. Patch Planning
        const planner = new PatchPlanner({
          projectRoot: this.options.projectRoot,
          maxFilesAllowed: this.options.maxFiles,
          maxLinesChanged: this.options.maxLines,
        });

        let patchPlan;
        try {
          patchPlan = planner.createPlan(recommendation, locatorResult);
        } catch (planErr: any) {
          const msg = `PatchPlanner rejected recommendation: ${planErr.message}`;
          logger.error(`[PASS ${pass}] ${msg}`);
          this.historyTracker.updateStatus(recommendation.id, "REJECTED", { reason: msg });
          passResults.push({
            passNumber: pass,
            runId: `${runId}-p${pass}`,
            recommendation,
            locatorResult,
            status: "BLOCKED",
            targetedImprovement: false,
            newRegressions: 0,
            durationMs: Date.now() - passStartTime,
            summary: msg,
            error: planErr.message,
          });
          stoppingReason = "BLOCKED";
          finalStatus = "BLOCKED";
          break;
        }

        // Step 5. Patch Generation
        const contextBuilder = new SourceContextBuilder({ projectRoot: this.options.projectRoot });
        const sourceContext = await contextBuilder.buildContext(patchPlan);

        const patchProvider = selectPatchProvider({
          providerOverride: this.options.patchProvider,
          modelOverride: this.options.patchModel,
          timeoutMs: this.options.timeoutMs,
          mockScenario: this.options.mockPatchScenario,
        });

        const patchRequest: PatchGenerationRequest = {
          requestId: randomUUID(),
          recommendation,
          patchPlan,
          relevantSource: sourceContext.files,
          relevantEvidence: (recommendation.evidence as Record<string, unknown>) ?? {},
          providerName: patchProvider.name,
          modelName: patchProvider.modelName,
        };

        const patchResult = await patchProvider.generatePatch(patchRequest);
        if (!patchResult.success || !patchResult.patch) {
          const msg = `PatchProvider failed: ${patchResult.error?.message ?? "Empty patch returned"}`;
          logger.error(`[PASS ${pass}] ${msg}`);
          this.historyTracker.updateStatus(recommendation.id, "REJECTED", { reason: msg });
          passResults.push({
            passNumber: pass,
            runId: `${runId}-p${pass}`,
            recommendation,
            locatorResult,
            patchPlan,
            patchResult,
            status: "NO_VALID_PATCH",
            targetedImprovement: false,
            newRegressions: 0,
            durationMs: Date.now() - passStartTime,
            summary: msg,
            error: patchResult.error?.message,
          });
          stoppingReason = "SAFETY_ERROR";
          finalStatus = "NO_VALID_PATCH";
          break;
        }

        // Step 6. Patch Validation (AST + Protected Paths + Scope)
        const validator = new PatchValidator({ projectRoot: this.options.projectRoot });
        const validatedPatch = await validator.validate(patchResult, patchPlan);

        if (!validatedPatch.valid) {
          const violationSummary = validatedPatch.violations
            .map((v) => `[${v.category}] ${v.message}`)
            .join("; ");
          const msg = `Patch validation rejected proposed diff: ${violationSummary}`;
          logger.error(`[PASS ${pass}] ${msg}`);
          this.historyTracker.updateStatus(recommendation.id, "REJECTED", { reason: msg });
          passResults.push({
            passNumber: pass,
            runId: `${runId}-p${pass}`,
            recommendation,
            locatorResult,
            patchPlan,
            patchResult,
            validationResult: validatedPatch,
            status: "PATCH_REJECTED",
            targetedImprovement: false,
            newRegressions: 0,
            durationMs: Date.now() - passStartTime,
            summary: msg,
            error: violationSummary,
          });
          stoppingReason = "SAFETY_ERROR";
          finalStatus = "PATCH_REJECTED";
          break;
        }

        // Step 7. Dry-Run Check
        if (this.options.dryRun) {
          const msg = `Dry run pass ${pass} completed. Validated patch proposal prepared without mutating disk.`;
          logger.success(`[PASS ${pass}] ${msg}`);
          this.historyTracker.updateStatus(recommendation.id, "ACCEPTED", { reason: "Dry run validated" });
          passResults.push({
            passNumber: pass,
            runId: `${runId}-p${pass}`,
            recommendation,
            locatorResult,
            patchPlan,
            patchResult,
            validationResult: validatedPatch,
            status: "DRY_RUN",
            targetedImprovement: true,
            newRegressions: 0,
            durationMs: Date.now() - passStartTime,
            summary: msg,
          });
          stoppingReason = "DRY_RUN_COMPLETED";
          finalStatus = "DRY_RUN";
          break;
        }

        // Step 8. Human / Auto Approval
        let approved = false;
        if (this.options.autoApprove) {
          logger.info(`[PASS ${pass}] Auto-approve flag active: proceeding with mutation.`);
          approved = true;
        } else {
          const promptFn = this.options.approvalPrompt ?? promptUserApproval;
          approved = await promptFn({
            passNumber: pass,
            totalPasses: maxPasses,
            recommendation,
            locatorResult,
            patchPlan,
            patchResult,
            validatedPatch,
          });
        }

        if (!approved) {
          const msg = `Pass ${pass} cancelled by user. Zero files modified.`;
          logger.warn(`[PASS ${pass}] ${msg}`);
          this.historyTracker.updateStatus(recommendation.id, "REJECTED", { reason: "User cancelled" });
          passResults.push({
            passNumber: pass,
            runId: `${runId}-p${pass}`,
            recommendation,
            locatorResult,
            patchPlan,
            patchResult,
            validationResult: validatedPatch,
            approvalResult: { approved: false, reason: "Rejected by user" },
            status: "CANCELLED",
            targetedImprovement: false,
            newRegressions: 0,
            durationMs: Date.now() - passStartTime,
            summary: msg,
          });
          stoppingReason = "USER_CANCELLED";
          finalStatus = "CANCELLED";
          break;
        }

        // Step 9. Git Mutation Transaction
        logger.info(`[PASS ${pass}] Executing Git mutation transaction...`);
        const txRunner = new MutationTransactionRunner({ projectRoot: this.options.projectRoot });
        const txResult = await txRunner.execute(
          validatedPatch,
          recommendation.id,
          patchPlan.allowedFiles
        );

        if (!txResult.success || txResult.transaction.transactionState !== "APPLIED") {
          const msg = `Mutation transaction failed: ${txResult.error ?? "Failed to apply"}`;
          logger.error(`[PASS ${pass}] ${msg}`);
          this.historyTracker.updateStatus(recommendation.id, "REJECTED", {
            reason: msg,
            transactionId: txResult.transaction.transactionId,
          });
          passResults.push({
            passNumber: pass,
            runId: `${runId}-p${pass}`,
            recommendation,
            locatorResult,
            patchPlan,
            patchResult,
            validationResult: validatedPatch,
            approvalResult: { approved: true },
            transaction: txResult.transaction,
            transactionResult: txResult,
            status: "MUTATION_FAILED",
            targetedImprovement: false,
            newRegressions: 0,
            durationMs: Date.now() - passStartTime,
            summary: msg,
            error: txResult.error,
          });
          stoppingReason = "SAFETY_ERROR";
          finalStatus = "MUTATION_FAILED";
          break;
        }

        // Step 10. Verification Pipeline & Decision Gate
        logger.info(`[PASS ${pass}] Running Phase 3E verification pipeline...`);
        const verifyPipeline = new VerificationPipeline({
          projectRoot: this.options.projectRoot,
          targetUrl: this.options.targetUrl,
          devServerCmd: this.options.devServerCmd,
          typecheckCmd: this.options.typecheckCmd,
          buildCmd: this.options.buildCmd,
          serverAlreadyRunning: this.options.serverAlreadyRunning,
          allowNeutralVisualResult: this.options.allowNeutralVisualResult,
          enableVisualReanalysis: !this.options.skipVision,
          visionProviderName: this.options.visionProvider,
          screenshotDir: this.options.screenshotDir,
        });

        const verifyResult = await verifyPipeline.run(
          txResult.transaction,
          currentFindings,
          recommendation
        );

        // Step 11. Handle Decision & Convergence
        const decision = verifyResult.decision;

        if (decision === "ACCEPT") {
          const progressResult = ProgressEvaluator.evaluate(
            recommendation,
            currentFindings,
            verifyResult.comparison?.findingsAfter ?? [],
            verifyResult
          );

          this.historyTracker.updateStatus(recommendation.id, "ACCEPTED", {
            transactionId: txResult.transaction.transactionId,
            decision: "ACCEPT",
          });

          passResults.push({
            passNumber: pass,
            runId: `${runId}-p${pass}`,
            recommendation,
            locatorResult,
            patchPlan,
            patchResult,
            validationResult: validatedPatch,
            approvalResult: { approved: true },
            transaction: txResult.transaction,
            transactionResult: txResult,
            verificationResult: verifyResult,
            decision: "ACCEPT",
            status: "SUCCESS",
            targetedImprovement: progressResult.improved,
            newRegressions: progressResult.regressions,
            progress: progressResult,
            durationMs: Date.now() - passStartTime,
            summary: `Pass ${pass} accepted: ${progressResult.reason}`,
          });

          logger.success(`[PASS ${pass}] Mutation accepted! ${progressResult.reason}`);

          if (!progressResult.improved) {
            logger.warn(`[PASS ${pass}] No net-new measurable progress detected. Stopping loop.`);
            stoppingReason = "NO_NET_NEW_PROGRESS";
            break;
          }

          if (pass === maxPasses) {
            stoppingReason = "MAX_PASSES_REACHED";
            finalStatus = "SUCCESS";
          }
        } else if (decision === "ROLLBACK") {
          this.historyTracker.updateStatus(recommendation.id, "ROLLED_BACK", {
            reason: verifyResult.decisionRationale.join("; "),
            transactionId: txResult.transaction.transactionId,
            decision: "ROLLBACK",
          });

          passResults.push({
            passNumber: pass,
            runId: `${runId}-p${pass}`,
            recommendation,
            locatorResult,
            patchPlan,
            patchResult,
            validationResult: validatedPatch,
            approvalResult: { approved: true },
            transaction: txResult.transaction,
            transactionResult: txResult,
            verificationResult: verifyResult,
            decision: "ROLLBACK",
            status: "ROLLED_BACK",
            targetedImprovement: false,
            newRegressions: (verifyResult.comparison?.regression.newCriticalFindings ?? 0) +
                            (verifyResult.comparison?.regression.newSeriousFindings ?? 0),
            durationMs: Date.now() - passStartTime,
            summary: `Pass ${pass} rolled back: ${verifyResult.decisionRationale.join(" ")}`,
          });

          logger.warn(`[PASS ${pass}] Mutation failed verification and was safely rolled back.`);
          stoppingReason = "ROLLBACK";
          finalStatus = "ROLLED_BACK";
          break; // MVP stopping policy: stop immediately on rollback
        } else if (decision === "ERROR") {
          recoveryInstructions = verifyResult.recoveryInstructions;
          this.historyTracker.updateStatus(recommendation.id, "REJECTED", {
            reason: "Critical rollback failure",
            transactionId: txResult.transaction.transactionId,
            decision: "ERROR",
          });

          passResults.push({
            passNumber: pass,
            runId: `${runId}-p${pass}`,
            recommendation,
            locatorResult,
            patchPlan,
            patchResult,
            validationResult: validatedPatch,
            approvalResult: { approved: true },
            transaction: txResult.transaction,
            transactionResult: txResult,
            verificationResult: verifyResult,
            decision: "ERROR",
            status: "ERROR",
            targetedImprovement: false,
            newRegressions: 0,
            durationMs: Date.now() - passStartTime,
            summary: `Critical verification error in pass ${pass}: ${verifyResult.decisionRationale.join(" ")}`,
          });

          stoppingReason = "SAFETY_ERROR";
          finalStatus = "ERROR";
          break;
        } else {
          // BLOCKED
          this.historyTracker.updateStatus(recommendation.id, "SKIPPED", {
            reason: "Verification blocked",
            transactionId: txResult.transaction.transactionId,
            decision: "BLOCKED",
          });

          passResults.push({
            passNumber: pass,
            runId: `${runId}-p${pass}`,
            recommendation,
            locatorResult,
            patchPlan,
            patchResult,
            validationResult: validatedPatch,
            approvalResult: { approved: true },
            transaction: txResult.transaction,
            transactionResult: txResult,
            verificationResult: verifyResult,
            decision: "BLOCKED",
            status: "BLOCKED",
            targetedImprovement: false,
            newRegressions: 0,
            durationMs: Date.now() - passStartTime,
            summary: `Pass ${pass} blocked: ${verifyResult.decisionRationale.join(" ")}`,
          });

          stoppingReason = "BLOCKED";
          finalStatus = "BLOCKED";
          break;
        }
      }
    } catch (err: any) {
      const msg = `MultiPassImproveEngine encountered fatal error: ${err.message}`;
      logger.error(msg);
      stoppingReason = "SAFETY_ERROR";
      finalStatus = "ERROR";
    }

    const stats = this.historyTracker.getStats();
    const durationMs = Date.now() - startTime;

    const summary = `Multi-pass completed in ${durationMs}ms: ${passResults.length} pass(es) executed, ${stats.accepted} accepted, ${stats.rolledBack} rolled back. Stopping reason: ${stoppingReason}.`;
    logger.title("MULTI-PASS IMPROVE COMPLETE");
    logger.info(summary);

    return {
      runId,
      targetUrl: this.options.targetUrl,
      maxPasses,
      passesExecuted: passResults.length,
      passesAccepted: stats.accepted,
      passesRolledBack: stats.rolledBack,
      recommendationsConsidered: stats.considered,
      recommendationsSkipped: stats.skipped,
      stoppingReason,
      baselineFindings,
      finalFindings: currentFindings,
      passResults,
      recommendationHistory: this.historyTracker.getHistory(),
      finalStatus,
      durationMs,
      summary,
      recoveryInstructions,
    };
  }
}

/**
 * Convenience entry point for running bounded multi-pass improvement.
 */
export async function runMultiPassImproveLoop(
  options: MultiPassImproveOptions
): Promise<MultiPassImproveResult> {
  const engine = new MultiPassImproveEngine(options);
  return engine.runLoop();
}
