/**
 * Phase 3: PatchPlanner
 *
 * Creates a structured PatchPlan from a MutationRecommendation and a
 * ComponentLocatorResult.  The plan defines:
 *  - which files are authorised for mutation
 *  - what scoping constraints apply
 *  - what verification must pass afterward
 *
 * Design principles:
 * - Refuses to create a plan when the locator result is ambiguous.
 * - Rejects files that match the protected-path registry.
 * - Never generates code or patches — that is Phase 3B.
 */

import { randomUUID } from "node:crypto";
import type { MutationRecommendation } from "../analysis/types.js";
import type {
  PatchPlan,
  PatchConstraint,
  ComponentLocatorResult,
  ProtectedPathConfig,
} from "./types.js";
import {
  isProtectedPath,
  mergeProtectedPathConfig,
} from "./protected-paths.js";

// ---------------------------------------------------------------------------
// Planner configuration
// ---------------------------------------------------------------------------

export interface PatchPlannerOptions {
  /** Absolute path to the project root. */
  projectRoot: string;
  /** Optional additional protected-path rules (merged over defaults). */
  protectedPathConfig?: Partial<ProtectedPathConfig>;
  /**
   * Maximum number of files a single patch is allowed to touch.
   * Default: 2 (one component file + optionally its CSS module).
   */
  maxFilesAllowed?: number;
  /**
   * Maximum total line changes before a patch is flagged as oversized.
   * Default: 150
   */
  maxLinesChanged?: number;
}

// ---------------------------------------------------------------------------
// PatchPlanner — main class
// ---------------------------------------------------------------------------

export class PatchPlanner {
  private projectRoot: string;
  private effectiveProtectedConfig: ProtectedPathConfig;
  private maxFilesAllowed: number;
  private maxLinesChanged: number;

  constructor(options: PatchPlannerOptions) {
    this.projectRoot = options.projectRoot;
    this.effectiveProtectedConfig = mergeProtectedPathConfig(
      options.protectedPathConfig
    );
    this.maxFilesAllowed = options.maxFilesAllowed ?? 2;
    this.maxLinesChanged = options.maxLinesChanged ?? 150;
  }

  /**
   * Build a PatchPlan from a recommendation and its locator result.
   *
   * @throws {Error} When the locator result is ambiguous / not confident enough.
   * @throws {Error} When no allowed files remain after protected-path filtering.
   */
  public createPlan(
    recommendation: MutationRecommendation,
    locatorResult: ComponentLocatorResult
  ): PatchPlan {
    // 1. Refuse to plan if the locator was ambiguous
    if (locatorResult.isAmbiguous || !locatorResult.primaryCandidate) {
      throw new Error(
        `PatchPlanner refused: ComponentLocator returned ambiguous result for recommendation '${recommendation.id}'. ` +
          `Reason: ${locatorResult.summary}. Mutation cannot proceed without a clear target.`
      );
    }

    // 2. Collect candidate files from the locator result
    const candidateAbsolutePaths = locatorResult.candidates
      .filter((c) => c.confidence >= 0.5)
      .map((c) => c.absolutePath);

    // 3. Filter out protected paths
    const allowedFiles: string[] = [];
    const rejectedFiles: { path: string; reason: string }[] = [];

    for (const absPath of candidateAbsolutePaths) {
      const check = isProtectedPath(absPath, this.projectRoot, this.effectiveProtectedConfig);
      if (check.protected) {
        rejectedFiles.push({ path: absPath, reason: check.reason! });
      } else {
        allowedFiles.push(absPath);
      }
    }

    if (allowedFiles.length === 0) {
      const details = rejectedFiles
        .map((r) => `  ${r.path}: ${r.reason}`)
        .join("\n");
      throw new Error(
        `PatchPlanner refused: All candidate files are protected. No mutation target remains.\n${details}`
      );
    }

    // 4. Collect allowed selectors and components from locator
    const allowedSelectors: string[] = [];
    if (recommendation.affectedSelector) {
      allowedSelectors.push(recommendation.affectedSelector);
    }
    const allowedComponents = locatorResult.candidates
      .flatMap((c) => c.componentNames)
      .filter((v, i, a) => a.indexOf(v) === i); // unique

    // 5. Build the prohibited-areas list
    const prohibitedAreas: PatchConstraint[] = [
      { description: "Server-side API routes (src/app/api/, pages/api/)" },
      { description: "Authentication modules (src/auth/, lib/auth)" },
      { description: "Database access layers (src/db/, prisma/, drizzle/)" },
      { description: "Environment files (.env, .env.*)" },
      { description: "Package management files (package.json, lockfiles)" },
      { description: "Build configuration (next.config.ts, tsconfig.json)" },
      { description: "React hooks (useState, useEffect, useCallback logic)" },
      { description: "State management stores (Redux, Zustand, Jotai)" },
      { description: "Event handler business logic" },
      { description: "Data-fetching logic (fetch(), axios, SWR, React Query)" },
      { description: "Server actions (actions.ts, server-only code)" },
      { description: "Unrelated sibling components not identified in the recommendation" },
      { description: "Exported function signatures visible to other modules" },
      { description: "CI/CD configuration (.github/, Dockerfile)" },
      ...rejectedFiles.map((r) => ({
        description: `Protected file filtered by registry: ${r.path} (${r.reason})`,
      })),
    ];

    // 6. Build verification requirements
    const verificationRequirements = [
      "TypeScript type-check must pass (tsc --noEmit)",
      "Framework build must succeed",
      "Target route must load in browser",
      "No new horizontal overflow introduced",
      "No new broken images introduced",
      "No critical accessibility violations introduced",
      `Targeted issue '${recommendation.problem.slice(0, 80)}...' must show improvement or remain neutral`,
    ];

    // 7. Build protected-path list for this plan
    const protectedPaths = rejectedFiles.map((r) => r.path);

    // 8. Assemble and return the plan
    const plan: PatchPlan = {
      id: `plan-${randomUUID().slice(0, 8)}`,
      createdAt: new Date().toISOString(),
      recommendation,
      allowedFiles: allowedFiles.slice(0, this.maxFilesAllowed),
      allowedComponents,
      allowedSelectors,
      expectedVisualImprovement: recommendation.proposedImprovement,
      prohibitedAreas,
      maxFilesAllowed: this.maxFilesAllowed,
      maxLinesChanged: this.maxLinesChanged,
      verificationRequirements,
      protectedPaths,
    };

    return plan;
  }

  /**
   * Validate whether a proposed set of file paths is within the plan's scope.
   *
   * Returns a structured validation result rather than throwing, to allow
   * caller to decide whether to reject or log.
   */
  public validatePatchScope(
    plan: PatchPlan,
    proposedFiles: string[]
  ): { valid: boolean; violations: string[] } {
    const violations: string[] = [];
    const allowedSet = new Set(plan.allowedFiles.map((f) => f.replace(/\\/g, "/")));

    for (const file of proposedFiles) {
      const normalizedFile = file.replace(/\\/g, "/");

      // Check against allowed list
      if (!allowedSet.has(normalizedFile)) {
        violations.push(`File not in PatchPlan.allowedFiles: '${file}'`);
      }

      // Check against protected paths
      const check = isProtectedPath(file, this.projectRoot, this.effectiveProtectedConfig);
      if (check.protected) {
        violations.push(`File is protected: '${file}' — ${check.reason}`);
      }
    }

    if (proposedFiles.length > plan.maxFilesAllowed) {
      violations.push(
        `Patch exceeds maxFilesAllowed: touches ${proposedFiles.length} files but plan allows at most ${plan.maxFilesAllowed}`
      );
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }
}
