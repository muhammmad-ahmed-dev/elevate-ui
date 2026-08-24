/**
 * Phase 3B: Patch Response Validation
 *
 * Validates the STRUCTURE of the model's JSON response.
 *
 * Phase 3B boundary:
 * - This module validates the JSON schema and field types only.
 * - It does NOT parse the unified diff syntax.
 * - It does NOT check which files are touched.
 * - It does NOT apply the patch.
 * Those responsibilities belong to Phase 3C.
 */

import type { PatchRisk, PatchProviderError, PatchProviderErrorKind } from "./types.js";

// ---------------------------------------------------------------------------
// Expected response shape from the model
// ---------------------------------------------------------------------------

export interface RawPatchModelResponse {
  patch: string;
  files: string[];
  summary: string;
  expectedImpact: string;
  risk: PatchRisk;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export interface PatchResponseValidationResult {
  valid: boolean;
  response?: RawPatchModelResponse;
  error?: PatchProviderError;
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

const VALID_RISKS: Set<string> = new Set(["low", "medium", "high"]);

/**
 * Parse and structurally validate the raw text returned by a patch model.
 *
 * Accepts JSON with or without a leading ```json ``` code fence.
 *
 * Rejects:
 * - Non-JSON text
 * - Missing required fields
 * - Invalid types
 * - Invalid risk enum value
 * - Confidence out of [0, 1] range
 * - Non-array files field
 * - Non-string patch field
 * - Empty patch AND empty summary (indicates provider gave up without signalling)
 */
export function validatePatchResponse(rawText: string): PatchResponseValidationResult {
  if (!rawText || rawText.trim().length === 0) {
    return makeError("empty_patch", "Provider returned an empty response.");
  }

  // Strip optional markdown code fence
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "").trim();
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```/, "").replace(/```$/, "").trim();
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err: any) {
    return makeError(
      "malformed_response",
      `Provider response is not valid JSON: ${err.message}. Snippet: ${cleaned.slice(0, 120)}`
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return makeError("invalid_schema", "Provider response is not a JSON object.");
  }

  const obj = parsed as Record<string, unknown>;

  // --- patch ---
  if (!("patch" in obj)) {
    return makeError("invalid_schema", "Provider response missing required field 'patch'.");
  }
  if (typeof obj.patch !== "string") {
    return makeError("invalid_schema", `Field 'patch' must be a string, got ${typeof obj.patch}.`);
  }

  // --- files ---
  if (!("files" in obj)) {
    return makeError("invalid_schema", "Provider response missing required field 'files'.");
  }
  if (!Array.isArray(obj.files)) {
    return makeError("invalid_schema", `Field 'files' must be an array, got ${typeof obj.files}.`);
  }
  for (const f of obj.files) {
    if (typeof f !== "string") {
      return makeError(
        "invalid_schema",
        `All entries in 'files' must be strings; found ${typeof f}.`
      );
    }
  }

  // --- summary ---
  if (!("summary" in obj)) {
    return makeError("invalid_schema", "Provider response missing required field 'summary'.");
  }
  if (typeof obj.summary !== "string") {
    return makeError("invalid_schema", `Field 'summary' must be a string.`);
  }

  // --- expectedImpact ---
  if (!("expectedImpact" in obj)) {
    return makeError("invalid_schema", "Provider response missing required field 'expectedImpact'.");
  }
  if (typeof obj.expectedImpact !== "string") {
    return makeError("invalid_schema", `Field 'expectedImpact' must be a string.`);
  }

  // --- risk ---
  if (!("risk" in obj)) {
    return makeError("invalid_schema", "Provider response missing required field 'risk'.");
  }
  if (typeof obj.risk !== "string" || !VALID_RISKS.has(obj.risk)) {
    return makeError(
      "invalid_schema",
      `Field 'risk' must be one of 'low', 'medium', 'high'. Got: '${obj.risk}'.`
    );
  }

  // --- confidence ---
  if (!("confidence" in obj)) {
    return makeError("invalid_schema", "Provider response missing required field 'confidence'.");
  }
  if (typeof obj.confidence !== "number" || isNaN(obj.confidence)) {
    return makeError("invalid_schema", `Field 'confidence' must be a number.`);
  }
  if (obj.confidence < 0 || obj.confidence > 1) {
    return makeError(
      "invalid_schema",
      `Field 'confidence' must be between 0 and 1, got ${obj.confidence}.`
    );
  }

  // --- Empty patch with no explanation (provider silently gave up) ---
  if (
    (obj.patch as string).trim().length === 0 &&
    (obj.summary as string).trim().length === 0
  ) {
    return makeError(
      "empty_patch",
      "Provider returned an empty patch with no summary. Cannot proceed."
    );
  }

  // All checks passed
  return {
    valid: true,
    response: {
      patch: obj.patch as string,
      files: obj.files as string[],
      summary: obj.summary as string,
      expectedImpact: obj.expectedImpact as string,
      risk: obj.risk as PatchRisk,
      confidence: obj.confidence as number,
    },
  };
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeError(
  kind: PatchProviderErrorKind,
  message: string
): PatchResponseValidationResult {
  return {
    valid: false,
    error: { kind, message },
  };
}
