/**
 * Phase 3C: Path Guard
 *
 * Validates every file path extracted from the parsed diff against:
 * 1. Basic path safety (traversal, absolute, Windows, UNC)
 * 2. isProtectedPath() from Phase 3A
 * 3. PatchPlan.allowedFiles (scope)
 * 4. File-count limit
 *
 * The provider's claimed file list is NEVER used here.
 *
 * PHASE 3C BOUNDARY: Non-mutating.
 */

import { resolve } from "node:path";
import type { ParsedDiff, PathGuardResult, DiffViolation } from "./types.js";
import { checkPathSafety } from "./parser.js";
import { isProtectedPath, mergeProtectedPathConfig } from "../../protected-paths.js";
import type { ProtectedPathConfig } from "../../types.js";

export interface PathGuardOptions {
  /** Absolute path to the project root. */
  projectRoot: string;
  /** Absolute paths the patch is permitted to modify (from PatchPlan). */
  allowedFiles: string[];
  /** Maximum number of files allowed (from PatchPlan). */
  maxFilesAllowed: number;
  /** Optional additional protected-path config. Merged over defaults. */
  protectedPathConfig?: Partial<ProtectedPathConfig>;
}

/**
 * Check every file in a parsed diff against all path safety rules.
 *
 * Returns a PathGuardResult with all violations accumulated.
 * Never throws — all errors become structured violations.
 */
export function runPathGuard(
  parsedDiff: ParsedDiff,
  options: PathGuardOptions
): PathGuardResult {
  const violations: DiffViolation[] = [];
  const normalizedPaths: string[] = [];

  const effectiveConfig = mergeProtectedPathConfig(options.protectedPathConfig);

  // Normalise allowedFiles to POSIX for comparison
  const allowedNormalized = new Set(
    options.allowedFiles.map((f) => f.replace(/\\/g, "/"))
  );

  for (const file of parsedDiff.files) {
    const relPath = file.canonicalPath; // Already normalized by parser

    // 1. Basic path safety (traversal, absolute, Windows, UNC)
    const safety = checkPathSafety(relPath);
    if (!safety.safe) {
      const category =
        safety.reason?.includes("traversal")
          ? "path_traversal"
          : safety.reason?.includes("Absolute")
          ? "absolute_path"
          : safety.reason?.includes("Windows")
          ? "windows_path"
          : safety.reason?.includes("UNC")
          ? "unc_path"
          : "unknown";

      violations.push({
        category,
        message: safety.reason ?? `Unsafe path: '${relPath}'`,
        file: relPath,
      });
      continue;
    }

    // 2. Resolve to absolute path for isProtectedPath()
    let absolutePath: string;
    try {
      absolutePath = resolve(options.projectRoot, relPath);
    } catch {
      violations.push({
        category: "path_traversal",
        message: `Cannot resolve path '${relPath}' relative to project root`,
        file: relPath,
      });
      continue;
    }

    // Ensure resolved path does not escape the project root (normalize to POSIX for comparison)
    const normalizedRoot = options.projectRoot.replace(/\\/g, "/");
    const normalizedAbs = absolutePath.replace(/\\/g, "/");
    if (!normalizedAbs.startsWith(normalizedRoot + "/") && normalizedAbs !== normalizedRoot) {
      violations.push({
        category: "path_traversal",
        message: `Path '${relPath}' resolves outside project root`,
        file: relPath,
      });
      continue;
    }

    // 3. Protected path check (Phase 3A registry)
    const protectedCheck = isProtectedPath(
      absolutePath,
      options.projectRoot,
      effectiveConfig
    );
    if (protectedCheck.protected) {
      violations.push({
        category: "protected_path",
        message: `Protected path rejected: '${relPath}' — ${protectedCheck.reason}`,
        file: relPath,
      });
      continue;
    }

    // 4. Scope check: must be in PatchPlan.allowedFiles
    const normalizedAbsPosix = absolutePath.replace(/\\/g, "/");
    if (!allowedNormalized.has(normalizedAbsPosix)) {
      violations.push({
        category: "out_of_scope",
        message: `File '${relPath}' is not in PatchPlan.allowedFiles`,
        file: relPath,
      });
      continue;
    }

    normalizedPaths.push(relPath);
  }

  // 5. File-count limit (checked across all files, not just safe ones)
  if (parsedDiff.files.length > options.maxFilesAllowed) {
    violations.push({
      category: "file_count_exceeded",
      message:
        `Diff touches ${parsedDiff.files.length} files but PatchPlan.maxFilesAllowed is ${options.maxFilesAllowed}`,
    });
  }

  return {
    valid: violations.length === 0,
    violations,
    normalizedPaths,
  };
}
