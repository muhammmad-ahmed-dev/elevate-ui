/**
 * Phase 3C: Strict Unified Diff Parser
 *
 * Parses standard unified diff format (--- a/path / +++ b/path / @@ ... @@).
 *
 * Design principles:
 * - Strict: any deviation from expected format is a hard error
 * - No external dependencies
 * - Rejects deleted, renamed, binary, and submodule changes by default
 * - Normalizes paths to POSIX forward-slash form
 * - Detects path traversal, absolute paths, Windows drive letters, UNC paths
 *
 * PHASE 3C BOUNDARY: read-only, non-mutating.
 */

import type {
  ParsedDiff,
  DiffFile,
  DiffHunk,
  DiffHunkLine,
  DiffChangeType,
} from "./types.js";

// ---------------------------------------------------------------------------
// Parser errors
// ---------------------------------------------------------------------------

export class DiffParseError extends Error {
  constructor(
    message: string,
    public readonly lineNumber?: number,
    public readonly rawLine?: string
  ) {
    super(message);
    this.name = "DiffParseError";
  }
}

// ---------------------------------------------------------------------------
// Path normalisation and safety checks
// ---------------------------------------------------------------------------

/**
 * /dev/null sentinel used in git diff for created/deleted files.
 */
const DEV_NULL = "/dev/null";

/** Normalizes a path from a diff header to a clean POSIX-relative path. */
function normalizeDiffPath(raw: string): string {
  // Strip the a/ or b/ git prefix
  let p = raw.trim();
  if (p.startsWith("a/") || p.startsWith("b/")) {
    p = p.slice(2);
  }
  // Normalize backslashes to forward slashes
  p = p.replace(/\\/g, "/");
  return p;
}

/** Check if a relative POSIX path contains any unsafe component. */
export function checkPathSafety(
  relativePosixPath: string
): { safe: boolean; reason?: string } {
  if (!relativePosixPath || relativePosixPath.trim() === "") {
    return { safe: false, reason: "Empty path" };
  }

  // Absolute paths
  if (relativePosixPath.startsWith("/")) {
    return { safe: false, reason: `Absolute path rejected: '${relativePosixPath}'` };
  }

  // Windows drive letters (C:/, D:\, etc.)
  if (/^[a-zA-Z]:[\\/]/.test(relativePosixPath)) {
    return {
      safe: false,
      reason: `Windows drive-letter path rejected: '${relativePosixPath}'`,
    };
  }

  // UNC paths (\\server\share)
  if (relativePosixPath.startsWith("//") || relativePosixPath.startsWith("\\\\")) {
    return { safe: false, reason: `UNC path rejected: '${relativePosixPath}'` };
  }

  // Path traversal (../)
  const segments = relativePosixPath.split("/");
  for (const seg of segments) {
    if (seg === "..") {
      return {
        safe: false,
        reason: `Path traversal detected: '${relativePosixPath}'`,
      };
    }
  }

  // Null bytes
  if (relativePosixPath.includes("\0")) {
    return { safe: false, reason: `Null byte in path: '${relativePosixPath}'` };
  }

  return { safe: true };
}

// ---------------------------------------------------------------------------
// Hunk header parsing
// ---------------------------------------------------------------------------

// @@ -a,b +c,d @@ optional context
const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function parseHunkHeader(line: string): {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
} | null {
  const m = HUNK_HEADER_RE.exec(line);
  if (!m) return null;
  return {
    oldStart: parseInt(m[1]!, 10),
    oldCount: m[2] !== undefined ? parseInt(m[2]!, 10) : 1,
    newStart: parseInt(m[3]!, 10),
    newCount: m[4] !== undefined ? parseInt(m[4]!, 10) : 1,
  };
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export interface DiffParserOptions {
  /**
   * Whether to allow deleted files (changeType="deleted").
   * Default: false — deleted files are rejected.
   */
  allowDeletions?: boolean;
  /**
   * Whether to allow renamed files.
   * Default: false.
   */
  allowRenames?: boolean;
  /**
   * Whether to validate hunk line counts strictly.
   * Default: false.
   */
  strictHunkCounts?: boolean;
}

/**
 * Parse a unified diff string into a strongly typed ParsedDiff model.
 *
 * @throws {DiffParseError} for any malformed input.
 */
export function parseDiff(
  raw: string,
  options: DiffParserOptions = {}
): ParsedDiff {
  const allowDeletions = options.allowDeletions ?? false;
  const allowRenames = options.allowRenames ?? false;
  const strictHunkCounts = options.strictHunkCounts ?? false;

  if (!raw || raw.trim() === "") {
    throw new DiffParseError("Diff string is empty or whitespace-only");
  }

  const lines = raw.split(/\r?\n/);
  const files: DiffFile[] = [];

  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Skip blank lines between file sections
    if (line === "") {
      i++;
      continue;
    }

    // Detect binary file line (before the --- header)
    if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
      throw new DiffParseError(
        `Binary file detected and rejected: '${line.slice(0, 80)}'`,
        i + 1,
        line
      );
    }

    // Detect submodule change
    if (line.startsWith("Subproject commit ")) {
      throw new DiffParseError(
        `Submodule change detected and rejected: '${line.slice(0, 80)}'`,
        i + 1,
        line
      );
    }

    // Detect "diff --git" header (git extended header)
    if (line.startsWith("diff --git ")) {
      // Consume optional extended headers (index, mode, etc.)
      i++;
      while (i < lines.length) {
        const extLine = lines[i]!;
        if (
          extLine.startsWith("index ") ||
          extLine.startsWith("old mode ") ||
          extLine.startsWith("new mode ") ||
          extLine.startsWith("deleted file mode ") ||
          extLine.startsWith("new file mode ") ||
          extLine.startsWith("rename from ") ||
          extLine.startsWith("rename to ") ||
          extLine.startsWith("copy from ") ||
          extLine.startsWith("copy to ") ||
          extLine.startsWith("similarity index ") ||
          extLine.startsWith("dissimilarity index ")
        ) {
          i++;
        } else {
          break;
        }
      }
      continue;
    }

    // We expect "--- " to start a file section
    if (!line.startsWith("--- ")) {
      // Not a file header — skip (could be index line or trailing content)
      i++;
      continue;
    }

    // Parse old path
    const oldRaw = line.slice(4).trim();
    i++;

    // Next line must be "+++ "
    if (i >= lines.length || !lines[i]!.startsWith("+++ ")) {
      throw new DiffParseError(
        `Expected '+++ ' header after '--- ' at line ${i}`,
        i + 1,
        lines[i]
      );
    }

    const newRaw = lines[i]!.slice(4).trim();
    i++;

    // Resolve change type
    const isOldDevNull = oldRaw === DEV_NULL;
    const isNewDevNull = newRaw === DEV_NULL;

    let changeType: DiffChangeType;
    let canonicalPath: string;

    if (isOldDevNull && isNewDevNull) {
      throw new DiffParseError(
        `Both old and new paths are /dev/null — invalid diff entry`
      );
    } else if (isOldDevNull) {
      changeType = "created";
      const np = normalizeDiffPath(newRaw);
      const safety = checkPathSafety(np);
      if (!safety.safe) {
        throw new DiffParseError(`Unsafe new-file path: ${safety.reason}`);
      }
      canonicalPath = np;
    } else if (isNewDevNull) {
      changeType = "deleted";
      if (!allowDeletions) {
        throw new DiffParseError(
          `File deletion detected and rejected: '${oldRaw}'. Phase 3C rejects deletions by default.`
        );
      }
      canonicalPath = normalizeDiffPath(oldRaw);
    } else {
      const op = normalizeDiffPath(oldRaw);
      const np = normalizeDiffPath(newRaw);

      // Safety checks on both paths
      for (const [p, label] of [[op, "old"], [np, "new"]] as const) {
        const safety = checkPathSafety(p);
        if (!safety.safe) {
          throw new DiffParseError(`Unsafe ${label} path: ${safety.reason}`);
        }
      }

      if (op !== np) {
        changeType = "renamed";
        if (!allowRenames) {
          throw new DiffParseError(
            `File rename detected and rejected: '${op}' → '${np}'. Phase 3C rejects renames by default.`
          );
        }
        canonicalPath = np;
      } else {
        changeType = "modified";
        canonicalPath = np;
      }
    }

    const oldPath = isOldDevNull ? DEV_NULL : normalizeDiffPath(oldRaw);
    const newPath = isNewDevNull ? DEV_NULL : normalizeDiffPath(newRaw);

    // Parse hunks
    const hunks: DiffHunk[] = [];
    let fileAdditions = 0;
    let fileDeletions = 0;

    while (i < lines.length) {
      const hunkLine = lines[i]!;

      // End of this file's hunks — new file section or end
      if (hunkLine.startsWith("--- ") || hunkLine.startsWith("diff --git ") || hunkLine === "") {
        if (hunkLine === "") { i++; }
        break;
      }

      if (!hunkLine.startsWith("@@")) {
        // Could be trailing content or git extended header — skip
        if (
          hunkLine.startsWith("index ") ||
          hunkLine.startsWith("\\ No newline") ||
          hunkLine.startsWith("Binary files")
        ) {
          if (hunkLine.startsWith("Binary files")) {
            throw new DiffParseError(
              `Binary file marker in hunk context: '${hunkLine.slice(0, 80)}'`,
              i + 1
            );
          }
          i++;
          continue;
        }
        // Unknown line — bail
        break;
      }

      const hunkHeader = parseHunkHeader(hunkLine);
      if (!hunkHeader) {
        throw new DiffParseError(
          `Malformed hunk header: '${hunkLine}'`,
          i + 1,
          hunkLine
        );
      }

      i++;

      const addedLines: string[] = [];
      const removedLines: string[] = [];
      const contextLines: string[] = [];
      const hunkLines: DiffHunkLine[] = [];

      let addCount = 0;
      let delCount = 0;
      let ctxCount = 0;

      // Parse hunk body
      while (i < lines.length) {
        const bodyLine = lines[i]!;

        if (
          bodyLine.startsWith("@@") ||
          bodyLine.startsWith("--- ") ||
          bodyLine.startsWith("diff --git ")
        ) {
          break;
        }

        if (bodyLine.startsWith("+")) {
          const content = bodyLine.slice(1);
          addedLines.push(content);
          hunkLines.push({ type: "added", content });
          addCount++;
          i++;
        } else if (bodyLine.startsWith("-")) {
          const content = bodyLine.slice(1);
          removedLines.push(content);
          hunkLines.push({ type: "removed", content });
          delCount++;
          i++;
        } else if (bodyLine.startsWith(" ") || bodyLine === "") {
          const content = bodyLine.startsWith(" ") ? bodyLine.slice(1) : "";
          contextLines.push(content);
          hunkLines.push({ type: "context", content });
          ctxCount++;
          i++;
        } else if (bodyLine.startsWith("\\ No newline")) {
          // "\ No newline at end of file" — safe to skip
          i++;
        } else {
          // Unknown line type in hunk body — treat as end of hunk
          break;
        }
      }

      // Validate hunk counts if strict
      if (strictHunkCounts) {
        const expectedOld = delCount + ctxCount;
        const expectedNew = addCount + ctxCount;
        // oldCount=0 is valid for new-file hunks
        if (hunkHeader.oldCount !== 0 && expectedOld !== hunkHeader.oldCount) {
          throw new DiffParseError(
            `Hunk line count mismatch: expected old=${hunkHeader.oldCount} but got ${expectedOld} (del=${delCount}, ctx=${ctxCount}) in hunk starting at line ${i}`,
            i
          );
        }
        if (hunkHeader.newCount !== 0 && expectedNew !== hunkHeader.newCount) {
          throw new DiffParseError(
            `Hunk line count mismatch: expected new=${hunkHeader.newCount} but got ${expectedNew} (add=${addCount}, ctx=${ctxCount}) in hunk starting at line ${i}`,
            i
          );
        }
      }

      hunks.push({
        ...hunkHeader,
        addedLines,
        removedLines,
        contextLines,
        lines: hunkLines,
      });

      fileAdditions += addCount;
      fileDeletions += delCount;
    }

    if (hunks.length === 0 && changeType === "modified") {
      throw new DiffParseError(
        `File '${canonicalPath}' has '--- / +++' headers but no hunks — malformed diff.`
      );
    }

    files.push({
      oldPath,
      newPath,
      canonicalPath,
      changeType,
      additions: fileAdditions,
      deletions: fileDeletions,
      hunks,
    });
  }

  if (files.length === 0) {
    throw new DiffParseError("No valid file entries found in diff");
  }

  const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);

  return {
    files,
    totalAdditions,
    totalDeletions,
    totalChanged: totalAdditions + totalDeletions,
  };
}
