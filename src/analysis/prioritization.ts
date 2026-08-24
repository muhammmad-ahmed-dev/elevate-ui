import type { Finding, PrioritizedFinding, PrioritizationFactors } from "./types.js";

export class FindingPrioritizer {
  private static calculateScore(
    finding: Finding,
    allFindings: Finding[]
  ): { score: number; factors: PrioritizationFactors; rationale: string } {
    // 1. Severity weight
    const severityMap: Record<string, number> = {
      critical: 100,
      serious: 70,
      moderate: 40,
      minor: 20,
      info: 10,
    };
    const severityWeight = severityMap[finding.severity] || 30;

    // 2. Viewport breadth (how many viewports share this category & selector)
    const matchingViewports = new Set(
      allFindings
        .filter((f) => f.category === finding.category && f.selector && f.selector === finding.selector)
        .map((f) => f.viewport)
    );
    const viewportBreadth = Math.max(1, matchingViewports.size) * 15;

    // 3. Confidence weight (0 to 20)
    const confidenceWeight = Math.round(finding.confidence * 20);

    // 4. Deterministic bonus (objective binary verification)
    const deterministicBonus = finding.deterministic ? 15 : 0;

    // 5. User-visible impact category bonus
    const impactMap: Record<string, number> = {
      overflow: 25,
      "broken-image": 25,
      "touch-target": 20,
      accessibility: 15,
      "visual-hierarchy": 15,
      "color-contrast": 15,
      "cta-prominence": 10,
      "heading-hierarchy": 10,
      "layout-shift": 10,
      typography: 5,
      spacing: 5,
      "brand-rhythm": 5,
      composition: 5,
      "responsive-integrity": 15,
    };
    const userVisibleImpact = impactMap[finding.category] || 5;

    const score = severityWeight + viewportBreadth + confidenceWeight + deterministicBonus + userVisibleImpact;

    const factors: PrioritizationFactors = {
      severityWeight,
      viewportBreadth,
      confidenceWeight,
      deterministicBonus,
      userVisibleImpact,
    };

    const reasons: string[] = [];
    if (severityWeight >= 70) reasons.push(`${finding.severity.toUpperCase()} severity level`);
    if (matchingViewports.size > 1) reasons.push(`reproduced across ${matchingViewports.size} viewports`);
    if (deterministicBonus > 0) reasons.push("verified deterministically");
    if (userVisibleImpact >= 20) reasons.push(`high user-visible impact (${finding.category})`);

    const rationale = reasons.length > 0
      ? `Ranked based on: ${reasons.join(", ")} (Score: ${score}).`
      : `Ranked based on standard ${finding.category} severity scoring (Score: ${score}).`;

    return { score, factors, rationale };
  }

  public static prioritize(findings: Finding[]): PrioritizedFinding[] {
    const scored = findings.map((finding) => {
      const { score, factors, rationale } = this.calculateScore(finding, findings);
      return {
        finding,
        score,
        factors,
        rationale,
      };
    });

    // Sort descending by score; if tied, sort deterministically by id
    scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.finding.id.localeCompare(b.finding.id);
    });

    return scored.map((item, index) => ({
      rank: index + 1,
      finding: item.finding,
      score: item.score,
      rationale: item.rationale,
      factors: item.factors,
    }));
  }
}
