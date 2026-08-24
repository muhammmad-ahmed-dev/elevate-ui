/**
 * Phase 3: ComponentLocator
 *
 * Maps a MutationRecommendation (which contains CSS selectors, component names,
 * and viewport evidence) to concrete source files in the project.
 *
 * Design principles:
 * - Only returns HIGH/MEDIUM confidence when evidence supports the claim.
 * - Returns AMBIGUOUS and refuses to mutate when the target cannot be identified
 *   with sufficient confidence.
 * - Never guesses ("Hero selector = Hero.tsx") without supporting evidence.
 * - Read-only: does not modify any file.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, extname, basename } from "node:path";
import type { MutationRecommendation } from "../analysis/types.js";
import type {
  ComponentLocatorResult,
  LocatorCandidate,
  LocatorConfidence,
} from "./types.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ComponentLocatorOptions {
  /** Absolute path to the project root to search. */
  projectRoot: string;
  /**
   * Sub-directories to search (relative to projectRoot).
   * Defaults to common Next.js/React source patterns.
   */
  searchDirs?: string[];
  /**
   * Confidence threshold below which the result is considered ambiguous.
   * Default: 0.5
   */
  ambiguityThreshold?: number;
  /**
   * Maximum number of candidate files to return.
   * Default: 5
   */
  maxCandidates?: number;
}

// Source file extensions we consider React/TSX source
const REACT_EXTENSIONS = new Set([".tsx", ".jsx", ".ts", ".js"]);
const REACT_COMPONENT_EXTENSIONS = new Set([".tsx", ".jsx"]);

// Default search directories for Next.js / React projects
const DEFAULT_SEARCH_DIRS = [
  "src/components",
  "src/app",
  "src/pages",
  "components",
  "app",
  "pages",
  "src",
];

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Extract component names (PascalCase function/const declarations) from source text. */
function extractComponentNames(source: string): string[] {
  const names = new Set<string>();

  // `export default function HeroSection` / `function HeroSection`
  for (const m of source.matchAll(/(?:export\s+(?:default\s+)?)?function\s+([A-Z][a-zA-Z0-9_]*)/g)) {
    names.add(m[1]);
  }
  // `const HeroSection = ` / `export const HeroSection =`
  for (const m of source.matchAll(/(?:export\s+)?const\s+([A-Z][a-zA-Z0-9_]*)\s*=/g)) {
    names.add(m[1]);
  }
  // `class HeroSection`
  for (const m of source.matchAll(/class\s+([A-Z][a-zA-Z0-9_]*)/g)) {
    names.add(m[1]);
  }

  return Array.from(names);
}

/**
 * Parse class names from a CSS selector string.
 *
 * Examples:
 *   ".hero h1"         → ["hero"]
 *   "button.cta-btn"   → ["cta-btn"]
 *   "#hero-section"    → []  (ID, not class)
 */
function extractClassesFromSelector(selector: string): string[] {
  const classes: string[] = [];
  for (const m of selector.matchAll(/\.([a-zA-Z0-9_-]+)/g)) {
    classes.push(m[1]);
  }
  return classes;
}

/**
 * Parse tag name from selector (e.g. "button.cta" → "button").
 */
function extractTagFromSelector(selector: string): string | undefined {
  const m = selector.match(/^([a-z][a-zA-Z0-9]*)/);
  return m ? m[1] : undefined;
}

/**
 * Extracts all Tailwind-style class tokens from source text.
 * Very broad — looks for JSX className strings.
 */
function extractTailwindClasses(source: string): Set<string> {
  const classes = new Set<string>();
  // className="..." or className={`...`}
  for (const m of source.matchAll(/className[=\s]*["'`]([^"'`]+)["'`]/g)) {
    for (const cls of m[1].split(/\s+/)) {
      if (cls) classes.add(cls.trim());
    }
  }
  return classes;
}

/**
 * Score how well a source file matches a set of selectors and component hints.
 * Returns a numeric score (higher is better).
 */
function scoreCandidate(
  source: string,
  filePath: string,
  selectors: string[],
  componentNames: string[],
  proposedImprovement: string
): { score: number; matchedSelectors: string[]; matchedClasses: string[]; evidence: string[] } {
  const evidence: string[] = [];
  const matchedSelectors: string[] = [];
  const matchedClasses: string[] = [];
  let score = 0;

  const fileBaseName = basename(filePath, extname(filePath));
  const tailwindClasses = extractTailwindClasses(source);
  const sourceComponentNames = extractComponentNames(source);
  const isReactFile = REACT_COMPONENT_EXTENSIONS.has(extname(filePath));

  // 1. Component name match (strong signal)
  for (const compName of componentNames) {
    if (sourceComponentNames.some(
      (n) => n.toLowerCase() === compName.toLowerCase()
    )) {
      score += 30;
      evidence.push(`Component name '${compName}' found in file`);
    }
    // Component name appears in the file basename
    if (fileBaseName.toLowerCase().includes(compName.toLowerCase())) {
      score += 20;
      evidence.push(`File basename '${fileBaseName}' matches component '${compName}'`);
    }
  }

  // 2. Selector matching
  for (const selector of selectors) {
    const classes = extractClassesFromSelector(selector);
    const tag = extractTagFromSelector(selector);

    // Class appears in source (in className or in class attribute)
    for (const cls of classes) {
      if (tailwindClasses.has(cls) || source.includes(cls)) {
        score += 15;
        matchedSelectors.push(selector);
        matchedClasses.push(cls);
        evidence.push(`Class '${cls}' from selector '${selector}' found in source`);
        break; // Don't double-count the same selector
      }
    }

    // JSX tag appears in source (e.g. "button", "input")
    if (tag && isReactFile) {
      const tagRegex = new RegExp(`<${tag}[\\s/>]`, "i");
      if (tagRegex.test(source)) {
        score += 5;
        evidence.push(`Tag '${tag}' from selector '${selector}' found in JSX`);
      }
    }
  }

  // 3. Proposed improvement text contains a class or word found in the file
  const improvementWords = proposedImprovement.match(/[a-zA-Z][\w-]{2,}/g) ?? [];
  for (const word of improvementWords) {
    if (tailwindClasses.has(word) || source.includes(word)) {
      score += 3;
    }
  }

  // 4. React component file bonus
  if (isReactFile) {
    score += 5;
    evidence.push("File is a React/TSX component");
  }

  return {
    score,
    matchedSelectors: Array.from(new Set(matchedSelectors)),
    matchedClasses: Array.from(new Set(matchedClasses)),
    evidence,
  };
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/** Recursively collect all source files under a directory. */
async function collectSourceFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    // Skip hidden dirs, node_modules, dist, .next, etc.
    if (
      entry.name.startsWith(".") ||
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === ".next" ||
      entry.name === ".turbo" ||
      entry.name === "out"
    ) {
      continue;
    }

    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await collectSourceFiles(fullPath);
      results.push(...sub);
    } else if (REACT_EXTENSIONS.has(extname(entry.name))) {
      results.push(fullPath);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// ComponentLocator — main class
// ---------------------------------------------------------------------------

export class ComponentLocator {
  private projectRoot: string;
  private searchDirs: string[];
  private ambiguityThreshold: number;
  private maxCandidates: number;

  constructor(options: ComponentLocatorOptions) {
    this.projectRoot = options.projectRoot;
    this.searchDirs = options.searchDirs ?? DEFAULT_SEARCH_DIRS;
    this.ambiguityThreshold = options.ambiguityThreshold ?? 0.5;
    this.maxCandidates = options.maxCandidates ?? 5;
  }

  /**
   * Locate the source file(s) most likely to contain the UI element described
   * by the given MutationRecommendation.
   *
   * @returns ComponentLocatorResult — always returns a result, never throws.
   */
  public async locate(recommendation: MutationRecommendation): Promise<ComponentLocatorResult> {
    try {
      return await this._locate(recommendation);
    } catch (err: any) {
      return {
        recommendationId: recommendation.id,
        confidence: "ambiguous",
        candidates: [],
        isAmbiguous: true,
        summary: `ComponentLocator threw an unexpected error: ${err.message}`,
      };
    }
  }

  private async _locate(recommendation: MutationRecommendation): Promise<ComponentLocatorResult> {
    const recId = recommendation.id;

    // Collect all source selectors from the recommendation
    const selectors: string[] = [];
    if (recommendation.affectedSelector) {
      selectors.push(recommendation.affectedSelector);
    }

    // Component names hinted by the recommendation (from affectedComponents)
    const hintedComponents = recommendation.affectedComponents ?? [];

    // Evidence from the problem description and improvement text
    const proposedImprovement = recommendation.proposedImprovement ?? "";

    // Discover candidate files
    const candidateFiles = await this._discoverFiles();

    if (candidateFiles.length === 0) {
      return {
        recommendationId: recId,
        confidence: "ambiguous",
        candidates: [],
        isAmbiguous: true,
        summary: "No source files found in the configured search directories.",
      };
    }

    // Score each file
    const scoredCandidates: (LocatorCandidate & { rawScore: number })[] = [];

    for (const filePath of candidateFiles) {
      let source: string;
      try {
        source = await readFile(filePath, "utf-8");
      } catch {
        continue;
      }

      const rel = relative(this.projectRoot, filePath).replace(/\\/g, "/");
      const componentNames = extractComponentNames(source);
      const isReactComponent = REACT_COMPONENT_EXTENSIONS.has(extname(filePath));

      const { score, matchedSelectors, matchedClasses, evidence } = scoreCandidate(
        source,
        filePath,
        selectors,
        hintedComponents,
        proposedImprovement
      );

      if (score === 0) continue; // No signal at all — skip

      scoredCandidates.push({
        absolutePath: filePath,
        relativePath: rel,
        evidence,
        confidence: 0, // Filled in after normalisation
        matchedSelectors,
        matchedTailwindClasses: matchedClasses,
        componentNames,
        isReactComponent,
        rawScore: score,
      });
    }

    if (scoredCandidates.length === 0) {
      return {
        recommendationId: recId,
        confidence: "ambiguous",
        candidates: [],
        isAmbiguous: true,
        summary:
          "No source files matched the selectors, component names, or improvement tokens in the recommendation. The target cannot be located with sufficient confidence.",
      };
    }

    // Sort descending by score
    scoredCandidates.sort((a, b) => b.rawScore - a.rawScore);

    // Keep raw scores before destructuring for threshold checks
    const topRawScore = scoredCandidates[0].rawScore;

    // Normalise scores to [0, 1] relative to the highest score
    const maxScore = topRawScore;
    const candidates: LocatorCandidate[] = scoredCandidates
      .slice(0, this.maxCandidates)
      .map(({ rawScore, ...rest }) => ({
        ...rest,
        confidence: maxScore > 0 ? rawScore / maxScore : 0,
      }));

    // Determine overall confidence
    const topScore = candidates[0].confidence; // always 1.0 (normalised)
    const secondScore = candidates[1]?.confidence ?? 0;

    let overallConfidence: LocatorConfidence;
    let isAmbiguous = false;
    let summary: string;

    if (topRawScore < 15) {
      // Very weak signal overall
      overallConfidence = "low";
      isAmbiguous = true;
      summary = `Weak match (score ${topRawScore}). Refusing to auto-select target — manual review required.`;
    } else if (secondScore >= 0.75) {
      // Two files are nearly equally likely — ambiguous
      overallConfidence = "ambiguous";
      isAmbiguous = true;
      summary = `Multiple files matched with similar confidence (top: ${candidates[0].relativePath}, second: ${candidates[1]?.relativePath}). Cannot auto-select.`;
    } else if (topScore === 1.0 && secondScore < 0.5) {
      // Clear winner
      overallConfidence = "high";
      summary = `High-confidence match: ${candidates[0].relativePath} (evidence: ${candidates[0].evidence.join("; ")})`;
    } else {
      overallConfidence = "medium";
      summary = `Moderate-confidence match: ${candidates[0].relativePath}. Consider manual review.`;
    }

    return {
      recommendationId: recId,
      confidence: overallConfidence,
      candidates,
      primaryCandidate: isAmbiguous ? undefined : candidates[0],
      isAmbiguous,
      summary,
    };
  }

  /** Collect source files from configured search directories. */
  private async _discoverFiles(): Promise<string[]> {
    const seen = new Set<string>();
    const results: string[] = [];

    for (const searchDir of this.searchDirs) {
      const absDir = join(this.projectRoot, searchDir);
      try {
        await stat(absDir); // Verify it exists
      } catch {
        continue; // Directory doesn't exist — skip silently
      }

      const files = await collectSourceFiles(absDir);
      for (const f of files) {
        if (!seen.has(f)) {
          seen.add(f);
          results.push(f);
        }
      }
    }

    // If configured search dirs yielded nothing, fall back to the project root
    if (results.length === 0) {
      const rootFiles = await collectSourceFiles(this.projectRoot);
      for (const f of rootFiles) {
        if (!seen.has(f)) {
          seen.add(f);
          results.push(f);
        }
      }
    }

    return results;
  }
}
