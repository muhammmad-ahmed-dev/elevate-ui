/**
 * Phase 3C: Central PatchValidator
 *
 * Orchestrates the full Phase 3C validation pipeline:
 *   raw patch string
 *   → DiffParser.parseDiff()
 *   → PathGuard.runPathGuard()
 *   → ScopeGuard.runScopeGuard()
 *   → AstGuard.runAstGuard()
 *   → ValidatedPatch
 *
 * The provider's changedFilesClaimed is NEVER used for validation decisions.
 * It is preserved in ValidatedPatch for logging only.
 *
 * PHASE 3C BOUNDARY: Non-mutating. No files are written.
 */

import type { PatchGenerationResult } from "../types.js";
import type { PatchPlan } from "../../types.js";
import type { ValidatedPatch, DiffViolation } from "./types.js";
import { parseDiff, DiffParseError } from "./parser.js";
import { runPathGuard } from "./path-guard.js";
import { runScopeGuard } from "./scope-guard.js";
import { runAstGuard } from "./ast-guard.js";
import { hashPatch } from "../hash.js";
import type { ProtectedPathConfig } from "../../types.js";

export interface PatchValidatorOptions {
  /** Absolute path to the project root. */
  projectRoot: string;
  /**
   * Whether to skip AST analysis (e.g. for non-TS/JS files or testing).
   * Default: false.
   */
  skipAstGuard?: boolean;
  /** Optional additional protected-path config (merged over defaults). */
  protectedPathConfig?: Partial<ProtectedPathConfig>;
}

export class PatchValidator {
  private projectRoot: string;
  private skipAstGuard: boolean;
  private protectedPathConfig?: Partial<ProtectedPathConfig>;

  constructor(options: PatchValidatorOptions) {
    this.projectRoot = options.projectRoot;
    this.skipAstGuard = options.skipAstGuard ?? false;
    this.protectedPathConfig = options.protectedPathConfig;
  }

  /**
   * Validate a PatchGenerationResult against a PatchPlan.
   *
   * Never throws — all failures are returned as structured ValidatedPatch
   * with `valid: false` and populated `violations`.
   */
  public async validate(
    patchResult: PatchGenerationResult,
    plan: PatchPlan
  ): Promise<ValidatedPatch> {
    const now = new Date().toISOString();
    const rawPatch = patchResult.patch ?? "";
    const originalPatchHash = patchResult.patchHash ?? hashPatch(rawPatch);
    const providerClaimedFiles = patchResult.changedFilesClaimed ?? [];

    // Stage 1: Parse the diff
    let parsedDiff;
    try {
      parsedDiff = parseDiff(rawPatch);
    } catch (err) {
      const msg =
        err instanceof DiffParseError
          ? err.message
          : `Unexpected parse error: ${String(err)}`;

      const violation: DiffViolation = {
        category: "malformed_diff",
        message: msg,
      };

      return {
        originalPatchHash,
        rawPatch,
        parsedDiff: { files: [], totalAdditions: 0, totalDeletions: 0, totalChanged: 0 },
        normalizedFiles: [],
        providerClaimedFiles,
        pathGuardResult: { valid: false, violations: [violation], normalizedPaths: [] },
        scopeResult: {
          valid: false,
          violations: [msg],
          filesChecked: [],
          totalAdditions: 0,
          totalDeletions: 0,
          totalChanged: 0,
        },
        astResult: {
          valid: false,
          violations: [violation],
          warnings: [],
          changedFiles: [],
          changedComponents: [],
          changedHooks: [],
          changedImports: [],
          changedExports: [],
          changedNetworkOperations: [],
          additions: 0,
          deletions: 0,
          risk: "high",
        },
        violations: [violation],
        warnings: [],
        valid: false,
        risk: "high",
        validatedAt: now,
      };
    }

    // Stage 2: Path guard
    const pathGuardResult = runPathGuard(parsedDiff, {
      projectRoot: this.projectRoot,
      allowedFiles: plan.allowedFiles,
      maxFilesAllowed: plan.maxFilesAllowed,
      protectedPathConfig: this.protectedPathConfig,
    });

    // Stage 3: Scope guard (line budgets)
    const scopeResult = runScopeGuard(parsedDiff, plan, {
      projectRoot: this.projectRoot,
    });

    // Stage 4: AST guard (skip if path guard already failed — no point)
    let astResult;
    if (this.skipAstGuard || !pathGuardResult.valid) {
      astResult = {
        valid: pathGuardResult.valid,
        violations: pathGuardResult.valid ? [] : pathGuardResult.violations,
        warnings: [],
        changedFiles: parsedDiff.files.map((f) => f.canonicalPath),
        changedComponents: [],
        changedHooks: [],
        changedImports: [],
        changedExports: [],
        changedNetworkOperations: [],
        additions: parsedDiff.totalAdditions,
        deletions: parsedDiff.totalDeletions,
        risk: pathGuardResult.valid ? ("low" as const) : ("high" as const),
      };
    } else {
      astResult = await runAstGuard(parsedDiff, plan, {
        projectRoot: this.projectRoot,
        allowedComponents: plan.allowedComponents,
      });
    }

    // Aggregate all violations
    const violations: DiffViolation[] = [
      ...pathGuardResult.violations,
      ...scopeResult.violations.map((msg) => ({
        category: "line_count_exceeded" as const,
        message: msg,
      })),
      ...astResult.violations,
    ];

    const warnings: string[] = [...astResult.warnings];

    const valid = violations.length === 0;

    // Compute aggregate risk
    let risk: "low" | "medium" | "high" = astResult.risk;
    if (!pathGuardResult.valid || !scopeResult.valid) {
      risk = "high";
    }

    return {
      originalPatchHash,
      rawPatch,
      parsedDiff,
      normalizedFiles: pathGuardResult.normalizedPaths,
      providerClaimedFiles,
      pathGuardResult,
      scopeResult,
      astResult,
      violations,
      warnings,
      valid,
      risk,
      validatedAt: now,
    };
  }
}
