/**
 * Phase 3C: AST Boundary Guard
 *
 * Compares BEFORE and AFTER source files using TypeScript's compiler API
 * to detect logic changes that should not appear in a purely visual patch.
 *
 * Strategy:
 * 1. For each diff file, reconstruct the AFTER source by applying hunk lines
 *    to the BEFORE source (read from disk) — purely in-memory, no disk writes.
 * 2. Parse both BEFORE and AFTER as TypeScript/TSX ASTs.
 * 3. Extract: imports, exports, hooks, network calls, component names.
 * 4. Diff the extracted symbol sets to detect violations.
 *
 * For TypeScript < 5.5 compatibility, we use ts.createSourceFile() directly
 * without the language service (no need for tsconfig.json).
 *
 * PHASE 3C BOUNDARY: Non-mutating. Never writes files.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
// Use dynamic import so tests can mock/stub without a full TS compiler in scope
import * as ts from "typescript";

import type {
  ParsedDiff,
  DiffFile,
  AstAnalysisResult,
  AstFileAnalysis,
  HookChange,
  ImportChange,
  ExportChange,
  NetworkChange,
  DiffViolation,
} from "./types.js";
import type { PatchPlan } from "../../types.js";

// ---------------------------------------------------------------------------
// React hook names to detect (canonical list)
// ---------------------------------------------------------------------------

const REACT_HOOKS = new Set([
  "useState",
  "useEffect",
  "useLayoutEffect",
  "useMemo",
  "useCallback",
  "useRef",
  "useReducer",
  "useContext",
  "useId",
  "useTransition",
  "useDeferredValue",
  "useImperativeHandle",
  "useDebugValue",
  "useSyncExternalStore",
  "useInsertionEffect",
  // Common custom hook patterns (detected by "use" prefix + capital letter)
]);

function isHookName(name: string): boolean {
  return REACT_HOOKS.has(name) || /^use[A-Z]/.test(name);
}

// ---------------------------------------------------------------------------
// Network/API call patterns
// ---------------------------------------------------------------------------

const NETWORK_IDENTIFIERS = new Set([
  "fetch",
  "axios",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "http",
  "https",
  "got",
  "ky",
  "superagent",
  "request",
]);

// State management store patterns
const STATE_MANAGEMENT_PATTERNS = [
  "useSelector",
  "useDispatch",
  "useStore",
  "useAtom",
  "useRecoilState",
  "useRecoilValue",
  "useSetRecoilState",
  "useZustand",
];


// ---------------------------------------------------------------------------
// Source reconstruction (apply diff hunks in-memory)
// ---------------------------------------------------------------------------

/**
 * Apply a single DiffFile's hunks to the provided before-source lines,
 * returning the after-source as a single string.
 *
 * This is a simplified apply that trusts the diff parser to have validated
 * line counts. It does NOT perform a full three-way merge.
 */
function applyDiffInMemory(beforeLines: string[], diffFile: DiffFile): string {
  if (diffFile.changeType === "created") {
    // No before-source for new files — the after-source is the addedLines from hunks
    const afterLines: string[] = [];
    for (const hunk of diffFile.hunks) {
      if (hunk.lines && hunk.lines.length > 0) {
        for (const line of hunk.lines) {
          if (line.type === "added" || line.type === "context") {
            afterLines.push(line.content);
          }
        }
      } else {
        afterLines.push(...hunk.addedLines);
      }
    }
    return afterLines.join("\n");
  }

  // For modified files: apply hunks in-order
  const result: string[] = [];
  let srcIdx = 0; // 0-indexed into beforeLines

  for (const hunk of diffFile.hunks) {
    const hunkStart = Math.max(0, hunk.oldStart - 1);

    // Copy unchanged lines before this hunk
    while (srcIdx < hunkStart && srcIdx < beforeLines.length) {
      result.push(beforeLines[srcIdx] ?? "");
      srcIdx++;
    }

    if (hunk.lines && hunk.lines.length > 0) {
      // Apply the hunk lines in exact order
      for (const line of hunk.lines) {
        if (line.type === "context") {
          result.push(srcIdx < beforeLines.length ? beforeLines[srcIdx]! : line.content);
          srcIdx++;
        } else if (line.type === "removed") {
          srcIdx++; // Skip this line from the before source
        } else if (line.type === "added") {
          result.push(line.content); // Insert new line
        }
      }
    } else {
      // Fallback if hunk.lines is not available
      srcIdx += hunk.removedLines.length;
      for (const line of hunk.addedLines) {
        result.push(line);
      }
    }
  }

  // Copy remaining source lines after all hunks
  while (srcIdx < beforeLines.length) {
    result.push(beforeLines[srcIdx] ?? "");
    srcIdx++;
  }

  return result.join("\n");
}

// ---------------------------------------------------------------------------
// AST symbol extraction
// ---------------------------------------------------------------------------

interface ExtractedSymbols {
  /** Top-level component function/arrow names */
  componentNames: string[];
  /** Hook call names at any depth */
  hookCalls: string[];
  /** Import module specifiers */
  importSpecifiers: Array<{ specifier: string; isExternal: boolean }>;
  /** Exported symbol names */
  exportedSymbols: string[];
  /** Network call identifier names found */
  networkCalls: string[];
  /** Whether 'use server' directive found */
  hasUseServer: boolean;
  /** Whether server route handler exports found */
  hasServerRouteHandlers: boolean;
}

function extractSymbols(sourceText: string, fileName: string): ExtractedSymbols {
  const result: ExtractedSymbols = {
    componentNames: [],
    hookCalls: [],
    importSpecifiers: [],
    exportedSymbols: [],
    networkCalls: [],
    hasUseServer: false,
    hasServerRouteHandlers: false,
  };

  // Check for 'use server' directive via text (quick check before full parse)
  if (sourceText.includes("\"use server\"") || sourceText.includes("'use server'")) {
    result.hasUseServer = true;
  }

  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(
      fileName,
      sourceText,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      fileName.endsWith(".tsx") || fileName.endsWith(".jsx")
        ? ts.ScriptKind.TSX
        : ts.ScriptKind.TS
    );
  } catch {
    // If the source can't be parsed (e.g. invalid TS), return empty symbols
    return result;
  }

  function visit(node: ts.Node): void {
    // -----------------------------------------------------------------------
    // Import declarations
    // -----------------------------------------------------------------------
    if (ts.isImportDeclaration(node)) {
      const spec = (node.moduleSpecifier as ts.StringLiteral).text;
      const isExternal =
        !spec.startsWith(".") && !spec.startsWith("/") && !spec.startsWith("@/");
      result.importSpecifiers.push({ specifier: spec, isExternal });
    }

    // -----------------------------------------------------------------------
    // Export declarations
    // -----------------------------------------------------------------------
    if (ts.isExportDeclaration(node)) {
      // Named exports: export { foo, bar }
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const el of node.exportClause.elements) {
          result.exportedSymbols.push(el.name.text);
        }
      }
    }

    // Function / arrow function declarations with 'export' modifier
    if (
      (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) &&
      node.name
    ) {
      const hasExport = node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      );
      if (hasExport) {
        result.exportedSymbols.push(node.name.text);
      }

      // Component detection: exported function starting with uppercase
      if (node.name.text[0] === node.name.text[0]?.toUpperCase() &&
          node.name.text !== node.name.text.toLowerCase()) {
        result.componentNames.push(node.name.text);
      }
    }

    // Variable declarations: export const Foo = () => ...
    if (ts.isVariableStatement(node)) {
      const hasExport = node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      );
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const name = decl.name.text;
        if (hasExport) {
          result.exportedSymbols.push(name);
        }
        // Server route handler exports (GET, POST, etc.)
        if (
          hasExport &&
          ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "config"].includes(name)
        ) {
          result.hasServerRouteHandlers = true;
        }
        // Component detection
        if (
          name[0] === name[0]?.toUpperCase() &&
          name !== name.toLowerCase()
        ) {
          result.componentNames.push(name);
        }
      }
    }

    // -----------------------------------------------------------------------
    // Call expressions (hooks, fetch, etc.)
    // -----------------------------------------------------------------------
    if (ts.isCallExpression(node)) {
      let callName: string | undefined;

      if (ts.isIdentifier(node.expression)) {
        callName = node.expression.text;
      } else if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.name)
      ) {
        callName = node.expression.name.text;
      }

      if (callName) {
        // Hook detection
        if (isHookName(callName)) {
          result.hookCalls.push(callName);
        }

        // Network detection
        if (NETWORK_IDENTIFIERS.has(callName)) {
          result.networkCalls.push(callName);
        }

        // State management hooks
        if (STATE_MANAGEMENT_PATTERNS.includes(callName)) {
          result.hookCalls.push(callName);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  // Deduplicate
  result.hookCalls = [...new Set(result.hookCalls)];
  result.networkCalls = [...new Set(result.networkCalls)];
  result.componentNames = [...new Set(result.componentNames)];
  result.exportedSymbols = [...new Set(result.exportedSymbols)];

  return result;
}

// ---------------------------------------------------------------------------
// Symbol comparison
// ---------------------------------------------------------------------------

function diffSets<T>(before: T[], after: T[]): { added: T[]; removed: T[] } {
  const beforeSet = new Set(before.map((x) => JSON.stringify(x)));
  const afterSet = new Set(after.map((x) => JSON.stringify(x)));

  const added = after.filter((x) => !beforeSet.has(JSON.stringify(x)));
  const removed = before.filter((x) => !afterSet.has(JSON.stringify(x)));
  return { added, removed };
}

// ---------------------------------------------------------------------------
// AstGuard — public API
// ---------------------------------------------------------------------------

export interface AstGuardOptions {
  /** Absolute path to project root. */
  projectRoot: string;
  /** Component names authorised by PatchPlan. */
  allowedComponents: string[];
}

/**
 * Analyse a single DiffFile using AST comparison.
 * Reads the before-source from disk (or empty string for new files).
 * Applies the diff in-memory to get the after-source.
 */
async function analyseFile(
  diffFile: DiffFile,
  options: AstGuardOptions
): Promise<AstFileAnalysis> {
  const file = diffFile.canonicalPath;
  const absolutePath = join(options.projectRoot, file);
  const violations: DiffViolation[] = [];
  const warnings: string[] = [];
  const changedComponents: string[] = [];
  const unauthorizedComponents: string[] = [];
  const hookChanges: HookChange[] = [];
  const importChanges: ImportChange[] = [];
  const exportChanges: ExportChange[] = [];
  const networkChanges: NetworkChange[] = [];

  // Only perform AST analysis on TypeScript/TSX/JS/JSX files
  const isTsOrJs = /\.(tsx?|jsx?)$/.test(file);
  if (!isTsOrJs) {
    return {
      file,
      changedComponents,
      unauthorizedComponents,
      hookChanges,
      importChanges,
      exportChanges,
      networkChanges,
      violations,
      warnings,
    };
  }

  // Read before-source
  let beforeSource = "";
  if (diffFile.changeType !== "created") {
    try {
      beforeSource = await readFile(absolutePath, "utf8");
    } catch {
      // File doesn't exist on disk — treat as empty (it might be a test fixture)
      warnings.push(`Could not read before-source for '${file}' — treating as empty`);
    }
  }

  // Build after-source by applying the diff in memory
  const beforeLines = beforeSource.split(/\r?\n/);
  const afterSource = applyDiffInMemory(beforeLines, diffFile);

  // Extract symbols from before and after
  const before = extractSymbols(beforeSource, file);
  const after = extractSymbols(afterSource, file);

  // -----------------------------------------------------------------------
  // Hook changes
  // -----------------------------------------------------------------------
  const hookDiff = diffSets(before.hookCalls, after.hookCalls);

  for (const h of hookDiff.added) {
    hookChanges.push({ hookName: h, file, component: "unknown", changeKind: "added" });
    violations.push({
      category: "hook_change",
      message: `Hook '${h}' was ADDED in '${file}' — visual patches must not modify hook logic`,
      file,
      detail: { type: "hook_change", after: h, reason: "hook added" },
    });
  }

  for (const h of hookDiff.removed) {
    hookChanges.push({ hookName: h, file, component: "unknown", changeKind: "removed" });
    violations.push({
      category: "hook_change",
      message: `Hook '${h}' was REMOVED in '${file}' — visual patches must not modify hook logic`,
      file,
      detail: { type: "hook_change", before: h, reason: "hook removed" },
    });
  }

  // -----------------------------------------------------------------------
  // Import changes
  // -----------------------------------------------------------------------
  const importDiff = diffSets(
    before.importSpecifiers.map((i) => i.specifier),
    after.importSpecifiers.map((i) => i.specifier)
  );

  for (const spec of importDiff.added) {
    const isExternal = !spec.startsWith(".") && !spec.startsWith("/") && !spec.startsWith("@/");
    // Determine if it's a protected module
    const isProtected =
      spec.includes("auth") ||
      spec.includes("db") ||
      spec.includes("database") ||
      spec.includes("prisma") ||
      spec.includes("server") ||
      spec.includes("actions");

    importChanges.push({
      file,
      changeKind: "added",
      moduleSpecifier: spec,
      isExternalPackage: isExternal,
      isProtectedModule: isProtected,
    });

    if (isExternal) {
      violations.push({
        category: "import_change",
        message: `External package import ADDED: '${spec}' in '${file}' — visual patches must not add dependencies`,
        file,
        detail: { type: "import_change", after: spec, reason: "new external package" },
      });
    } else if (isProtected) {
      violations.push({
        category: "import_change",
        message: `Protected module import ADDED: '${spec}' in '${file}'`,
        file,
        detail: { type: "import_change", after: spec, reason: "protected module" },
      });
    } else {
      warnings.push(`New internal import '${spec}' added in '${file}' — review required`);
    }
  }

  for (const spec of importDiff.removed) {
    importChanges.push({
      file,
      changeKind: "removed",
      moduleSpecifier: spec,
      isExternalPackage: !spec.startsWith("."),
      isProtectedModule: false,
    });
    // Removing an existing import is usually safe for visual changes — just warn
    warnings.push(`Import '${spec}' removed from '${file}'`);
  }

  // -----------------------------------------------------------------------
  // Export changes
  // -----------------------------------------------------------------------
  const exportDiff = diffSets(before.exportedSymbols, after.exportedSymbols);

  for (const sym of exportDiff.added) {
    exportChanges.push({ file, changeKind: "added", symbolName: sym });
    violations.push({
      category: "export_change",
      message: `Exported symbol '${sym}' was ADDED in '${file}' — visual patches must not change public API`,
      file,
      detail: { type: "export_change", after: sym, reason: "export added" },
    });
  }

  for (const sym of exportDiff.removed) {
    exportChanges.push({ file, changeKind: "removed", symbolName: sym });
    violations.push({
      category: "export_change",
      message: `Exported symbol '${sym}' was REMOVED in '${file}' — visual patches must not change public API`,
      file,
      detail: { type: "export_change", before: sym, reason: "export removed" },
    });
  }

  // -----------------------------------------------------------------------
  // Network / API changes
  // -----------------------------------------------------------------------
  const networkDiff = diffSets(before.networkCalls, after.networkCalls);

  for (const call of networkDiff.added) {
    networkChanges.push({ file, pattern: call, changeKind: "added" });
    violations.push({
      category: "api_change",
      message: `Network call '${call}' was ADDED in '${file}' — visual patches must not add API calls`,
      file,
      detail: { type: "api_change", after: call, reason: "network call added" },
    });
  }

  // -----------------------------------------------------------------------
  // Server action / route handler detection
  // -----------------------------------------------------------------------
  if (!before.hasUseServer && after.hasUseServer) {
    violations.push({
      category: "server_action_change",
      message: `'use server' directive ADDED in '${file}' — visual patches must not add server actions`,
      file,
      detail: { type: "server_action_change", reason: "'use server' added" },
    });
  }

  if (!before.hasServerRouteHandlers && after.hasServerRouteHandlers) {
    violations.push({
      category: "server_action_change",
      message: `Server route handler exports detected in '${file}' — not allowed in visual patches`,
      file,
      detail: { type: "server_action_change", reason: "route handler export added" },
    });
  }

  // -----------------------------------------------------------------------
  // Component boundary check
  // -----------------------------------------------------------------------
  const afterComponents = after.componentNames;
  const allowedSet = new Set(options.allowedComponents);

  for (const comp of afterComponents) {
    // Check if this component was present in before
    const wasBefore = before.componentNames.includes(comp);
    const isAuthorized = allowedSet.size === 0 || allowedSet.has(comp);

    if (!wasBefore) {
      // New component introduced
      if (!isAuthorized) {
        unauthorizedComponents.push(comp);
        violations.push({
          category: "component_boundary",
          message: `Component '${comp}' was ADDED in '${file}' — visual patches must not add new components`,
          file,
          component: comp,
        });
      }
    }
    changedComponents.push(comp);
  }

  return {
    file,
    changedComponents,
    unauthorizedComponents,
    hookChanges,
    importChanges,
    exportChanges,
    networkChanges,
    violations,
    warnings,
  };
}

/**
 * Run AST analysis across all files in a parsed diff.
 *
 * @param parsedDiff  The validated parsed diff.
 * @param plan        The PatchPlan constraining this mutation.
 * @param options     Path and component options.
 */
export async function runAstGuard(
  parsedDiff: ParsedDiff,
  plan: PatchPlan,
  options: AstGuardOptions
): Promise<AstAnalysisResult> {
  const fileResults: AstFileAnalysis[] = [];

  for (const diffFile of parsedDiff.files) {
    const result = await analyseFile(diffFile, {
      projectRoot: options.projectRoot,
      allowedComponents: plan.allowedComponents,
    });
    fileResults.push(result);
  }

  // Aggregate
  const allViolations = fileResults.flatMap((r) => r.violations);
  const allWarnings = fileResults.flatMap((r) => r.warnings);
  const allChangedFiles = fileResults.map((r) => r.file);
  const allChangedComponents = [...new Set(fileResults.flatMap((r) => r.changedComponents))];
  const allHookChanges = fileResults.flatMap((r) => r.hookChanges);
  const allImportChanges = fileResults.flatMap((r) => r.importChanges);
  const allExportChanges = fileResults.flatMap((r) => r.exportChanges);
  const allNetworkChanges = fileResults.flatMap((r) => r.networkChanges);

  // Compute risk
  const hasHookViolations = allViolations.some((v) => v.category === "hook_change");
  const hasApiViolations = allViolations.some((v) => v.category === "api_change");
  const hasExportViolations = allViolations.some((v) => v.category === "export_change");

  let risk: "low" | "medium" | "high" = "low";
  if (hasHookViolations || hasApiViolations) {
    risk = "high";
  } else if (hasExportViolations || allViolations.length > 0) {
    risk = "medium";
  }

  return {
    valid: allViolations.length === 0,
    violations: allViolations,
    warnings: allWarnings,
    changedFiles: allChangedFiles,
    changedComponents: allChangedComponents,
    changedHooks: allHookChanges,
    changedImports: allImportChanges,
    changedExports: allExportChanges,
    changedNetworkOperations: allNetworkChanges,
    additions: parsedDiff.totalAdditions,
    deletions: parsedDiff.totalDeletions,
    risk,
  };
}
