/**
 * Phase 3D: Mutation Transaction — Type Definitions
 *
 * Defines the state machine, checkpoint models, patch application results,
 * and rollback descriptors for safe code mutation.
 */

import type { MutationTransaction, TransactionState } from "../../types.js";
import type { GitStatus } from "../../../safety/types.js";

export type { TransactionState };

/** Preflight check result before attempting mutation. */
export interface PreflightCheckResult {
  valid: boolean;
  errors: string[];
  gitStatus: GitStatus;
  headCommit: string;
  stagedFiles: string[];
  unstagedFiles: string[];
  untrackedFiles: string[];
  ignoredFiles: string[];
  preExistingStashCount: number;
  targetFileHashes: Record<string, string>;
}

/** Checkpoint capturing all state required for exact rollback. */
export interface TransactionCheckpointRecord {
  checkpointId: string;
  createdAt: string;
  headCommit: string;
  stashed: boolean;
  stashId?: string;
  stagedFiles: string[];
  unstagedFiles: string[];
  untrackedFilesBaseline: string[];
  ignoredFilesBaseline: string[];
  preExistingStashCount: number;
}

/** Result of dry-run or real patch application. */
export interface PatchApplyResult {
  success: boolean;
  filesModified: string[]; // Absolute paths
  filesCreated: string[];  // Absolute paths
  error?: string;
  output?: string;
}

/** Detailed result of a rollback operation. */
export interface TransactionRollbackResult {
  success: boolean;
  transactionId: string;
  rolledBackAt: string;
  restoredFiles: string[];
  deletedFiles: string[];
  stagedPreserved: boolean;
  error?: string;
  criticalError?: boolean;
}

/** Overall output of executing a mutation transaction. */
export interface MutationTransactionResult {
  success: boolean;
  transaction: MutationTransaction;
  error?: string;
  appliedPatch?: string;
  filesModified: string[];
  filesCreated: string[];
  durationMs: number;
}

/** Options for configuring the MutationTransactionRunner. */
export interface TransactionRunnerOptions {
  /** Absolute path to project root. */
  projectRoot: string;
  /** Optional custom timeout in ms for git commands. */
  timeoutMs?: number;
}
