/**
 * Phase 3C: Unified Diff Validation — Type Definitions
 *
 * Strongly typed model for parsed unified diffs, validation results,
 * and the central ValidatedPatch output.
 *
 * PHASE 3C BOUNDARY: Non-mutating. No files are modified.
 */

// ---------------------------------------------------------------------------
// Parsed diff model
// ---------------------------------------------------------------------------

/** The type of change a diff file entry represents. */
export type DiffChangeType =
  | "modified"   // File existed before and after
  | "created"    // File is new (--- /dev/null)
  | "deleted"    // File was deleted (+++ /dev/null) — REJECTED by default
  | "renamed"    // File was renamed (old/new paths differ) — REJECTED by default
  | "binary"     // Binary file indicator — REJECTED by default
  | "submodule"; // Submodule change — REJECTED by default

/** A single line within a diff hunk preserving appearance order. */
export interface DiffHunkLine {
  type: "context" | "added" | "removed";
  content: string;
}

/** A single contiguous hunk within a diff file. */
export interface DiffHunk {
  /** Line number in the old file where this hunk starts (1-indexed). */
  oldStart: number;
  /** Number of lines from the old file covered by this hunk. */
  oldCount: number;
  /** Line number in the new file where this hunk starts (1-indexed). */
  newStart: number;
  /** Number of lines from the new file covered by this hunk. */
  newCount: number;
  /** Lines beginning with '+' (not counting the '+' prefix). */
  addedLines: string[];
  /** Lines beginning with '-' (not counting the '-' prefix). */
  removedLines: string[];
  /** Lines beginning with ' ' (context lines). */
  contextLines: string[];
  /** Ordered lines in the hunk with their change types. */
  lines: DiffHunkLine[];
}

/** A single file entry in a parsed unified diff. */
export interface DiffFile {
  /** Path from the --- a/... header, normalized to POSIX slashes. */
  oldPath: string;
  /** Path from the +++ b/... header, normalized to POSIX slashes. */
  newPath: string;
  /** Canonical path used for validation (newPath for modified/created; oldPath for deleted). */
  canonicalPath: string;
  /** Type of change. */
  changeType: DiffChangeType;
  /** Total added lines across all hunks. */
  additions: number;
  /** Total deleted lines across all hunks. */
  deletions: number;
  /** Ordered list of hunks. */
  hunks: DiffHunk[];
}

/** The complete parsed unified diff. */
export interface ParsedDiff {
  /** All files in the diff. */
  files: DiffFile[];
  /** Total added lines across all files. */
  totalAdditions: number;
  /** Total deleted lines across all files. */
  totalDeletions: number;
  /** Total changed lines (additions + deletions). */
  totalChanged: number;
}

// ---------------------------------------------------------------------------
// Violation model
// ---------------------------------------------------------------------------

export type ViolationCategory =
  | "path_traversal"
  | "absolute_path"
  | "windows_path"
  | "unc_path"
  | "protected_path"
  | "out_of_scope"
  | "file_count_exceeded"
  | "line_count_exceeded"
  | "deleted_file"
  | "renamed_file"
  | "binary_file"
  | "submodule_change"
  | "malformed_diff"
  | "hook_change"
  | "api_change"
  | "server_action_change"
  | "import_change"
  | "export_change"
  | "component_boundary"
  | "logic_change"
  | "unknown";

export interface DiffViolation {
  category: ViolationCategory;
  message: string;
  file?: string;
  component?: string;
  /** Structured detail for hook/logic violations. */
  detail?: {
    type: string;
    before?: string;
    after?: string;
    reason?: string;
  };
}

// ---------------------------------------------------------------------------
// AST Analysis result
// ---------------------------------------------------------------------------

/** Change in a named React hook call. */
export interface HookChange {
  hookName: string;
  file: string;
  component: string;
  changeKind: "added" | "removed" | "modified";
}

/** Change in an import statement. */
export interface ImportChange {
  file: string;
  changeKind: "added" | "removed";
  moduleSpecifier: string;
  isExternalPackage: boolean;
  isProtectedModule: boolean;
}

/** Change in an exported symbol. */
export interface ExportChange {
  file: string;
  changeKind: "added" | "removed" | "signature_changed";
  symbolName: string;
}

/** A detected API/network operation change. */
export interface NetworkChange {
  file: string;
  component?: string;
  pattern: string;
  changeKind: "added" | "removed";
}

/** Result produced by the AST guard for a single file comparison. */
export interface AstFileAnalysis {
  file: string;
  changedComponents: string[];
  unauthorizedComponents: string[];
  hookChanges: HookChange[];
  importChanges: ImportChange[];
  exportChanges: ExportChange[];
  networkChanges: NetworkChange[];
  violations: DiffViolation[];
  warnings: string[];
}

/** Aggregate AST analysis across all diff files. */
export interface AstAnalysisResult {
  valid: boolean;
  violations: DiffViolation[];
  warnings: string[];
  changedFiles: string[];
  changedComponents: string[];
  changedHooks: HookChange[];
  changedImports: ImportChange[];
  changedExports: ExportChange[];
  changedNetworkOperations: NetworkChange[];
  additions: number;
  deletions: number;
  risk: "low" | "medium" | "high";
}

// ---------------------------------------------------------------------------
// Scope validation result
// ---------------------------------------------------------------------------

export interface ScopeValidationResult {
  valid: boolean;
  violations: string[];
  filesChecked: string[];
  totalAdditions: number;
  totalDeletions: number;
  totalChanged: number;
}

// ---------------------------------------------------------------------------
// Path guard result
// ---------------------------------------------------------------------------

export interface PathGuardResult {
  valid: boolean;
  violations: DiffViolation[];
  normalizedPaths: string[];
}

// ---------------------------------------------------------------------------
// ValidatedPatch — central output of Phase 3C
// ---------------------------------------------------------------------------

/** The final, fully validated patch output. Input to Phase 3D. */
export interface ValidatedPatch {
  /** SHA-256 hash of the original raw patch string (from PatchGenerationResult). */
  originalPatchHash: string;

  /** The raw unified diff string that was validated. */
  rawPatch: string;

  /** Parsed structured diff. */
  parsedDiff: ParsedDiff;

  /** Files touched (canonical paths, normalized). */
  normalizedFiles: string[];

  /** Provider's claimed file list (for logging; never used for validation). */
  providerClaimedFiles: string[];

  /** Path guard result. */
  pathGuardResult: PathGuardResult;

  /** Scope validation result. */
  scopeResult: ScopeValidationResult;

  /** AST/boundary analysis result. */
  astResult: AstAnalysisResult;

  /** All violations aggregated. */
  violations: DiffViolation[];

  /** Non-fatal warnings. */
  warnings: string[];

  /** Whether the patch passed all validation gates. */
  valid: boolean;

  /** Computed risk tier. */
  risk: "low" | "medium" | "high";

  /** Timestamp when validation completed. */
  validatedAt: string;
}
