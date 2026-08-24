/**
 * Phase 3D: Exact Rollback Engine
 *
 * Implements strict, non-destructive rollback targeting ONLY files Elevate touched.
 *
 * INVARIANTS:
 * 1. NEVER calls blanket destructive cleanup commands.
 * 2. Never deletes pre-existing untracked user files.
 * 3. Restores user staged index using `git stash pop --index`.
 * 4. Surfaces rollback failures as high-severity critical safety errors.
 */

import { unlink, stat } from "node:fs/promises";
import { relative } from "node:path";
import { logger } from "../../../utils/logger.js";
import { execGitInDir } from "./preflight.js";
import type { MutationTransaction } from "../../types.js";
import type { TransactionCheckpointRecord, TransactionRollbackResult } from "./types.js";

export async function rollbackTransaction(
  projectRoot: string,
  transaction: MutationTransaction,
  checkpoint?: TransactionCheckpointRecord
): Promise<TransactionRollbackResult> {
  const now = new Date().toISOString();
  const restoredFiles: string[] = [];
  const deletedFiles: string[] = [];
  let stagedPreserved = false;
  let criticalError = false;

  logger.warn(`Executing exact rollback for transaction ${transaction.transactionId}...`);

  try {
    // 1. Revert modified tracked files touched by Elevate
    const baselineUntrackedSet = new Set(
      checkpoint?.untrackedFilesBaseline ?? transaction.untrackedFilesBefore ?? []
    );

    for (const absFile of transaction.filesModifiedByMutation) {
      const relPath = relative(projectRoot, absFile).replace(/\\/g, "/");
      try {
        await execGitInDir(projectRoot, ["checkout", "HEAD", "--", relPath]);
        restoredFiles.push(absFile);
      } catch (err: any) {
        logger.error(`Failed to checkout modified file '${relPath}': ${err.message}`);
        // Fallback attempt with git restore
        try {
          await execGitInDir(projectRoot, ["restore", "--staged", "--worktree", relPath]);
          restoredFiles.push(absFile);
        } catch (restoreErr: any) {
          throw new Error(
            `CRITICAL: Could not revert modified file '${relPath}': ${restoreErr.message}`
          );
        }
      }
    }

    // 2. Delete files newly created by Elevate
    for (const absFile of transaction.filesCreatedByMutation) {
      const relPath = relative(projectRoot, absFile).replace(/\\/g, "/");

      // Double check: Never delete a pre-existing untracked file
      if (baselineUntrackedSet.has(relPath)) {
        logger.warn(
          `Skipping deletion of '${relPath}' because it was present in pre-mutation untracked baseline.`
        );
        continue;
      }

      try {
        const fileStat = await stat(absFile);
        if (fileStat.isFile()) {
          await unlink(absFile);
          deletedFiles.push(absFile);
        }
      } catch {
        // File may already not exist
      }
    }

    // 3. Restore user's stashed uncommitted modifications if stashed
    const wasStashed = checkpoint?.stashed ?? false;
    if (wasStashed) {
      logger.info("Restoring user pre-mutation state from git stash...");

      // Try stash pop with --index to preserve exact staging state
      try {
        await execGitInDir(projectRoot, ["stash", "pop", "--index"]);
        stagedPreserved = true;
        logger.success("User staged and unstaged state cleanly restored from stash.");
      } catch (indexErr: any) {
        logger.warn(
          `Stash pop --index failed (${indexErr.message}). Attempting fallback standard stash pop...`
        );
        try {
          await execGitInDir(projectRoot, ["stash", "pop"]);
          logger.warn("Standard stash pop succeeded (index may need manual re-staging).");
        } catch (popErr: any) {
          logger.error(`CRITICAL: Stash pop completely failed: ${popErr.message}`);
          criticalError = true;
          throw new Error(
            `CRITICAL SAFETY ERROR: Failed to restore user stash (${popErr.message}). User uncommitted work is safely preserved in Git stash history (run 'git stash list').`
          );
        }
      }
    } else {
      stagedPreserved = true;
    }

    logger.success(`Exact rollback completed for transaction ${transaction.transactionId}.`);

    return {
      success: true,
      transactionId: transaction.transactionId,
      rolledBackAt: now,
      restoredFiles,
      deletedFiles,
      stagedPreserved,
    };
  } catch (err: any) {
    const errorMsg = `Rollback failure: ${err.message}`;
    logger.error(errorMsg);

    return {
      success: false,
      transactionId: transaction.transactionId,
      rolledBackAt: now,
      restoredFiles,
      deletedFiles,
      stagedPreserved,
      error: errorMsg,
      criticalError: criticalError || true,
    };
  }
}
