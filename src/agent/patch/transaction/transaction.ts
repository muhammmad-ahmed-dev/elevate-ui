/**
 * Phase 3D: Central Mutation Transaction Orchestrator
 *
 * Coordinates preflight checks, checkpointing, safe patch application,
 * and exact rollback with strict state-machine transition validation.
 */

import { randomUUID } from "node:crypto";
import { logger } from "../../../utils/logger.js";
import type {
  MutationTransaction,
  TransactionState,
  WorkingTreeState,
} from "../../types.js";
import type { ValidatedPatch } from "../validate/types.js";
import { runPreflightChecks } from "./preflight.js";
import { createTransactionCheckpoint } from "./checkpoint.js";
import { applyValidatedPatch } from "./apply.js";
import { rollbackTransaction } from "./rollback.js";
import type {
  MutationTransactionResult,
  TransactionCheckpointRecord,
  TransactionRollbackResult,
  TransactionRunnerOptions,
} from "./types.js";

// Valid state machine transitions
const VALID_TRANSITIONS: Record<TransactionState, TransactionState[]> = {
  CREATED: ["PREFLIGHT_PASSED", "FAILED"],
  PREFLIGHT_PASSED: ["CHECKPOINTED", "FAILED"],
  CHECKPOINTED: ["APPLYING", "ROLLING_BACK", "FAILED"],
  APPLYING: ["APPLIED", "ROLLBACK_REQUIRED", "FAILED"],
  APPLIED: ["ROLLBACK_REQUIRED", "ROLLING_BACK", "COMPLETED"],
  ROLLBACK_REQUIRED: ["ROLLING_BACK", "FAILED"],
  ROLLING_BACK: ["ROLLED_BACK", "FAILED"],
  ROLLED_BACK: ["FAILED", "COMPLETED"],
  FAILED: [],
  COMPLETED: [],
};

export class MutationTransactionRunner {
  private projectRoot: string;
  private checkpoint?: TransactionCheckpointRecord;

  constructor(options: TransactionRunnerOptions) {
    this.projectRoot = options.projectRoot;
  }

  private transition(
    transaction: MutationTransaction,
    to: TransactionState,
    reason?: string
  ): void {
    const from = transaction.transactionState ?? "CREATED";
    const allowed = VALID_TRANSITIONS[from] ?? [];

    if (!allowed.includes(to)) {
      throw new Error(
        `Invalid transaction state transition from '${from}' to '${to}'${reason ? ` (${reason})` : ""}`
      );
    }

    transaction.transactionState = to;
  }

  /**
   * Execute a full mutation transaction:
   * ValidatedPatch → Preflight → Checkpoint → git apply → Record mutation paths
   */
  public async execute(
    validatedPatch: ValidatedPatch,
    recommendationId: string,
    authorizedFiles: string[] = []
  ): Promise<MutationTransactionResult> {
    const startTime = Date.now();
    const transactionId = randomUUID();
    const startedAt = new Date().toISOString();

    const emptyWorkingTree: WorkingTreeState = {
      headCommit: "",
      branch: "",
      modifiedFiles: [],
      untrackedFiles: [],
      stagedFiles: [],
      unstagedFiles: [],
    };

    const transaction: MutationTransaction = {
      transactionId,
      recommendationId,
      startedAt,
      repositoryRoot: this.projectRoot,
      transactionState: "CREATED",
      gitHeadBefore: "",
      workingTreeStateBefore: emptyWorkingTree,
      stagedFilesBefore: [],
      unstagedFilesBefore: [],
      untrackedFilesBefore: [],
      ignoredFilesBefore: [],
      filesAuthorizedForMutation: [...authorizedFiles],
      filesCreatedByMutation: [],
      filesModifiedByMutation: [],
      patchHash: validatedPatch.originalPatchHash,
      patch: validatedPatch.rawPatch,
      verificationResults: [],
      decision: "PENDING",
    };

    logger.title(`Starting Mutation Transaction ${transactionId.slice(0, 8)}`);

    // 1. Run Preflight Checks
    const preflight = await runPreflightChecks(this.projectRoot, validatedPatch);

    if (!preflight.valid) {
      const errorMsg = `Preflight checks failed: ${preflight.errors.join("; ")}`;
      logger.error(errorMsg);
      this.transition(transaction, "FAILED", errorMsg);
      transaction.decision = "ERROR";
      transaction.error = errorMsg;
      transaction.completedAt = new Date().toISOString();

      return {
        success: false,
        transaction,
        error: errorMsg,
        filesModified: [],
        filesCreated: [],
        durationMs: Date.now() - startTime,
      };
    }

    // Record baseline state in transaction
    transaction.gitHeadBefore = preflight.headCommit;
    transaction.stagedFilesBefore = [...preflight.stagedFiles];
    transaction.unstagedFilesBefore = [...preflight.unstagedFiles];
    transaction.untrackedFilesBefore = [...preflight.untrackedFiles];
    transaction.ignoredFilesBefore = [...preflight.ignoredFiles];
    transaction.workingTreeStateBefore = {
      headCommit: preflight.headCommit,
      branch: preflight.gitStatus.branch,
      modifiedFiles: [...preflight.gitStatus.modifiedFiles],
      untrackedFiles: [...preflight.gitStatus.untrackedFiles],
      stagedFiles: [...preflight.stagedFiles],
      unstagedFiles: [...preflight.unstagedFiles],
    };

    this.transition(transaction, "PREFLIGHT_PASSED");

    // 2. Create Checkpoint
    try {
      this.checkpoint = await createTransactionCheckpoint(
        this.projectRoot,
        preflight,
        `Elevate pre-mutation checkpoint for ${recommendationId}`
      );
      this.transition(transaction, "CHECKPOINTED");
    } catch (err: any) {
      const errorMsg = `Checkpoint creation failed: ${err.message}`;
      logger.error(errorMsg);
      this.transition(transaction, "FAILED", errorMsg);
      transaction.decision = "ERROR";
      transaction.error = errorMsg;
      transaction.completedAt = new Date().toISOString();

      return {
        success: false,
        transaction,
        error: errorMsg,
        filesModified: [],
        filesCreated: [],
        durationMs: Date.now() - startTime,
      };
    }

    // 3. Apply Patch
    this.transition(transaction, "APPLYING");

    const applyResult = await applyValidatedPatch(
      this.projectRoot,
      validatedPatch,
      this.checkpoint.untrackedFilesBaseline
    );

    if (!applyResult.success) {
      const applyError = applyResult.error ?? "Unknown patch application error";
      logger.error(applyError);

      this.transition(transaction, "ROLLBACK_REQUIRED");

      // Attempt immediate exact rollback to clean any half-applied changes
      const rbResult = await rollbackTransaction(
        this.projectRoot,
        transaction,
        this.checkpoint
      );

      this.transition(transaction, "FAILED", applyError);
      transaction.decision = "ROLLBACK";
      transaction.error = applyError;
      transaction.rollbackCompletedAt = rbResult.rolledBackAt;
      transaction.rollbackSucceeded = rbResult.success;
      transaction.rollbackError = rbResult.error;
      transaction.completedAt = new Date().toISOString();

      return {
        success: false,
        transaction,
        error: applyError,
        filesModified: [],
        filesCreated: [],
        durationMs: Date.now() - startTime,
      };
    }

    // 4. Record actual modified & created files
    transaction.filesModifiedByMutation = [...applyResult.filesModified];
    transaction.filesCreatedByMutation = [...applyResult.filesCreated];
    transaction.appliedAt = new Date().toISOString();
    transaction.decision = "PENDING"; // Ready for Phase 3E verification

    this.transition(transaction, "APPLIED");
    logger.success(
      `Patch successfully applied: ${applyResult.filesModified.length} modified, ${applyResult.filesCreated.length} created.`
    );

    return {
      success: true,
      transaction,
      appliedPatch: validatedPatch.rawPatch,
      filesModified: applyResult.filesModified,
      filesCreated: applyResult.filesCreated,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Rollback an applied or checkpointed transaction.
   */
  public async rollback(
    transaction: MutationTransaction
  ): Promise<TransactionRollbackResult> {
    this.transition(transaction, "ROLLING_BACK");

    const rbResult = await rollbackTransaction(
      this.projectRoot,
      transaction,
      this.checkpoint
    );

    if (rbResult.success) {
      this.transition(transaction, "ROLLED_BACK");
      transaction.decision = "ROLLBACK";
      transaction.rollbackSucceeded = true;
      transaction.rollbackCompletedAt = rbResult.rolledBackAt;
    } else {
      this.transition(transaction, "FAILED", rbResult.error);
      transaction.decision = "ERROR";
      transaction.rollbackSucceeded = false;
      transaction.rollbackError = rbResult.error;
      transaction.error = rbResult.error;
    }

    transaction.rollbackAt = rbResult.rolledBackAt;
    transaction.completedAt = new Date().toISOString();

    return rbResult;
  }

  /**
   * Mark an applied transaction as completed after successful verification.
   */
  public complete(transaction: MutationTransaction): void {
    this.transition(transaction, "COMPLETED");
    transaction.decision = "ACCEPT";
    transaction.completedAt = new Date().toISOString();
  }

  public getCheckpoint(): TransactionCheckpointRecord | undefined {
    return this.checkpoint;
  }
}
