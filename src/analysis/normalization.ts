import type { Finding, FindingCategory, FindingSeverity, FindingSource } from "./types.js";
import { VALID_CATEGORIES } from "./heuristic/providers/base.js";

const VALID_SEVERITIES: Set<FindingSeverity> = new Set([
  "critical",
  "serious",
  "moderate",
  "minor",
  "info",
]);

export class FindingNormalizer {
  public static normalize(findings: Finding[]): Finding[] {
    return findings.map((f, index) => {
      const category: FindingCategory = VALID_CATEGORIES.has(f.category) ? f.category : "visual-hierarchy";
      const severity: FindingSeverity = VALID_SEVERITIES.has(f.severity) ? f.severity : "moderate";
      const source: FindingSource = f.source === "heuristic" ? "heuristic" : "deterministic";
      const deterministic = source === "deterministic";
      const confidence = typeof f.confidence === "number" && !isNaN(f.confidence)
        ? Math.max(0.1, Math.min(1.0, f.confidence))
        : (deterministic ? 1.0 : 0.8);

      const selector = f.selector ? f.selector.trim() : undefined;
      const id = f.id && f.id.trim() ? f.id.trim() : `finding-${category}-${f.viewport}-${index + 1}`;

      return {
        ...f,
        id,
        category,
        severity,
        source,
        deterministic,
        confidence,
        selector,
        title: f.title ? f.title.trim() : `Issue in ${category}`,
        description: f.description ? f.description.trim() : "",
        evidence: f.evidence && typeof f.evidence === "object" ? f.evidence : { raw: String(f.evidence || "") },
      };
    });
  }
}
