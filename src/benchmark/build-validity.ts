/**
 * Phase 5B: Deterministic Build Validity & DOM Completeness Detector
 *
 * Deterministically analyzes rendered markup and workspace structure to distinguish
 * functioning websites from empty bodies, generic placeholders, and unrendered stubs.
 */

import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import type {
  BuildValidityResult,
  EffectiveOutcome,
  TaskExpectedSignals,
} from "./comparison-types.js";

export interface BuildValidityInput {
  workspaceRoot: string;
  entryPath?: string;
  rawMarkup?: string;
  serverStarted?: boolean;
  routeReachable?: boolean;
  htmlReturned?: boolean;
  statusCode?: number;
  browserConsoleErrors?: string[];
  runtimeErrors?: string[];
  expectedSignals?: TaskExpectedSignals;
  regressionCount?: number;
  resolvedFindingCount?: number;
  acceptanceCriteriaRate?: number;
  safetyFailure?: boolean;
  infrastructureFailure?: boolean;
}

export class BuildValidityDetector {
  /**
   * Deterministically evaluates build validity and completeness from the workspace state
   * and rendered preview output.
   */
  public static async evaluate(input: BuildValidityInput): Promise<BuildValidityResult> {
    const serverStarted = input.serverStarted ?? true;
    const routeReachable = input.routeReachable ?? true;
    const htmlReturned = input.htmlReturned ?? true;
    const statusCode = input.statusCode ?? 200;
    const browserConsoleErrors = [...(input.browserConsoleErrors || [])];
    const runtimeErrors = [...(input.runtimeErrors || [])];

    if (statusCode >= 500) {
      runtimeErrors.push(`HTTP ${statusCode} Server Error`);
    }

    // 1. Retrieve markup from memory or disk
    let markup = input.rawMarkup || "";
    if (!markup && input.workspaceRoot) {
      markup = await this.extractWorkspaceMarkup(input.workspaceRoot, input.entryPath);
    }

    // 2. Parse clean text and DOM structure deterministically
    const cleanText = this.extractCleanText(markup);
    const elements = this.countMatches(markup, /<([a-zA-Z0-9-]+)(?:\s+[^>]*)?>/g);
    const interactive = this.countMatches(
      markup,
      /<(button|a|input|select|textarea)(?:\s+[^>]*)?>|role=["']button["']/gi
    );
    const headings = this.countMatches(markup, /<h[1-6](?:\s+[^>]*)?>/gi);
    const sections = this.countMatches(
      markup,
      /<(section|article|main|nav|header|footer|aside)(?:\s+[^>]*)?>|<div[^>]*(?:class|id)=["'][^"']*(?:section|container|hero|grid|card|pricing|feature|portfolio|about|contact|footer|header)[^"']*["']/gi
    );

    const contentDensity = {
      textLength: cleanText.length,
      elementCount: elements,
      interactiveCount: interactive,
      sectionCount: sections,
      headingCount: headings,
    };

    // 3. Detect blank page
    const blankPageDetected = cleanText.length < 5 && elements < 3;

    // 4. Detect default framework starter page
    const isStarterBoilerplate =
      /Vite\s*\+\s*React/i.test(markup) ||
      /Edit\s*<code>src\/App\.tsx<\/code>/i.test(markup) ||
      /Welcome\s*to\s*React/i.test(markup) ||
      /create-react-app/i.test(markup);

    // 5. Detect trivial stub (e.g. single generic div or under 80 characters of text with no real content)
    const isTrivialStub =
      !isStarterBoilerplate &&
      (cleanText.length < 80 || (elements <= 4 && headings <= 1 && sections <= 1)) &&
      !this.hasSufficientTaskSignals(cleanText, markup, input.expectedSignals);

    const stubPageDetected = isStarterBoilerplate || isTrivialStub;
    const bodyPresent = !blankPageDetected && elements > 0;
    const meaningfulDomPresent =
      bodyPresent &&
      !stubPageDetected &&
      cleanText.length >= 80 &&
      elements >= 5 &&
      (headings >= 1 || interactive >= 1);

    // 6. Match expected structural signals
    const signals = input.expectedSignals;
    const matchedSections: string[] = [];
    const missingSections: string[] = [];
    const matchedKeywords: string[] = [];

    if (signals?.expectedSections && signals.expectedSections.length > 0) {
      for (const section of signals.expectedSections) {
        const secRegex = new RegExp(
          `id=["'][^"']*${this.escapeRegex(section)}[^"']*["']|class=["'][^"']*${this.escapeRegex(
            section
          )}[^"']*["']|<h[1-6][^>]*>[^<]*${this.escapeRegex(section)}[^<]*<\\/h[1-6]>|${this.escapeRegex(
            section
          )}`,
          "i"
        );
        if (secRegex.test(markup) || secRegex.test(cleanText)) {
          matchedSections.push(section);
        } else {
          missingSections.push(section);
        }
      }
    }

    if (signals?.expectedKeywords && signals.expectedKeywords.length > 0) {
      for (const kw of signals.expectedKeywords) {
        const kwRegex = new RegExp(`\\b${this.escapeRegex(kw)}\\b`, "i");
        if (kwRegex.test(cleanText) || kwRegex.test(markup)) {
          matchedKeywords.push(kw);
        }
      }
    }

    // Expected structure is present if no explicit sections were required OR at least 50% matched
    const expectedStructurePresent =
      !signals?.expectedSections ||
      signals.expectedSections.length === 0 ||
      matchedSections.length >= Math.ceil(signals.expectedSections.length * 0.5);

    // 7. Determine overall build validity boolean
    const hasFatalRuntimeErrors =
      runtimeErrors.length > 0 ||
      browserConsoleErrors.some((err) => /Uncaught\s*(Error|TypeError|SyntaxError)/i.test(err));

    const buildValid =
      serverStarted &&
      routeReachable &&
      htmlReturned &&
      bodyPresent &&
      meaningfulDomPresent &&
      !hasFatalRuntimeErrors;

    // 8. Determine Effective Outcome
    let effectiveOutcome: EffectiveOutcome;
    let reason = "Valid functioning build";

    if (input.safetyFailure) {
      effectiveOutcome = "SAFETY_FAILURE";
      reason = "Safety invariants or mutation transaction breached";
    } else if (input.infrastructureFailure || !serverStarted || !routeReachable) {
      effectiveOutcome = "INFRASTRUCTURE_FAILURE";
      reason = "Server failed to start or route was unreachable";
    } else if (!buildValid) {
      effectiveOutcome = "INVALID_BUILD";
      if (hasFatalRuntimeErrors) {
        reason = `Uncaught runtime errors detected: ${[...runtimeErrors, ...browserConsoleErrors].join("; ")}`;
      } else if (blankPageDetected) {
        reason = "Rendered DOM is empty or whitespace-only";
      } else if (isStarterBoilerplate) {
        reason = "Default framework starter boilerplate detected without task content";
      } else if (isTrivialStub) {
        reason = `Trivial unrendered stub detected (${cleanText.length} text chars, ${elements} DOM elements)`;
      } else {
        reason = "DOM lacks meaningful structure and interactive elements";
      }
    } else if ((input.regressionCount || 0) > 0) {
      effectiveOutcome = "VALID_BUILD_REGRESSED";
      reason = `Valid build completed with ${input.regressionCount} visual/functional regression(s)`;
    } else if ((input.resolvedFindingCount || 0) > 0 || (input.acceptanceCriteriaRate || 0) >= 0.7) {
      effectiveOutcome = "VALID_BUILD_IMPROVED";
      reason = "Valid build completed with measurable defect resolution and high acceptance satisfaction";
    } else {
      effectiveOutcome = "VALID_BUILD";
      reason = "Valid functioning build with clean execution";
    }

    return {
      serverStarted,
      routeReachable,
      htmlReturned,
      bodyPresent,
      meaningfulDomPresent,
      expectedStructurePresent,
      contentDensity,
      blankPageDetected,
      stubPageDetected,
      runtimeErrors,
      browserConsoleErrors,
      buildValid,
      effectiveOutcome,
      reason,
      matchedSections,
      missingSections,
      matchedKeywords,
    };
  }

  /**
   * Reads workspace entry component or scans for JSX/TSX files.
   */
  private static async extractWorkspaceMarkup(workspaceRoot: string, entryPath?: string): Promise<string> {
    try {
      if (entryPath) {
        const absEntry = resolve(workspaceRoot, entryPath);
        if (existsSync(absEntry)) {
          return await readFile(absEntry, "utf8");
        }
      }

      // Check src/components or src/
      const candidates = [
        resolve(workspaceRoot, "src", "components"),
        resolve(workspaceRoot, "src"),
        resolve(workspaceRoot, "components"),
      ];

      for (const dir of candidates) {
        if (existsSync(dir)) {
          const entries = await readdir(dir);
          for (const entry of entries) {
            if (entry.endsWith(".tsx") || entry.endsWith(".jsx") || entry.endsWith(".html")) {
              return await readFile(join(dir, entry), "utf8");
            }
          }
        }
      }
    } catch {
      // Return empty if read fails
    }
    return "";
  }

  /**
   * Extracts clean visible text from HTML/JSX markup.
   */
  private static extractCleanText(markup: string): string {
    return markup
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/import\s+[\s\S]*?from\s+['"].*?['"];?/g, " ")
      .replace(/export\s+default\s+function\s+.*?\{/g, " ")
      .replace(/className=["'][^"']*["']/gi, " ")
      .replace(/class=["'][^"']*["']/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\{[^}]+\}/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Helper to count regex matches in a string.
   */
  private static countMatches(text: string, regex: RegExp): number {
    const matches = text.match(regex);
    return matches ? matches.length : 0;
  }

  /**
   * Helper to check if task expected signals are satisfied.
   */
  private static hasSufficientTaskSignals(
    cleanText: string,
    markup: string,
    signals?: TaskExpectedSignals
  ): boolean {
    if (!signals) return false;
    let matches = 0;
    if (signals.expectedKeywords) {
      for (const kw of signals.expectedKeywords) {
        if (new RegExp(`\\b${this.escapeRegex(kw)}\\b`, "i").test(cleanText)) {
          matches++;
        }
      }
    }
    return matches >= 2;
  }

  private static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
