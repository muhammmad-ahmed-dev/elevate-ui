/**
 * Phase 3E: Verification Gates + Regression Analysis + Decision Gate
 *
 * Type definitions for the full verification pipeline.
 */

import type { MutationTransaction } from "../../types.js";
import type { Finding } from "../../../analysis/types.js";
import type { MutationRecommendation } from "../../../analysis/types.js";
import type { MultiViewportResult } from "../../../browser/types.js";
import type { TransactionRollbackResult } from "../transaction/types.js";

// ---------------------------------------------------------------------------
// Decision outcome
// ---------------------------------------------------------------------------

export type VerificationDecision = "ACCEPT" | "ROLLBACK" | "ERROR" | "BLOCKED";

// ---------------------------------------------------------------------------
// Individual gate result
// ---------------------------------------------------------------------------

export interface VerificationGateResult {
  name: string;
  passed: boolean;
  /** Raw combined stdout + stderr (truncated to avoid logging secrets). */
  output: string;
  error?: string;
  exitCode?: number;
  durationMs: number;
  /** Whether this gate is mandatory (failure → hard block). */
  mandatory: boolean;
}

// ---------------------------------------------------------------------------
// Runtime handle
// ---------------------------------------------------------------------------

/** A reference to a running child process that Phase 3E started. */
export interface RuntimeHandle {
  pid: number;
  /** Sends SIGTERM (or platform equivalent) then waits. */
  shutdown(): Promise<void>;
}

export interface RuntimeStartResult {
  success: boolean;
  handle?: RuntimeHandle;
  url: string;
  error?: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Browser verification
// ---------------------------------------------------------------------------

export interface BrowserVerificationResult {
  success: boolean;
  captureResult?: MultiViewportResult;
  viewportsCaptured: number;
  screenshotPaths: string[];
  errors: string[];
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Deterministic comparison
// ---------------------------------------------------------------------------

/** A single finding difference entry. */
export interface FindingDelta {
  type: "new" | "resolved" | "unchanged";
  finding: Finding;
}

export interface DeterministicComparisonResult {
  beforeFindings: Finding[];
  afterFindings: Finding[];
  newFindings: Finding[];
  resolvedFindings: Finding[];
  unchangedFindings: Finding[];
  newCriticalCount: number;
  newSeriousCount: number;
  newAccessibilityCount: number;
  newOverflowCount: number;
  newBrokenImageCount: number;
  newTouchTargetCount: number;
}

// ---------------------------------------------------------------------------
// Visual re-analysis
// ---------------------------------------------------------------------------

export interface VisualReanalysisResult {
  available: boolean;
  providerName?: string;
  findings: Finding[];
  errors: string[];
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Targeted issue comparison
// ---------------------------------------------------------------------------

export interface TargetedIssueComparison {
  recommendationId: string;
  /** Did the specific issue being targeted get better? */
  targetedIssueImproved: boolean;
  /** Did the issue get demonstrably worse? */
  targetedIssueDegraded: boolean;
  /** Evidence before */
  evidenceBefore: Record<string, unknown>;
  /** Evidence after */
  evidenceAfter: Record<string, unknown>;
  rationale: string;
}

// ---------------------------------------------------------------------------
// Regression summary
// ---------------------------------------------------------------------------

export interface RegressionSummary {
  targetedIssueImproved: boolean;
  targetedIssueDegraded: boolean;
  newCriticalFindings: number;
  newSeriousFindings: number;
  newAccessibilityFindings: number;
  newOverflowFindings: number;
  newBrokenImageFindings: number;
  newTouchTargetFindings: number;
  newRuntimeFailures: boolean;
  visualRegressionDetected: boolean;
  hardGatesPassed: boolean;
  /** Any overflows or build failures introduced */
  anyHardRegression: boolean;
}

// ---------------------------------------------------------------------------
// Before / After comparison
// ---------------------------------------------------------------------------

export interface BeforeAfterComparison {
  transactionId: string;
  recommendationId: string;
  /** Findings captured BEFORE mutation */
  findingsBefore: Finding[];
  /** Findings captured AFTER mutation */
  findingsAfter: Finding[];
  deterministicComparison: DeterministicComparisonResult;
  targetedIssueComparison: TargetedIssueComparison;
  visualReanalysis: VisualReanalysisResult;
  hardGates: VerificationGateResult[];
  browserCheck: BrowserVerificationResult;
  regression: RegressionSummary;
}

// ---------------------------------------------------------------------------
// Decision gate result
// ---------------------------------------------------------------------------

export interface DecisionGateResult {
  decision: VerificationDecision;
  rationale: string[];
  /** Present when decision = ROLLBACK | ERROR and rollback was attempted. */
  rollbackResult?: TransactionRollbackResult;
  /**
   * Recovery instructions for the user when criticalError is true.
   * Only populated when rollback fails.
   */
  recoveryInstructions?: string[];
  transaction: MutationTransaction;
}

// ---------------------------------------------------------------------------
// Pipeline options
// ---------------------------------------------------------------------------

export interface VerificationPipelineOptions {
  /** Absolute path to the target project root. */
  projectRoot: string;
  /** URL the dev server will serve (e.g. http://localhost:3000). */
  targetUrl: string;
  /** Override typecheck command (defaults to `npx tsc --noEmit`). */
  typecheckCmd?: string;
  /** Override build command (defaults to `npm run build` if present). */
  buildCmd?: string;
  /** Dev server start command (e.g. `npm run dev`). */
  devServerCmd?: string;
  /**
   * If true, skip the dev-server startup + browser + runtime gates.
   * Useful when the server is already running externally.
   */
  serverAlreadyRunning?: boolean;
  /** Screenshot output directory. */
  screenshotDir?: string;
  /** Startup timeout in ms (default: 30 000). */
  startupTimeoutMs?: number;
  /** Route navigation timeout in ms (default: 15 000). */
  navigationTimeoutMs?: number;
  /** If true, a "neutral" visual result (no change) counts as ACCEPT. */
  allowNeutralVisualResult?: boolean;
  /** Enable/disable visual provider re-analysis (default: true). */
  enableVisualReanalysis?: boolean;
  /** Vision provider name ("gemini" | "claude" | "mock"). */
  visionProviderName?: string;
  /** API key for vision provider. */
  visionApiKey?: string;
}

// ---------------------------------------------------------------------------
// Pipeline result
// ---------------------------------------------------------------------------

export interface VerificationPipelineResult {
  transactionId: string;
  decision: VerificationDecision;
  decisionRationale: string[];
  comparison: BeforeAfterComparison;
  rollbackResult?: TransactionRollbackResult;
  recoveryInstructions?: string[];
  durationMs: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Options passed to regression analysis
// ---------------------------------------------------------------------------

export interface RegressionAnalysisOptions {
  recommendation?: MutationRecommendation;
  allowNeutralVisualResult?: boolean;
}
