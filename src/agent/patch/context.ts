/**
 * Phase 3B: Source Context Builder
 *
 * Selects and filters the minimal source context to include in a patch
 * generation request.  Explicitly excludes secrets, env files, lockfiles,
 * node_modules, and any file not authorised by the PatchPlan.
 *
 * READ-ONLY: this module only reads files; it never writes.
 */

import { readFile } from "node:fs/promises";
import { relative, extname, isAbsolute } from "node:path";
import type { PatchPlan } from "../types.js";
import type { SourceFileContext } from "./types.js";
import { isProtectedPath } from "../protected-paths.js";

// ---------------------------------------------------------------------------
// Hard exclusion patterns (defence-in-depth beyond protected-paths.ts)
// ---------------------------------------------------------------------------

/**
 * Relative path patterns that are ALWAYS excluded from the context sent to
 * any external model, regardless of PatchPlan.allowedFiles.
 *
 * These supplement the ProtectedPathConfig rules specifically for the
 * purpose of context building — the concern here is *privacy* rather than
 * mutation safety.
 */
const CONTEXT_EXCLUSION_PREFIXES: string[] = [
  ".env",
  "node_modules/",
  ".next/",
  ".turbo/",
  "out/",
  "dist/",
  ".git/",
  "elevate-report/",
];

const CONTEXT_EXCLUSION_EXTENSIONS: Set<string> = new Set([
  ".lock",
  ".log",
  ".map",
  ".snap",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
]);

/** Maximum bytes of a single source file to include (64 KB). */
const MAX_FILE_BYTES = 64 * 1024;

// ---------------------------------------------------------------------------
// Context exclusion check
// ---------------------------------------------------------------------------

/**
 * Returns true if a file should NEVER be included in model context.
 * This is separate from — and in addition to — the ProtectedPathConfig check.
 */
export function isContextExcluded(relativePosixPath: string): boolean {
  for (const prefix of CONTEXT_EXCLUSION_PREFIXES) {
    if (relativePosixPath.startsWith(prefix)) return true;
  }

  const ext = extname(relativePosixPath).toLowerCase();
  if (CONTEXT_EXCLUSION_EXTENSIONS.has(ext)) return true;

  // Explicit env-file patterns (belt-and-suspenders)
  const basename = relativePosixPath.split("/").pop() ?? "";
  if (
    basename.startsWith(".env") ||
    basename.includes("secret") ||
    basename.includes("credential") ||
    basename.includes("private-key")
  ) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// SourceContextBuilder
// ---------------------------------------------------------------------------

export interface SourceContextBuilderOptions {
  /** Absolute path to project root. */
  projectRoot: string;
  /** Maximum number of source files to include. Default: 3. */
  maxFiles?: number;
}

export class SourceContextBuilder {
  private projectRoot: string;
  private maxFiles: number;

  constructor(options: SourceContextBuilderOptions) {
    this.projectRoot = options.projectRoot;
    this.maxFiles = options.maxFiles ?? 3;
  }

  /**
   * Reads the source files authorised by the PatchPlan and returns safe
   * context entries.
   *
   * Exclusion order (defence-in-depth):
   * 1. Only files in PatchPlan.allowedFiles are considered.
   * 2. Protected paths are re-verified (belt-and-suspenders).
   * 3. Context-exclusion patterns are applied (privacy layer).
   * 4. Non-absolute paths are rejected.
   * 5. Files that cannot be read are skipped with a warning in the errors array.
   * 6. File content is truncated to MAX_FILE_BYTES.
   */
  public async buildContext(
    plan: PatchPlan
  ): Promise<{ files: SourceFileContext[]; errors: string[] }> {
    const errors: string[] = [];
    const files: SourceFileContext[] = [];

    const primaryAbsPath = plan.allowedFiles[0];

    for (const absPath of plan.allowedFiles.slice(0, this.maxFiles)) {
      // 1. Reject non-absolute
      if (!isAbsolute(absPath)) {
        errors.push(`Skipping non-absolute path: '${absPath}'`);
        continue;
      }

      // 2. Re-verify protected status (belt-and-suspenders)
      const protectedCheck = isProtectedPath(absPath, this.projectRoot);
      if (protectedCheck.protected) {
        errors.push(
          `Skipping protected file '${absPath}': ${protectedCheck.reason}`
        );
        continue;
      }

      // 3. Compute relative path for context exclusion check
      const relPosix = relative(this.projectRoot, absPath).replace(/\\/g, "/");

      if (isContextExcluded(relPosix)) {
        errors.push(
          `Skipping context-excluded file '${relPosix}' (env/secret/binary exclusion)`
        );
        continue;
      }

      // 4. Read file content
      let raw: string;
      try {
        const buf = await readFile(absPath);
        if (buf.length > MAX_FILE_BYTES) {
          raw = buf.subarray(0, MAX_FILE_BYTES).toString("utf8");
          errors.push(
            `File '${relPosix}' truncated to ${MAX_FILE_BYTES} bytes for model context.`
          );
        } else {
          raw = buf.toString("utf8");
        }
      } catch (err: any) {
        errors.push(`Could not read file '${relPosix}': ${err.message}`);
        continue;
      }

      files.push({
        absolutePath: absPath,
        relativePath: relPosix,
        content: raw,
        isPrimaryTarget: absPath === primaryAbsPath,
      });
    }

    return { files, errors };
  }

  /**
   * Verify that a given absolute path is safe to include in model context.
   * Returns `{ safe: true }` or `{ safe: false, reason }`.
   * Exposed for testing.
   */
  public isSafeForContext(
    absoluteFilePath: string
  ): { safe: boolean; reason?: string } {
    if (!isAbsolute(absoluteFilePath)) {
      return { safe: false, reason: "Not an absolute path" };
    }

    const protectedCheck = isProtectedPath(absoluteFilePath, this.projectRoot);
    if (protectedCheck.protected) {
      return { safe: false, reason: protectedCheck.reason };
    }

    const rel = relative(this.projectRoot, absoluteFilePath).replace(/\\/g, "/");
    if (isContextExcluded(rel)) {
      return { safe: false, reason: `Context-excluded: ${rel}` };
    }

    return { safe: true };
  }
}

/**
 * Convenience wrapper: compute relative path and check context exclusion.
 * Exported for use in tests.
 */
export function buildRelativePath(absPath: string, projectRoot: string): string {
  return relative(projectRoot, absPath).replace(/\\/g, "/");
}

/**
 * Exported so that tests can verify the context exclusion logic directly
 * without instantiating the full builder.
 */
export { isContextExcluded as checkContextExclusion };
