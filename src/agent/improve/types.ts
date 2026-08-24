/**
 * Phase 3F & 3G: elevate-ui improve — Type Definitions
 *
 * Defines the request options, status codes, progress callbacks, and structured
 * result models for both single-pass and bounded multi-pass improvement engines.
 */

import type { Finding, MutationRecommendation } from "../../analysis/types.js";
import type {
  ComponentLocatorResult,
  MutationTransaction,
  PatchPlan,
} from "../types.js";
import type {
  MockPatchScenario,
  PatchGenerationResult,
} from "../patch/types.js";
import type { ValidatedPatch } from "../patch/validate/types.js";
import type { MutationTransactionResult } from "../patch/transaction/types.js";
import type {
  VerificationPipelineResult,
  VerificationDecision,
} from "../patch/verify/types.js";

// ---------------------------------------------------------------------------
// Improve Run Statuses
// ---------------------------------------------------------------------------

export type ImproveRunStatus =
  | "SUCCESS"                   // Mutation verified & accepted; committed/kept
  | "CANCELLED"                 // User rejected approval
  | "DRY_RUN"                   // Proposed diff validated, mutation stopped prior to apply
  | "NO_ACTIONABLE_IMPROVEMENT" // No recommendation meets actionable/confidence threshold
  | "AMBIGUOUS_TARGET"          // ComponentLocator could not map recommendation unambiguously
  | "NO_VALID_PATCH"            // PatchProvider failed or produced empty diff
  | "PATCH_REJECTED"            // PatchValidator rejected diff (path, scope, or AST violations)
  | "MUTATION_FAILED"           // MutationTransactionRunner preflight or apply failed
  | "VERIFICATION_FAILED"       // Hard gates or regression checks failed
  | "ROLLED_BACK"               // DecisionGate triggered safe transaction rollback
  | "ERROR"                     // Critical error (e.g. rollback failed, unexpected crash)
  | "BLOCKED";                  // Safety policy prevented execution

// ---------------------------------------------------------------------------
// Approval Model
// ---------------------------------------------------------------------------

export interface ApprovalPromptDetails {
  passNumber?: number;
  totalPasses?: number;
  recommendation: MutationRecommendation;
  locatorResult: ComponentLocatorResult;
  patchPlan: PatchPlan;
  patchResult: PatchGenerationResult;
  validatedPatch: ValidatedPatch;
}

export type ApprovalPromptFunction = (
  details: ApprovalPromptDetails
) => Promise<boolean>;

// ---------------------------------------------------------------------------
// Single-Pass Engine Options
// ---------------------------------------------------------------------------

export interface ImproveRunOptions {
  /** Target application URL to audit and verify (e.g. http://localhost:3000). */
  targetUrl: string;

  /** Absolute path to the repository / project root. */
  projectRoot: string;

  /**
   * If true, generates and validates the patch without mutating files or Git state.
   * Default: false.
   */
  dryRun?: boolean;

  /**
   * If true, bypasses interactive human approval for autonomous execution.
   * Safety gates (AST, protected paths, build, typecheck, verify) remain strictly enforced.
   * Default: false.
   */
  autoApprove?: boolean;

  /** Vision evaluation provider override ("gemini" | "claude" | "mock"). */
  visionProvider?: string;

  /** Vision evaluation model name override. */
  visionModel?: string;

  /** Skip multimodal vision check during initial audit and verify. */
  skipVision?: boolean;

  /** Patch provider override ("claude" | "gemini" | "mock"). */
  patchProvider?: string;

  /** Patch model name override. */
  patchModel?: string;

  /** Mock scenario descriptor when patchProvider is "mock". */
  mockPatchScenario?: MockPatchScenario;

  /** Maximum files allowed to touch in a single patch. Default: 2. */
  maxFiles?: number;

  /** Maximum lines changed allowed in a single patch. Default: 150. */
  maxLines?: number;

  /** Request timeout in ms for external provider calls. Default: 60000. */
  timeoutMs?: number;

  /** Dev server startup command (e.g. "npm run dev"). */
  devServerCmd?: string;

  /** Typecheck verification command (e.g. "npm run typecheck" or "tsc --noEmit"). */
  typecheckCmd?: string;

  /** Build verification command (e.g. "npm run build"). */
  buildCmd?: string;

  /** Whether the dev server is already running and should not be spawned. */
  serverAlreadyRunning?: boolean;

  /** Custom interactive approval prompt handler (useful for testing). */
  approvalPrompt?: ApprovalPromptFunction;

  /** Progress update callback for CLI step reporting. */
  onProgress?: (step: number, totalSteps: number, message: string) => void;

  /** Allow neutral visual verification result without requiring positive improvement. */
  allowNeutralVisualResult?: boolean;

  /** Custom directory to save screenshots during perception. */
  screenshotDir?: string;
}

// ---------------------------------------------------------------------------
// Single-Pass Result Model
// ---------------------------------------------------------------------------

export interface ImproveRunResult {
  /** Unique run identifier. */
  runId: string;

  /** Final execution status. */
  status: ImproveRunStatus;

  /** Target URL inspected. */
  targetUrl: string;

  /** Recommendation selected for improvement (if selected). */
  recommendation?: MutationRecommendation;

  /** Initial audit findings baseline before mutation. */
  findingsBefore?: Finding[];

  /** ComponentLocator mapping result. */
  locatorResult?: ComponentLocatorResult;

  /** PatchPlan created for the mutation. */
  patchPlan?: PatchPlan;

  /** Raw patch generation result from PatchProvider. */
  patchResult?: PatchGenerationResult;

  /** Validated patch produced by Phase 3C validator. */
  validationResult?: ValidatedPatch;

  /** Human / auto-approval outcome. */
  approvalResult?: {
    approved: boolean;
    reason?: string;
  };

  /** MutationTransaction record. */
  transaction?: MutationTransaction;

  /** Transaction execution result. */
  transactionResult?: MutationTransactionResult;

  /** VerificationPipeline result. */
  verificationResult?: VerificationPipelineResult;

  /** DecisionGate outcome (ACCEPT | ROLLBACK | ERROR | BLOCKED). */
  decision?: VerificationDecision;

  /** Total elapsed time in milliseconds. */
  durationMs: number;

  /** Human-readable summary of the run outcome. */
  summary: string;

  /** Structured error message if failed. */
  error?: string;

  /** Recovery instructions if transaction rollback failed critically. */
  recoveryInstructions?: string[];
}

// ---------------------------------------------------------------------------
// Phase 3G: Multi-Pass Models & Types
// ---------------------------------------------------------------------------

export type MultiPassStoppingReason =
  | "MAX_PASSES_REACHED"           // Budget of passes reached
  | "NO_ACTIONABLE_IMPROVEMENTS"    // No viable unattempted recommendations remain
  | "REPEATED_RECOMMENDATION"       // Analyzer proposed duplicate recommendation/fingerprint
  | "NO_NET_NEW_PROGRESS"          // Accepted pass failed to demonstrate measurable improvement
  | "ROLLBACK"                     // Pass rolled back (MVP stopping policy)
  | "USER_CANCELLED"               // User aborted interactive prompt
  | "SAFETY_ERROR"                 // Critical safety error (e.g. rollback failed or crash)
  | "BLOCKED"                      // Patch planner or policy blocked execution
  | "DRY_RUN_COMPLETED";           // Dry run simulation finished without mutation

export type RecommendationStatus =
  | "AVAILABLE"
  | "ATTEMPTED"
  | "ACCEPTED"
  | "ROLLED_BACK"
  | "REJECTED"
  | "SKIPPED"
  | "SUPERSEDED";

export interface RecommendationHistoryItem {
  recommendationId: string;
  fingerprint: string;
  problem: string;
  proposedImprovement: string;
  affectedSelector?: string;
  affectedComponents?: string[];
  sourceFindingIds: string[];
  passNumber: number;
  status: RecommendationStatus;
  reasonSkippedOrRejected?: string;
  transactionId?: string;
  decision?: VerificationDecision;
}

export interface ProgressResult {
  improved: boolean;
  regressions: number;
  resolved: number;
  remaining: number;
  reason: string;
}

export interface ImprovePassResult {
  passNumber: number;
  runId: string;
  recommendation: MutationRecommendation;
  locatorResult?: ComponentLocatorResult;
  patchPlan?: PatchPlan;
  patchResult?: PatchGenerationResult;
  validationResult?: ValidatedPatch;
  approvalResult?: {
    approved: boolean;
    reason?: string;
  };
  transaction?: MutationTransaction;
  transactionResult?: MutationTransactionResult;
  verificationResult?: VerificationPipelineResult;
  decision?: VerificationDecision;
  status: ImproveRunStatus;
  targetedImprovement: boolean;
  newRegressions: number;
  progress?: ProgressResult;
  durationMs: number;
  summary: string;
  error?: string;
}

export interface MultiPassImproveOptions extends ImproveRunOptions {
  /** Maximum number of passes to execute (1-10). Default: 1. */
  maxPasses?: number;

  /** Maximum safety ceiling for allowed passes. Default: 10. */
  maxAllowedPasses?: number;

  /** Global run timeout across all passes in ms. Default: 300000 (5 mins). */
  globalTimeoutMs?: number;

  /** Minimum recommendation confidence to attempt (0.0–1.0). Default: 0.5. */
  minConfidence?: number;
}

export interface MultiPassImproveResult {
  runId: string;
  targetUrl: string;
  maxPasses: number;
  passesExecuted: number;
  passesAccepted: number;
  passesRolledBack: number;
  recommendationsConsidered: number;
  recommendationsSkipped: number;
  stoppingReason: MultiPassStoppingReason;
  baselineFindings: Finding[];
  finalFindings: Finding[];
  passResults: ImprovePassResult[];
  recommendationHistory: RecommendationHistoryItem[];
  finalStatus: ImproveRunStatus;
  durationMs: number;
  summary: string;
  recoveryInstructions?: string[];
}
