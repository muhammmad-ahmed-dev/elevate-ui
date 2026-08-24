/**
 * Phase 3B: Patch Provider — Type Definitions
 *
 * Defines the provider-agnostic interfaces used for patch generation.
 * This file intentionally contains NO provider-specific code.
 *
 * READ-ONLY PHASE: Nothing in this file or its consumers applies patches.
 */

import type { MutationRecommendation } from "../../analysis/types.js";
import type { PatchPlan } from "../types.js";

// ---------------------------------------------------------------------------
// Shared value types
// ---------------------------------------------------------------------------

/** Risk level reported by the patch provider for the proposed change. */
export type PatchRisk = "low" | "medium" | "high";

/**
 * A single source file included in the patch generation context.
 * Only safe, non-secret content is included.
 */
export interface SourceFileContext {
  /** Absolute path (used internally; not sent verbatim to providers). */
  absolutePath: string;
  /** Project-relative POSIX path (sent in prompts). */
  relativePath: string;
  /** Full UTF-8 source text of the file. */
  content: string;
  /**
   * Whether this is the primary mutation target.
   * Providers should focus their patch on this file.
   */
  isPrimaryTarget: boolean;
}

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

/**
 * The complete, structured input sent to a PatchProvider.
 * Every field that could contain sensitive data is explicitly excluded
 * by SourceContextBuilder before this struct is created.
 */
export interface PatchGenerationRequest {
  /** ISO-8601 timestamp for this request (used in logging). */
  requestId: string;

  /** The recommendation being addressed. */
  recommendation: MutationRecommendation;

  /** The plan constraining this patch. */
  patchPlan: PatchPlan;

  /**
   * Source files whose content the provider may reference.
   * Only files authorised by PatchPlan.allowedFiles appear here.
   */
  relevantSource: SourceFileContext[];

  /**
   * DOM/CSS evidence from Phase 2 analysis (serialised, no secrets).
   * Used to ground the prompt in real browser evidence.
   */
  relevantEvidence: Record<string, unknown>;

  /**
   * Base64-encoded screenshots when available.
   * Only included when the provider supports multimodal input.
   */
  screenshots?: string[];

  /** Provider name (for logging). Never contains API keys. */
  providerName: string;

  /** Model name (for logging). Never contains API keys. */
  modelName: string;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/**
 * The structured result returned by a PatchProvider.
 *
 * Phase 3B contract:
 * - `patch` is the raw proposed unified diff text.
 * - This result is NEVER applied to disk in Phase 3B.
 * - Phase 3C validates and applies the patch.
 */
export interface PatchGenerationResult {
  /** Whether the provider produced a usable patch proposal. */
  success: boolean;

  /**
   * Raw unified-diff text as returned by the model.
   * Present only when `success` is true.
   * Phase 3C is responsible for parsing and validating this text.
   */
  patch?: string;

  /**
   * SHA-256 hex digest of the raw patch string.
   * Used for traceability in MutationTransaction.patchHash.
   * Absent when `patch` is absent.
   */
  patchHash?: string;

  /** Provider name ("claude" | "gemini" | "mock"). */
  provider: string;

  /** Model name used (e.g. "claude-sonnet-4-6"). */
  model: string;

  /**
   * File paths the provider CLAIMS it modified.
   * ⚠️  Phase 3C must NOT trust this list —
   * the actual diff is authoritative. Included for logging only.
   */
  changedFilesClaimed: string[];

  /** Human-readable summary of the proposed change. */
  reasoningSummary: string;

  /** Expected visual outcome described by the provider. */
  expectedImpact: string;

  /** Risk tier as self-reported by the model. */
  risk: PatchRisk;

  /** Model-reported confidence (0.0–1.0). */
  confidence: number;

  /** Safe metadata for logging (no API keys, no full source). */
  rawMetadata?: Record<string, unknown>;

  /** Structured error when `success` is false. */
  error?: PatchProviderError;

  /** Wall-clock time for the provider call in milliseconds. */
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export type PatchProviderErrorKind =
  | "auth_error"
  | "rate_limit"
  | "network_error"
  | "timeout"
  | "malformed_response"
  | "invalid_schema"
  | "empty_patch"
  | "provider_unavailable"
  | "configuration_error"
  | "unknown";

export interface PatchProviderError {
  kind: PatchProviderErrorKind;
  message: string;
  /** HTTP status code, if applicable. */
  httpStatus?: number;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/**
 * Provider-agnostic interface for patch generation.
 * All concrete providers (Claude, Gemini, Mock) implement this.
 */
export interface PatchProvider {
  /** Stable identifier used for logging and configuration. */
  readonly name: string;

  /** Model name this provider instance is configured to use. */
  readonly modelName: string;

  /**
   * Generate a patch proposal for the given request.
   *
   * CONTRACT:
   * - Must NOT write to disk.
   * - Must NOT apply the patch.
   * - Must NOT commit to Git.
   * - Must return a structured PatchGenerationResult even on failure.
   * - Must never log API keys.
   */
  generatePatch(request: PatchGenerationRequest): Promise<PatchGenerationResult>;
}

// ---------------------------------------------------------------------------
// Mock scenario descriptors (used by MockPatchProvider)
// ---------------------------------------------------------------------------

export type MockPatchScenario =
  | "valid_single_file"          // A: valid single-file JSX patch
  | "valid_multi_file"           // B: multi-file patch
  | "malformed_patch"            // C: syntactically malformed patch text
  | "unauthorized_file"          // D: patch touches a file outside allowedFiles
  | "protected_file"             // E: patch attempts to modify a protected file
  | "hook_modification"          // F: patch modifies React hook logic
  | "file_deletion"              // G: patch contains a file deletion
  | "empty_response"             // H: provider returns empty/null patch
  | "provider_error"             // I: provider throws an error
  | "timeout"                    // J: simulated timeout
  | "high_risk_valid";           // High-risk but structurally valid patch
