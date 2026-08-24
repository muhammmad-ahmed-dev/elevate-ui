/**
 * Phase 3: Mutation Engine — Central Type Definitions
 *
 * This module defines all shared types for the mutation transaction lifecycle:
 *   ComponentLocatorResult → PatchPlan → (Phase 3B+) patch generation/application
 *
 * No application code is modified by this file.
 */

import type { MutationRecommendation } from "../analysis/types.js";

// ---------------------------------------------------------------------------
// Component / File Locator
// ---------------------------------------------------------------------------

/** Confidence tier for a component-to-file mapping. */
export type LocatorConfidence = "high" | "medium" | "low" | "ambiguous";

/** A single candidate source file for a recommendation. */
export interface LocatorCandidate {
  /** Absolute path to the source file. */
  absolutePath: string;
  /** Relative path from project root (for display). */
  relativePath: string;
  /** Why this file was selected. */
  evidence: string[];
  /** How confident we are that this is the correct file (0.0–1.0). */
  confidence: number;
  /** Selectors in the recommendation that matched patterns in this file. */
  matchedSelectors: string[];
  /** React component names found in the file. */
  componentNames: string[];
  /** Tailwind class tokens in the file that overlap with the recommendation. */
  matchedTailwindClasses: string[];
  /** Whether this file is a .tsx/.jsx React component file. */
  isReactComponent: boolean;
}

/** Result returned by ComponentLocator for a single recommendation. */
export interface ComponentLocatorResult {
  /** The recommendation this result maps. */
  recommendationId: string;
  /** Overall confidence for the best candidate. */
  confidence: LocatorConfidence;
  /** Ordered list of candidate source files (best-first). */
  candidates: LocatorCandidate[];
  /** Best single candidate, or undefined if mapping is ambiguous/failed. */
  primaryCandidate?: LocatorCandidate;
  /** True when the locator cannot confidently identify a target. */
  isAmbiguous: boolean;
  /** Human-readable summary of why mapping succeeded or failed. */
  summary: string;
}

// ---------------------------------------------------------------------------
// Protected Path Configuration
// ---------------------------------------------------------------------------

/**
 * Defines paths and patterns that must never be mutated by Elevate.
 * These are hard-coded safety rails plus optional user overrides.
 */
export interface ProtectedPathConfig {
  /**
   * Exact relative file paths that are always protected (e.g. "package.json").
   */
  exactPaths: string[];
  /**
   * Glob-style prefix patterns.  A file is protected when its relative path
   * starts with any of these strings (e.g. ".env", "src/app/api/").
   */
  prefixPatterns: string[];
  /**
   * Substring patterns.  A file is protected when its relative path
   * contains any of these substrings (e.g. "auth", ".lock").
   */
  substringPatterns: string[];
}

// ---------------------------------------------------------------------------
// Patch Plan
// ---------------------------------------------------------------------------

/** A single mutation restriction entry with a human-readable reason. */
export interface PatchConstraint {
  description: string;
}

/**
 * Structured plan produced BEFORE asking an LLM to generate a patch.
 * The plan constrains and documents the intended mutation scope.
 */
export interface PatchPlan {
  /** Stable unique ID for this plan. */
  id: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** The recommendation that drove this plan. */
  recommendation: MutationRecommendation;
  /** Absolute paths the patch is permitted to modify. */
  allowedFiles: string[];
  /** React component names the patch is permitted to touch. */
  allowedComponents: string[];
  /** CSS/JSX selectors the patch is expected to affect. */
  allowedSelectors: string[];
  /** What the mutation is expected to fix (plain English). */
  expectedVisualImprovement: string;
  /** Areas explicitly out-of-scope for this patch. */
  prohibitedAreas: PatchConstraint[];
  /**
   * Upper bound on how many files may be touched.
   * Patch validation rejects plans that exceed this.
   */
  maxFilesAllowed: number;
  /**
   * Upper bound on total line changes (additions + deletions).
   * A soft limit used to flag unexpectedly large diffs.
   */
  maxLinesChanged: number;
  /** What must pass after the patch is applied. */
  verificationRequirements: string[];
  /** Absolute paths the patch must NOT touch. */
  protectedPaths: string[];
}

// ---------------------------------------------------------------------------
// Mutation Transaction Model
// ---------------------------------------------------------------------------

export type MutationDecision = "ACCEPT" | "REJECT" | "ROLLBACK" | "ERROR" | "PENDING";

/** Git working-tree state captured at transaction start. */
export interface WorkingTreeState {
  headCommit: string;
  branch: string;
  modifiedFiles: string[];
  untrackedFiles: string[];
  stagedFiles: string[];
  unstagedFiles: string[];
}

/** Verification gate result (re-used from safety/types.ts pattern). */
export interface MutationVerificationGate {
  name: string;
  passed: boolean;
  output: string;
  durationMs: number;
  error?: string;
}

/** Summary of the re-audit comparison (before vs after). */
export interface ReAuditComparison {
  targetedIssueImproved: boolean;
  newCriticalFindings: number;
  newSeriousFindings: number;
  hardGatesPassed: boolean;
  visualRegressionDetected: boolean;
  beforeFindingCount: number;
  afterFindingCount: number;
}

export type TransactionState =
  | "CREATED"
  | "PREFLIGHT_PASSED"
  | "CHECKPOINTED"
  | "APPLYING"
  | "APPLIED"
  | "ROLLBACK_REQUIRED"
  | "ROLLING_BACK"
  | "ROLLED_BACK"
  | "FAILED"
  | "COMPLETED";

/**
 * The central audit trail for a single mutation attempt.
 * Created at the start of every `improve` pass and updated throughout.
 */
export interface MutationTransaction {
  /** Stable UUID for this transaction. */
  transactionId: string;
  /** The MutationRecommendation.id driving this transaction. */
  recommendationId: string;
  /** ISO-8601 start timestamp. */
  startedAt: string;
  /** Absolute path to the project root being mutated. */
  repositoryRoot: string;

  // Transaction state machine
  transactionState?: TransactionState;

  // Git state captured BEFORE any mutation
  gitHeadBefore: string;
  workingTreeStateBefore: WorkingTreeState;
  stagedFilesBefore: string[];
  unstagedFilesBefore: string[];
  untrackedFilesBefore: string[];
  ignoredFilesBefore?: string[];

  // Mutation scope authorisation
  /** Absolute paths the transaction is permitted to touch. */
  filesAuthorizedForMutation: string[];
  /** Absolute paths that were actually created by Elevate. Tracked for exact rollback. */
  filesCreatedByMutation: string[];
  /** Absolute paths of files that Elevate modified. Tracked for exact rollback. */
  filesModifiedByMutation: string[];

  // Patch artefacts
  /** SHA-256 hex of the raw patch string (for integrity). */
  patchHash?: string;
  /** The unified-diff string generated by the patch provider. */
  patch?: string;

  // Timestamps
  appliedAt?: string;
  rollbackAt?: string;

  // Verification
  verificationResults: MutationVerificationGate[];

  // Decision & Errors
  decision: MutationDecision;
  error?: string;
  /** ISO-8601 timestamp when rollback completed (if any). */
  rollbackCompletedAt?: string;
  /** Whether rollback succeeded (if attempted). */
  rollbackSucceeded?: boolean;
  rollbackError?: string;

  // Completion
  completedAt?: string;
}
