/**
 * Phase 3F: Single-Pass Improve Engine
 *
 * Orchestrates the complete single-pass visual improvement lifecycle:
 *
 *   1. Audit & Perception (multi-viewport baseline)
 *   2. Recommendation Selection (highest-confidence actionable candidate)
 *   3. Component Location (maps selector to TSX/JSX file)
 *   4. Patch Planning (scoping & safety boundaries)
 *   5. Patch Generation (model prompt with minimal safe context)
 *   6. Patch Validation (AST guard, protected paths, scope limits)
 *   7. Dry-Run Check (stops safely if --dry-run)
 *   8. Human Approval (prompts unless --auto-approve)
 *   9. Git Mutation Transaction (execute -> APPLIED)
 *  10. Verification Pipeline (typecheck, build, browser capture, regression analysis)
 *  11. Decision Gate (ACCEPT -> COMPLETED | ROLLBACK -> ROLLED_BACK | ERROR)
 *
 * BINDING SAFETY INVARIANTS:
 *  - Single mutation attempt only (no automatic retries or second passes in Phase 3F).
 *  - Never mutates during --dry-run or when approval is rejected.
 *  - Never calls legacy rollback or blanket workspace resets.
 *  - Never bypasses PatchValidator, AST guard, or VerificationPipeline.
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
import type {
  ImproveRunOptions,
  ImproveRunResult,
  ImproveRunStatus,
} from "./types.js";
import type { PatchGenerationRequest } from "../patch/types.js";

export class ImproveEngine {
  private options: ImproveRunOptions;

  constructor(options: ImproveRunOptions) {
    this.options = options;
  }

  /**
   * Execute a single controlled improvement pass.
   */
  public async runPass(): Promise<ImproveRunResult> {
    const runId = `elevate-run-${randomUUID().slice(0, 8)}`;
    const startTime = Date.now();
    const progress = this.options.onProgress ?? (() => {});

    logger.title(`ELEVATE: SINGLE-PASS IMPROVE [${runId}]`);
    logger.info(`Target URL: ${this.options.targetUrl}`);
    logger.info(`Project Root: ${this.options.projectRoot}`);
    if (this.options.dryRun) logger.warn("Mode: DRY RUN (No mutations will be applied to disk)");
    if (this.options.autoApprove) logger.info("Approval: AUTO-APPROVE (Non-interactive single-pass)");

    try {
      // ---------------------------------------------------------------------
      // 1. Perception & Baseline Audit
      // ---------------------------------------------------------------------
      progress(1, 8, "Auditing target application...");
      logger.info("[1/8] Running multi-viewport perception and baseline analysis...");

      const auditResult = await runAuditPipeline(this.options.targetUrl, {
        screenshotsDir: this.options.screenshotDir,
        visionProvider: this.options.visionProvider,
        visionModel: this.options.visionModel,
        skipVision: this.options.skipVision,
      });

      const findingsBefore = auditResult.deduplicatedFindings;
      const recommendations = auditResult.recommendations;

      logger.info(
        `Baseline captured: ${findingsBefore.length} finding(s), ${recommendations.length} recommendation(s).`
      );

      // ---------------------------------------------------------------------
      // 2. Select Recommendation
      // ---------------------------------------------------------------------
      progress(2, 8, "Selecting actionable recommendation...");
      logger.info("[2/8] Selecting highest-confidence actionable recommendation...");

      const recommendation = selectBestRecommendation(recommendations);
      if (!recommendation) {
        const msg = "No actionable recommendation with sufficient confidence found.";
        logger.warn(`ImproveEngine: ${msg}`);
        return {
          runId,
          status: "NO_ACTIONABLE_IMPROVEMENT",
          targetUrl: this.options.targetUrl,
          findingsBefore,
          durationMs: Date.now() - startTime,
          summary: msg,
        };
      }

      logger.info(`Selected recommendation: ${recommendation.id} — ${recommendation.problem}`);

      // ---------------------------------------------------------------------
      // 3. Locate Target Component
      // ---------------------------------------------------------------------
      progress(3, 8, "Locating target source component...");
      logger.info("[3/8] Mapping recommendation to concrete source component...");

      const locator = new ComponentLocator({
        projectRoot: this.options.projectRoot,
      });
      const locatorResult = await locator.locate(recommendation);

      if (locatorResult.isAmbiguous || !locatorResult.primaryCandidate) {
        const msg = `Component mapping ambiguous: ${locatorResult.summary}`;
        logger.warn(`ImproveEngine: ${msg}`);
        return {
          runId,
          status: "AMBIGUOUS_TARGET",
          targetUrl: this.options.targetUrl,
          recommendation,
          findingsBefore,
          locatorResult,
          durationMs: Date.now() - startTime,
          summary: msg,
        };
      }

      logger.info(
        `Target mapped to '${locatorResult.primaryCandidate.relativePath}' (Confidence: ${locatorResult.confidence})`
      );

      // ---------------------------------------------------------------------
      // 4. Create Patch Plan
      // ---------------------------------------------------------------------
      logger.info("[4/8] Building constrained PatchPlan...");
      const planner = new PatchPlanner({
        projectRoot: this.options.projectRoot,
        maxFilesAllowed: this.options.maxFiles,
        maxLinesChanged: this.options.maxLines,
      });

      let patchPlan;
      try {
        patchPlan = planner.createPlan(recommendation, locatorResult);
      } catch (planErr: any) {
        const msg = `PatchPlanner refused recommendation: ${planErr.message}`;
        logger.error(`ImproveEngine: ${msg}`);
        return {
          runId,
          status: "BLOCKED",
          targetUrl: this.options.targetUrl,
          recommendation,
          findingsBefore,
          locatorResult,
          durationMs: Date.now() - startTime,
          summary: msg,
          error: planErr.message,
        };
      }

      // ---------------------------------------------------------------------
      // 5. Generate Patch via Provider
      // ---------------------------------------------------------------------
      progress(4, 8, "Generating patch proposal...");
      logger.info("[5/8] Generating patch proposal via patch provider...");

      const contextBuilder = new SourceContextBuilder({
        projectRoot: this.options.projectRoot,
      });
      const sourceContext = await contextBuilder.buildContext(patchPlan);

      const patchProvider = selectPatchProvider({
        providerOverride: this.options.patchProvider,
        modelOverride: this.options.patchModel,
        timeoutMs: this.options.timeoutMs,
        mockScenario: this.options.mockPatchScenario,
        customPatch: this.options.customPatch,
        customTargetFiles: this.options.customTargetFiles,
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
        const msg = `PatchProvider failed to produce a valid diff: ${patchResult.error?.message ?? "Empty patch returned"}`;
        logger.error(`ImproveEngine: ${msg}`);
        return {
          runId,
          status: "NO_VALID_PATCH",
          targetUrl: this.options.targetUrl,
          recommendation,
          findingsBefore,
          locatorResult,
          patchPlan,
          patchResult,
          durationMs: Date.now() - startTime,
          summary: msg,
          error: patchResult.error?.message,
        };
      }

      // ---------------------------------------------------------------------
      // 6. Validate Patch (AST Guard + Path Guard + Scope Guard)
      // ---------------------------------------------------------------------
      progress(5, 8, "Validating patch against AST and safety boundaries...");
      logger.info("[6/8] Running Phase 3C patch validation pipeline...");

      const validator = new PatchValidator({
        projectRoot: this.options.projectRoot,
      });
      const validatedPatch = await validator.validate(patchResult, patchPlan);

      if (!validatedPatch.valid) {
        const violationSummary = validatedPatch.violations
          .map((v) => `[${v.category}] ${v.message}`)
          .join("; ");
        const msg = `Patch validation rejected proposed diff: ${violationSummary}`;
        logger.error(`ImproveEngine: ${msg}`);
        return {
          runId,
          status: "PATCH_REJECTED",
          targetUrl: this.options.targetUrl,
          recommendation,
          findingsBefore,
          locatorResult,
          patchPlan,
          patchResult,
          validationResult: validatedPatch,
          durationMs: Date.now() - startTime,
          summary: msg,
          error: violationSummary,
        };
      }

      logger.success("Patch successfully passed AST, protected-paths, and scope validation.");

      // ---------------------------------------------------------------------
      // 7. Check Dry-Run Mode
      // ---------------------------------------------------------------------
      if (this.options.dryRun) {
        const msg = "Dry run completed successfully. Validated patch proposal prepared without mutating files.";
        logger.success(`ImproveEngine: ${msg}`);
        return {
          runId,
          status: "DRY_RUN",
          targetUrl: this.options.targetUrl,
          recommendation,
          findingsBefore,
          locatorResult,
          patchPlan,
          patchResult,
          validationResult: validatedPatch,
          durationMs: Date.now() - startTime,
          summary: msg,
        };
      }

      // ---------------------------------------------------------------------
      // 8. Human / Auto Approval
      // ---------------------------------------------------------------------
      progress(6, 8, "Awaiting approval for mutation...");
      let approved = false;

      if (this.options.autoApprove) {
        logger.info("Auto-approve flag active: proceeding with mutation transaction.");
        approved = true;
      } else {
        const promptFn = this.options.approvalPrompt ?? promptUserApproval;
        approved = await promptFn({
          recommendation,
          locatorResult,
          patchPlan,
          patchResult,
          validatedPatch,
        });
      }

      if (!approved) {
        const msg = "Improvement pass cancelled by user. Zero files modified.";
        logger.warn(`ImproveEngine: ${msg}`);
        return {
          runId,
          status: "CANCELLED",
          targetUrl: this.options.targetUrl,
          recommendation,
          findingsBefore,
          locatorResult,
          patchPlan,
          patchResult,
          validationResult: validatedPatch,
          approvalResult: { approved: false, reason: "Rejected by user" },
          durationMs: Date.now() - startTime,
          summary: msg,
        };
      }

      // ---------------------------------------------------------------------
      // 9. Git Mutation Transaction Execution
      // ---------------------------------------------------------------------
      progress(7, 8, "Applying mutation in Git transaction...");
      logger.info("[7/8] Executing Git mutation transaction...");

      const txRunner = new MutationTransactionRunner({
        projectRoot: this.options.projectRoot,
      });

      const txResult = await txRunner.execute(
        validatedPatch,
        recommendation.id,
        patchPlan.allowedFiles
      );

      if (!txResult.success || txResult.transaction.transactionState !== "APPLIED") {
        const msg = `Mutation transaction failed: ${txResult.error ?? "Failed to reach APPLIED state"}`;
        logger.error(`ImproveEngine: ${msg}`);
        return {
          runId,
          status: "MUTATION_FAILED",
          targetUrl: this.options.targetUrl,
          recommendation,
          findingsBefore,
          locatorResult,
          patchPlan,
          patchResult,
          validationResult: validatedPatch,
          approvalResult: { approved: true },
          transaction: txResult.transaction,
          transactionResult: txResult,
          durationMs: Date.now() - startTime,
          summary: msg,
          error: txResult.error,
        };
      }

      logger.success("Mutation applied cleanly in safe transaction boundary. Proceeding to verification.");

      // ---------------------------------------------------------------------
      // 10. Verification Pipeline & Decision Gate
      // ---------------------------------------------------------------------
      progress(8, 8, "Verifying mutation and evaluating regressions...");
      logger.info("[8/8] Running Phase 3E verification pipeline...");

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
        findingsBefore,
        recommendation
      );

      // ---------------------------------------------------------------------
      // 11. Handle Decision
      // ---------------------------------------------------------------------
      let finalStatus: ImproveRunStatus = "SUCCESS";
      let summary = "";

      switch (verifyResult.decision) {
        case "ACCEPT":
          finalStatus = "SUCCESS";
          summary = `Mutation verified and accepted! ${verifyResult.decisionRationale.join(" ")}`;
          logger.success(`ImproveEngine: ${summary}`);
          break;

        case "ROLLBACK":
          finalStatus = "ROLLED_BACK";
          summary = `Mutation rejected and safely rolled back: ${verifyResult.decisionRationale.join(" ")}`;
          logger.warn(`ImproveEngine: ${summary}`);
          break;

        case "ERROR":
          finalStatus = "ERROR";
          summary = `Critical rollback failure: ${verifyResult.decisionRationale.join(" ")}`;
          logger.error(`ImproveEngine: ${summary}`);
          break;

        case "BLOCKED":
        default:
          finalStatus = "BLOCKED";
          summary = `Verification blocked: ${verifyResult.decisionRationale.join(" ")}`;
          logger.warn(`ImproveEngine: ${summary}`);
          break;
      }

      return {
        runId,
        status: finalStatus,
        targetUrl: this.options.targetUrl,
        recommendation,
        findingsBefore,
        locatorResult,
        patchPlan,
        patchResult,
        validationResult: validatedPatch,
        approvalResult: { approved: true },
        transaction: txResult.transaction,
        transactionResult: txResult,
        verificationResult: verifyResult,
        decision: verifyResult.decision,
        durationMs: Date.now() - startTime,
        summary,
        recoveryInstructions: verifyResult.recoveryInstructions,
      };
    } catch (unexpectedErr: any) {
      const msg = `ImproveEngine encountered unexpected failure: ${unexpectedErr.message}`;
      logger.error(msg);
      return {
        runId,
        status: "ERROR",
        targetUrl: this.options.targetUrl,
        durationMs: Date.now() - startTime,
        summary: msg,
        error: unexpectedErr.message,
      };
    }
  }
}

/**
 * Convenience entry point for running a single-pass improve run.
 */
export async function runImprovePass(
  options: ImproveRunOptions
): Promise<ImproveRunResult> {
  const engine = new ImproveEngine(options);
  return engine.runPass();
}
