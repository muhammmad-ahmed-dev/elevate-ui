import { describe, it, expect } from "vitest";
import { IssueSynthesizer } from "../../src/analysis/synthesis.js";
import { FindingPrioritizer } from "../../src/analysis/prioritization.js";
import type { Finding } from "../../src/analysis/types.js";

describe("IssueSynthesizer", () => {
  it("synthesizes exactly 3-5 recommendations from a rich set of prioritized findings", () => {
    const findings: Finding[] = [
      { id: "f1", category: "overflow", severity: "critical", title: "Hero table overflow", description: "Overflows by 150px", evidence: { overflow: 150 }, selector: "div.hero-table", viewport: "mobile", source: "deterministic", deterministic: true, confidence: 1.0 },
      { id: "f2", category: "touch-target", severity: "serious", title: "Navbar icon button undersized", description: "24x24px button", evidence: { width: 24, height: 24 }, selector: "button.nav-icon", viewport: "mobile", source: "deterministic", deterministic: true, confidence: 1.0 },
      { id: "f3", category: "broken-image", severity: "serious", title: "Footer partner logo broken", description: "404 on image", evidence: { src: "/partner.png" }, selector: "img.partner", viewport: "desktop", source: "deterministic", deterministic: true, confidence: 1.0 },
      { id: "f4", category: "heading-hierarchy", severity: "moderate", title: "Skipped heading h1 to h3", description: "Skips h2", evidence: { from: 1, to: 3 }, selector: "h3.card-title", viewport: "desktop", source: "deterministic", deterministic: true, confidence: 1.0 },
      { id: "f5", category: "visual-hierarchy", severity: "moderate", title: "Hero CTA low contrast", description: "Competes with background", evidence: { contrast: "low" }, selector: "a.primary-cta", viewport: "desktop", source: "heuristic", deterministic: false, confidence: 0.85 },
      { id: "f6", category: "typography", severity: "minor", title: "Body line-height cramped", description: "Needs 1.5 leading", evidence: {}, selector: "p.body-text", viewport: "desktop", source: "heuristic", deterministic: false, confidence: 0.75 },
    ];

    const prioritized = FindingPrioritizer.prioritize(findings);
    const recommendations = IssueSynthesizer.synthesize(prioritized, 5, 3);

    expect(recommendations.length).toBeGreaterThanOrEqual(3);
    expect(recommendations.length).toBeLessThanOrEqual(5);

    // Verify properties on recommendations
    for (const rec of recommendations) {
      expect(rec.id).toBeTruthy();
      expect(rec.problem).toBeTruthy();
      expect(rec.evidence).toBeTruthy();
      expect(rec.affectedViewports.length).toBeGreaterThan(0);
      expect(rec.proposedImprovement).toBeTruthy();
      expect(rec.rationale).toBeTruthy();
      expect(rec.confidence).toBeGreaterThan(0);
      expect(["single-element", "component", "layout"]).toContain(rec.estimatedMutationScope);
      expect(["low", "medium", "high"]).toContain(rec.risk);
      expect(rec.sourceFindingIds.length).toBeGreaterThan(0);

      // Verify that recommendations do NOT contain code patches / diffs
      expect((rec as any).diff).toBeUndefined();
      expect((rec as any).patch).toBeUndefined();
      expect((rec as any).code).toBeUndefined();
      expect((rec as any).ast).toBeUndefined();
    }
  });

  it("returns fewer recommendations when fewer actionable findings exist", () => {
    const singleFinding: Finding[] = [
      { id: "f1", category: "touch-target", severity: "moderate", title: "Small button", description: "30x30px", evidence: {}, selector: "button.test", viewport: "mobile", source: "deterministic", deterministic: true, confidence: 1.0 },
    ];

    const prioritized = FindingPrioritizer.prioritize(singleFinding);
    const recommendations = IssueSynthesizer.synthesize(prioritized);

    expect(recommendations.length).toBe(1);
    expect(recommendations[0].affectedSelector).toBe("button.test");
  });

  it("returns empty array when no findings exist", () => {
    const recommendations = IssueSynthesizer.synthesize([]);
    expect(recommendations).toEqual([]);
  });

  it("unifies multi-viewport occurrences of the same issue into a single recommendation", () => {
    const multiVpFindings: Finding[] = [
      { id: "f-m", category: "touch-target", severity: "serious", title: "Small button", description: "30x30px", evidence: { vp: "mobile" }, selector: "button.buy-now", viewport: "mobile", source: "deterministic", deterministic: true, confidence: 1.0 },
      { id: "f-t", category: "touch-target", severity: "serious", title: "Small button", description: "30x30px", evidence: { vp: "tablet" }, selector: "button.buy-now", viewport: "tablet", source: "deterministic", deterministic: true, confidence: 1.0 },
      { id: "f-d", category: "touch-target", severity: "serious", title: "Small button", description: "30x30px", evidence: { vp: "desktop" }, selector: "button.buy-now", viewport: "desktop", source: "deterministic", deterministic: true, confidence: 1.0 },
    ];

    const prioritized = FindingPrioritizer.prioritize(multiVpFindings);
    const recommendations = IssueSynthesizer.synthesize(prioritized);

    expect(recommendations.length).toBe(1);
    expect(recommendations[0].affectedSelector).toBe("button.buy-now");
    expect(recommendations[0].affectedViewports.sort()).toEqual(["desktop", "mobile", "tablet"]);
    expect(recommendations[0].sourceFindingIds.length).toBe(3);
  });
});
