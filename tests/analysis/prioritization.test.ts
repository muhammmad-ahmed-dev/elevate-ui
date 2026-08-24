import { describe, it, expect } from "vitest";
import { FindingPrioritizer } from "../../src/analysis/prioritization.js";
import type { Finding } from "../../src/analysis/types.js";

describe("FindingPrioritizer", () => {
  it("ranks critical deterministic findings above minor heuristic findings", () => {
    const findings: Finding[] = [
      {
        id: "minor-heuristic",
        category: "typography",
        severity: "minor",
        title: "Subtle font smoothing difference",
        description: "Could use slightly lighter weight",
        evidence: {},
        selector: "p.subtext",
        viewport: "desktop",
        source: "heuristic",
        deterministic: false,
        confidence: 0.7,
      },
      {
        id: "critical-overflow",
        category: "overflow",
        severity: "critical",
        title: "Horizontal layout blowout",
        description: "Spills 200px off screen",
        evidence: { overflowAmount: 200 },
        selector: "div.hero-table",
        viewport: "mobile",
        source: "deterministic",
        deterministic: true,
        confidence: 1.0,
      },
      {
        id: "moderate-touch",
        category: "touch-target",
        severity: "moderate",
        title: "Button target 38x38px",
        description: "Slightly undersized",
        evidence: { actualWidth: 38 },
        selector: "button.nav",
        viewport: "mobile",
        source: "deterministic",
        deterministic: true,
        confidence: 1.0,
      },
    ];

    const prioritized = FindingPrioritizer.prioritize(findings);
    expect(prioritized.length).toBe(3);
    expect(prioritized[0].rank).toBe(1);
    expect(prioritized[0].finding.id).toBe("critical-overflow");
    expect(prioritized[1].finding.id).toBe("moderate-touch");
    expect(prioritized[2].finding.id).toBe("minor-heuristic");

    expect(prioritized[0].rationale).toContain("CRITICAL");
    expect(prioritized[0].factors.severityWeight).toBe(100);
    expect(prioritized[0].factors.deterministicBonus).toBe(15);
  });

  it("boosts issues that reproduce across multiple viewports", () => {
    const findings: Finding[] = [
      {
        id: "single-vp-issue",
        category: "touch-target",
        severity: "moderate",
        title: "Small button",
        description: "Small on desktop only",
        evidence: {},
        selector: "button.buy",
        viewport: "desktop",
        source: "deterministic",
        deterministic: true,
        confidence: 1.0,
      },
      {
        id: "multi-vp-1",
        category: "touch-target",
        severity: "moderate",
        title: "Small button",
        description: "Small on mobile",
        evidence: {},
        selector: "button.footer-cta",
        viewport: "mobile",
        source: "deterministic",
        deterministic: true,
        confidence: 1.0,
      },
      {
        id: "multi-vp-2",
        category: "touch-target",
        severity: "moderate",
        title: "Small button",
        description: "Small on tablet",
        evidence: {},
        selector: "button.footer-cta",
        viewport: "tablet",
        source: "deterministic",
        deterministic: true,
        confidence: 1.0,
      },
      {
        id: "multi-vp-3",
        category: "touch-target",
        severity: "moderate",
        title: "Small button",
        description: "Small on desktop",
        evidence: {},
        selector: "button.footer-cta",
        viewport: "desktop",
        source: "deterministic",
        deterministic: true,
        confidence: 1.0,
      },
    ];

    const prioritized = FindingPrioritizer.prioritize(findings);
    const footerRanking = prioritized.find((p) => p.finding.selector === "button.footer-cta");
    const singleRanking = prioritized.find((p) => p.finding.selector === "button.buy");

    expect(footerRanking).toBeDefined();
    expect(singleRanking).toBeDefined();
    expect(footerRanking!.score).toBeGreaterThan(singleRanking!.score);
    expect(footerRanking!.factors.viewportBreadth).toBe(45); // 3 viewports * 15
    expect(singleRanking!.factors.viewportBreadth).toBe(15); // 1 viewport * 15
  });
});
