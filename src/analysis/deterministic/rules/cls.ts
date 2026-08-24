import type { DeterministicRule, RuleInspectionContext } from "./types.js";
import type { Finding } from "../../types.js";

export class CLSRule implements DeterministicRule {
  public readonly name = "CumulativeLayoutShiftRule";

  public evaluate(context: RuleInspectionContext): Finding[] {
    const findings: Finding[] = [];
    const clsMetrics = context.extraction.clsMetrics;

    if (!clsMetrics) {
      return findings;
    }

    if (!clsMetrics.isMeasurable) {
      // Metric not supported/measurable in current static snapshot environment
      return findings;
    }

    // If unsized media hazards were detected in the DOM extraction
    if (clsMetrics.hazardElementsCount && clsMetrics.hazardElementsCount > 0) {
      findings.push({
        id: `cls-hazard-${context.viewport.name}`,
        category: "layout-shift",
        severity: "minor",
        title: `Unsized image layout shift hazard (${clsMetrics.hazardElementsCount} elements)`,
        description: `Found ${clsMetrics.hazardElementsCount} image elements without explicit width, height, or aspect-ratio attributes on ${context.viewport.label}. Unsized media can trigger Cumulative Layout Shifts during initial rendering.`,
        evidence: {
          hazardElementsCount: clsMetrics.hazardElementsCount,
          isMeasurable: true,
          measuredScore: clsMetrics.score,
        },
        viewport: context.viewport.name,
        source: "deterministic",
        deterministic: true,
        confidence: 0.85,
        proposedImprovement: "Add explicit width/height dimensions or Tailwind aspect-ratio utility classes (e.g. aspect-video, aspect-square) to pre-allocate rendering dimensions.",
      });
    }

    return findings;
  }
}
