/**
 * Phase 3D: Transaction Checkpoint
 *
 * Creates a transaction checkpoint capturing HEAD, index state, untracked baseline,
 * and working-tree modifications. Reuses Git stash infrastructure to preserve user state.
 */

import { logger } from "../../../utils/logger.js";
import { execGitInDir } from "./preflight.js";
import type { PreflightCheckResult, TransactionCheckpointRecord } from "./types.js";

export async function createTransactionCheckpoint(
  projectRoot: string,
  preflight: PreflightCheckResult,
  _description: string = "Elevate pre-mutation checkpoint"
): Promise<TransactionCheckpointRecord> {
  const checkpointId = `tx-checkpoint-${Date.now()}`;
  let stashed = false;
  let stashId: string | undefined;

  const isDirty =
    preflight.stagedFiles.length > 0 ||
    preflight.unstagedFiles.length > 0 ||
    preflight.untrackedFiles.length > 0;

  if (isDirty) {
    logger.warn("Working tree has uncommitted user modifications. Creating git stash checkpoint...");
    try {
      const stashMsg = `elevate-tx-${checkpointId}`;
      await execGitInDir(projectRoot, ["stash", "push", "-u", "-m", stashMsg]);
      stashed = true;
      stashId = stashMsg;
    } catch (err: any) {
      logger.error(`Failed to create stash checkpoint: ${err.message}`);
      throw new Error(`Failed to create stash checkpoint: ${err.message}`);
    }
  }

  return {
    checkpointId,
    createdAt: new Date().toISOString(),
    headCommit: preflight.headCommit,
    stashed,
    stashId,
    stagedFiles: [...preflight.stagedFiles],
    unstagedFiles: [...preflight.unstagedFiles],
    untrackedFilesBaseline: [...preflight.untrackedFiles],
    ignoredFilesBaseline: [...preflight.ignoredFiles],
    preExistingStashCount: preflight.preExistingStashCount,
  };
}
