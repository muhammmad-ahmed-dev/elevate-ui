import type { Finding } from "./types.js";

export class FindingDeduplicator {
  private static normalizeSelector(selector?: string): string {
    if (!selector) return "";
    return selector.trim().toLowerCase().replace(/\s+/g, " ");
  }

  private static areFindingsDuplicate(a: Finding, b: Finding): boolean {
    // 1. Same category is mandatory for deduplication
    if (a.category !== b.category) {
      return false;
    }

    // 2. Same viewport is required
    if (a.viewport !== b.viewport) {
      return false;
    }

    const selA = this.normalizeSelector(a.selector);
    const selB = this.normalizeSelector(b.selector);

    // 3. Match on identical selector if selector is available
    if (selA && selB && selA === selB) {
      return true;
    }

    // 4. Overlapping bounding box match if selectors are generic or missing
    if (a.boundingBox && b.boundingBox) {
      const boxA = a.boundingBox;
      const boxB = b.boundingBox;
      const xOverlap = Math.max(0, Math.min(boxA.right, boxB.right) - Math.max(boxA.left, boxB.left));
      const yOverlap = Math.max(0, Math.min(boxA.bottom, boxB.bottom) - Math.max(boxA.top, boxB.top));
      const overlapArea = xOverlap * yOverlap;
      const areaA = boxA.width * boxA.height;
      const areaB = boxB.width * boxB.height;
      const minArea = Math.min(areaA, areaB);

      if (minArea > 0 && overlapArea / minArea > 0.8) {
        return true;
      }
    }

    // 5. Match identical title on same viewport
    if (a.title.trim().toLowerCase() === b.title.trim().toLowerCase()) {
      return true;
    }

    return false;
  }

  private static mergeFindings(primary: Finding, duplicate: Finding): Finding {
    // Prefer deterministic finding as primary base if available
    const base = primary.deterministic ? primary : (duplicate.deterministic ? duplicate : primary);
    const other = base === primary ? duplicate : primary;

    const mergedConfidence = Math.min(1.0, Math.max(base.confidence, other.confidence) + (base.source !== other.source ? 0.1 : 0.0));
    
    // Pick higher severity
    const severityRank: Record<string, number> = {
      critical: 5,
      serious: 4,
      moderate: 3,
      minor: 2,
      info: 1,
    };
    const highestSeverity = (severityRank[base.severity] || 0) >= (severityRank[other.severity] || 0) ? base.severity : other.severity;

    return {
      ...base,
      severity: highestSeverity,
      confidence: mergedConfidence,
      description: base.description || other.description,
      evidence: {
        ...other.evidence,
        ...base.evidence,
        corroboratedBy: other.source,
      },
      proposedImprovement: base.proposedImprovement || other.proposedImprovement,
    };
  }

  public static deduplicate(findings: Finding[]): Finding[] {
    const deduplicated: Finding[] = [];

    for (const finding of findings) {
      const existingIndex = deduplicated.findIndex((existing) => this.areFindingsDuplicate(existing, finding));

      if (existingIndex >= 0) {
        deduplicated[existingIndex] = this.mergeFindings(deduplicated[existingIndex], finding);
      } else {
        deduplicated.push(finding);
      }
    }

    return deduplicated;
  }
}
