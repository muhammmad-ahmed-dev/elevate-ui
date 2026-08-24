import type {
  PrioritizedFinding,
  MutationRecommendation,
  MutationScope,
  MutationRisk,
} from "./types.js";
import type { ViewportName } from "../browser/types.js";

export class IssueSynthesizer {
  private static determineScope(category: string): MutationScope {
    switch (category) {
      case "touch-target":
      case "broken-image":
      case "color-contrast":
      case "cta-prominence":
        return "single-element";
      case "heading-hierarchy":
      case "visual-hierarchy":
      case "typography":
      case "spacing":
      case "brand-rhythm":
      case "accessibility":
        return "component";
      case "overflow":
      case "layout-shift":
      case "composition":
      case "responsive-integrity":
      default:
        return "layout";
    }
  }

  private static determineRisk(category: string, affectedViewportsCount: number): MutationRisk {
    if (category === "overflow" || category === "responsive-integrity" || affectedViewportsCount >= 3) {
      return "medium";
    }
    if (category === "touch-target" || category === "color-contrast" || category === "broken-image") {
      return "low";
    }
    return "low";
  }

  public static synthesize(
    prioritizedFindings: PrioritizedFinding[],
    maxRecommendations: number = 5,
    _minRecommendations: number = 3
  ): MutationRecommendation[] {
    if (prioritizedFindings.length === 0) {
      return [];
    }

    const recommendations: MutationRecommendation[] = [];
    const processedSelectors = new Set<string>();

    // 1. Group top prioritized findings by selector/component theme to create cohesive recommendations
    for (const item of prioritizedFindings) {
      const finding = item.finding;
      const selectorKey = (finding.selector || `${finding.category}-${finding.title}`).trim().toLowerCase();

      // If we already have a recommendation for this exact selector, skip or merge
      const existingRec = recommendations.find((r) => {
        if (!r.affectedSelector || !finding.selector) return false;
        return r.affectedSelector.toLowerCase() === finding.selector.toLowerCase();
      });

      if (existingRec) {
        if (!existingRec.affectedViewports.includes(finding.viewport)) {
          existingRec.affectedViewports.push(finding.viewport);
        }
        if (!existingRec.sourceFindingIds.includes(finding.id)) {
          existingRec.sourceFindingIds.push(finding.id);
        }
        existingRec.evidence = { ...existingRec.evidence, [`evidence_${finding.viewport}`]: finding.evidence };
        continue;
      }

      // Collect all viewports where this finding or related findings on this selector appear
      const relatedFindings = prioritizedFindings.filter((p) => {
        if (p.finding.selector && finding.selector) {
          return p.finding.selector.toLowerCase() === finding.selector.toLowerCase();
        }
        return p.finding.category === finding.category && p.finding.title === finding.title;
      });

      const affectedViewports: ViewportName[] = Array.from(
        new Set(relatedFindings.map((rf) => rf.finding.viewport))
      );

      const sourceFindingIds = Array.from(
        new Set(relatedFindings.map((rf) => rf.finding.id))
      );
      const combinedEvidence: Record<string, unknown> = {
        primaryIssue: finding.title,
        category: finding.category,
        severity: finding.severity,
        ...finding.evidence,
      };

      const scope = this.determineScope(finding.category);
      const risk = this.determineRisk(finding.category, affectedViewports.length);

      const proposedImprovement = finding.proposedImprovement ||
        `Refine ${finding.selector || finding.category} to address ${finding.title.toLowerCase()} across ${affectedViewports.join(", ")}.`;

      const recommendation: MutationRecommendation = {
        id: `rec-${recommendations.length + 1}-${finding.category}`,
        problem: `${finding.title}: ${finding.description}`,
        evidence: combinedEvidence,
        affectedSelector: finding.selector,
        affectedComponents: finding.affectedComponents,
        affectedViewports,
        proposedImprovement,
        rationale: item.rationale,
        confidence: finding.confidence,
        estimatedMutationScope: scope,
        risk,
        sourceFindingIds,
      };

      recommendations.push(recommendation);
      processedSelectors.add(selectorKey);

      if (recommendations.length >= maxRecommendations) {
        break;
      }
    }

    // Return the synthesized recommendations (capped at maxRecommendations, between 1 and 5)
    return recommendations.slice(0, maxRecommendations);
  }
}
