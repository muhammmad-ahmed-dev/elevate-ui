/**
 * Phase 4E: Agent Director Workflow — Type Definitions & State Contracts
 *
 * Defines the request parameters, lifecycle statuses, verification results,
 * and structured outcome models for the user-facing Agent Director workflow.
 */

import type {
  InputMode,
  DesignPlanResult,
  ReferenceImageInput,
} from "../design/types.js";
import type {
  AgentTask,
  AgentRunResult,
  AgentErrorCode,
} from "../adapters/types.js";
import type { Finding } from "../../analysis/types.js";

// ---------------------------------------------------------------------------
// 1. Workflow Execution Statuses
// ---------------------------------------------------------------------------

export type WorkflowStatus =
  | "PLANNING"                       // Intent analysis & design plan synthesis in progress
  | "READY_FOR_AGENT"               // Design plan created, pending user approval or agent launch
  | "AGENT_RUNNING"                 // Coding agent (Antigravity/Mock) executing task in workspace
  | "AGENT_COMPLETED"               // Coding agent finished execution, inspecting changes
  | "AGENT_FAILED"                  // Coding agent process exited with non-zero code or crash
  | "AGENT_TIMEOUT"                 // Coding agent exceeded timeout threshold
  | "AGENT_AUTHENTICATION_REQUIRED" // Coding agent requires CLI session authentication (`agy auth`)
  | "VERIFICATION_RUNNING"          // Multi-viewport browser & deterministic verification running
  | "SUCCESS"                       // Verified and accepted against acceptance criteria
  | "ROLLBACK"                      // Verification or decision gate failed, changes rolled back
  | "CANCELLED"                     // User rejected approval prompt
  | "BLOCKED"                       // Security policy or safety violation prevented execution
  | "DRY_RUN"                       // Plan and task context generated; stopped before mutating
  | "ERROR";                        // Unexpected internal error

// ---------------------------------------------------------------------------
// 2. Acceptance Criteria Evaluation
// ---------------------------------------------------------------------------

export interface AcceptanceCriterionEvaluation {
  id: string;
  category: string;
  description: string;
  passed: boolean;
  reason?: string;
  verificationMethod: string;
}

// ---------------------------------------------------------------------------
// 3. Verification Result
// ---------------------------------------------------------------------------

export interface WorkflowVerificationResult {
  hardGatesPassed: boolean;
  typecheckPassed: boolean;
  buildPassed: boolean;
  runtimePassed: boolean;
  viewportsCaptured: number;
  totalFindings: number;
  criticalFindings: number;
  seriousFindings: number;
  touchTargetFailures: number;
  overflowFailures: number;
  brokenImageFailures: number;
  contrastFailures: number;
  headingFailures: number;
  acceptanceCriteriaEvaluations: AcceptanceCriterionEvaluation[];
  findings: Finding[];
  durationMs: number;
  previewUrl?: string;
}

// ---------------------------------------------------------------------------
// 4. Workflow Run Options
// ---------------------------------------------------------------------------

export interface WorkflowOptions {
  /** User goal or natural language design description (e.g. "make me a dark portfolio"). */
  prompt?: string;

  /** Optional reference screenshot paths, URLs, or base64 descriptors. */
  references?: (string | ReferenceImageInput)[];

  /** Optional live URL of an existing website to audit/improve. */
  existingUrl?: string;

  /** Optional path to an existing local repository. */
  existingRepoPath?: string;

  /** Explicit mode override ("BUILD_FROM_SCRATCH" | "REFERENCE_DRIVEN" | "EXISTING_SITE" | "HYBRID"). */
  targetMode?: InputMode;

  /**
   * Destination workspace root for new applications.
   * If not provided in BUILD_FROM_SCRATCH mode, an isolated disposable workspace is provisioned.
   */
  workspaceRoot?: string;

  /**
   * Target coding agent adapter name (default: "antigravity").
   * Supported: "antigravity", "mock".
   */
  agentName?: string;

  /**
   * Requested model name for coding agent (default: "gemini-3.7-flash-high" for Antigravity).
   */
  agentModel?: string;

  /** Reasoning/thinking effort level (default: "high"). */
  effort?: "low" | "medium" | "high";

  /**
   * If true, generates the complete design plan and agent context, then stops without
   * spawning coding agents or mutating files.
   * Default: false.
   */
  dryRun?: boolean;

  /**
   * If true, bypasses terminal interactive user approval.
   * Safety checks and workspace validation remain strictly enforced.
   * Default: false.
   */
  autoApprove?: boolean;

  /** Maximum execution duration for the coding agent in milliseconds (default: 120,000ms). */
  timeoutMs?: number;

  /** Optional custom technical or design constraints. */
  customConstraints?: string[];

  /** Command used to run TypeScript checks in the workspace (default: auto-detected). */
  typecheckCmd?: string;

  /** Command used to run production build in the workspace (default: auto-detected). */
  buildCmd?: string;

  /** Command used to run dev server in the workspace (default: auto-detected). */
  devServerCmd?: string;

  /** Skip multimodal vision check during verification. */
  skipVision?: boolean;
}

// ---------------------------------------------------------------------------
// 5. Workflow Result Model
// ---------------------------------------------------------------------------

export interface WorkflowResult {
  /** Unique workflow execution identifier. */
  workflowId: string;

  /** Resolved planning mode. */
  mode: InputMode;

  /** Final execution status. */
  status: WorkflowStatus;

  /** Generated design plan blueprint from Phase 4D. */
  designPlan: DesignPlanResult;

  /** Generated agent task passed to CodingAgentAdapter (if launched). */
  agentTask?: AgentTask;

  /** Execution result returned by the coding agent adapter. */
  agentRunResult?: AgentRunResult;

  /** Visual and deterministic verification findings (if verification ran). */
  verification?: WorkflowVerificationResult;

  /** Absolute path to the destination workspace where code was created/modified. */
  workspaceRoot: string;

  /** Total elapsed wall-clock time in milliseconds. */
  durationMs: number;

  /** Human-readable executive summary of the workflow outcome. */
  summary: string;

  /** Structured error message if execution failed. */
  error?: string;

  /** Specific error classification code (if applicable). */
  errorCode?: AgentErrorCode | string;

  /** Path to generated HTML/JSON report (if generated). */
  reportPath?: string;
}
