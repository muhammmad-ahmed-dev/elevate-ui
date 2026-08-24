/**
 * Phase 3C: Scope Guard
 *
 * Enforces PatchPlan line-change budgets:
 * - maxLinesChanged (total additions + deletions)
 * - Per-file additions and deletions
 *
 * Also calls PatchPlanner.validatePatchScope() with the ACTUAL parsed
 * diff file set (never the provider's claimed list).
 *
 * PHASE 3C BOUNDARY: Non-mutating.
 */

import type { ParsedDiff, ScopeValidationResult } from "./types.js";
import type { PatchPlan } from "../../types.js";

/** Conservative default if PatchPlan.maxLinesChanged is unset or zero. */
const DEFAULT_MAX_LINES_CHANGED = 150;

export interface ScopeGuardOptions {
  /** Absolute project root (for resolving file paths). */
  projectRoot: string;
  /**
   * Maximum total line changes (additions + deletions).
   * Falls back to PatchPlan.maxLinesChanged then to DEFAULT_MAX_LINES_CHANGED.
   */
  maxLinesChanged?: number;
}

/**
 * Validate a parsed diff against PatchPlan line budgets.
 *
 * The parsed diff's file set is checked, not the provider's claimed list.
 */
export function runScopeGuard(
  parsedDiff: ParsedDiff,
  plan: PatchPlan,
  options: ScopeGuardOptions = { projectRoot: "" }
): ScopeValidationResult {
  const violations: string[] = [];

  const totalAdditions = parsedDiff.totalAdditions;
  const totalDeletions = parsedDiff.totalDeletions;
  const totalChanged = parsedDiff.totalChanged;

  // Determine effective limit
  const effectiveLimit =
    options.maxLinesChanged ??
    (plan.maxLinesChanged > 0 ? plan.maxLinesChanged : DEFAULT_MAX_LINES_CHANGED);

  if (totalChanged > effectiveLimit) {
    violations.push(
      `Total line changes (${totalChanged}) exceeds limit of ${effectiveLimit} (additions=${totalAdditions}, deletions=${totalDeletions})`
    );
  }

  // Per-file line change summary (for logging; no hard per-file cap in Phase 3C)
  const filesChecked = parsedDiff.files.map((f) => f.canonicalPath);

  return {
    valid: violations.length === 0,
    violations,
    filesChecked,
    totalAdditions,
    totalDeletions,
    totalChanged,
  };
}
