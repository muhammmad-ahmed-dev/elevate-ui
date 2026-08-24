import { describe, it, expect } from "vitest";
import { FindingNormalizer } from "../../src/analysis/normalization.js";
import { FindingDeduplicator } from "../../src/analysis/deduplication.js";
import type { Finding } from "../../src/analysis/types.js";

describe("FindingNormalizer & FindingDeduplicator", () => {
  it("normalizes and sanitizes finding properties cleanly", () => {
    const raw: Finding[] = [
      {
        id: "",
        category: "touch-target",
        severity: "serious",
        title: "  Undersized button  ",
        description: "  Button is too small  ",
        evidence: { width: 20 },
        selector: " button.cta  ",
        viewport: "mobile",
        source: "deterministic",
        deterministic: true,
        confidence: 1.5, // should clamp to 1.0
      },
    ];

    const normalized = FindingNormalizer.normalize(raw);
    expect(normalized.length).toBe(1);
    expect(normalized[0].id).toBeTruthy();
    expect(normalized[0].title).toBe("Undersized button");
    expect(normalized[0].description).toBe("Button is too small");
    expect(normalized[0].selector).toBe("button.cta");
    expect(normalized[0].confidence).toBe(1.0);
  });

  it("deduplicates identical issues on the same selector and viewport", () => {
    const findings: Finding[] = [
      {
        id: "det-1",
        category: "overflow",
        severity: "serious",
        title: "Horizontal layout overflow",
        description: "Overflows by 20px",
        evidence: { overflow: 20 },
        selector: "div.container",
        viewport: "mobile",
        source: "deterministic",
        deterministic: true,
        confidence: 1.0,
      },
      {
        id: "heur-1",
        category: "overflow",
        severity: "critical",
        title: "Horizontal layout overflow",
        description: "Visual container spills off screen",
        evidence: { visualOverflow: true },
        selector: "div.container",
        viewport: "mobile",
        source: "heuristic",
        deterministic: false,
        confidence: 0.85,
      },
    ];

    const deduplicated = FindingDeduplicator.deduplicate(findings);
    expect(deduplicated.length).toBe(1);
    // Should retain higher severity (critical) and merged evidence
    expect(deduplicated[0].severity).toBe("critical");
    expect(deduplicated[0].evidence.corroboratedBy).toBeTruthy();
  });

  it("DOES NOT merge two different issue categories on the same selector", () => {
    const findings: Finding[] = [
      {
        id: "f-touch",
        category: "touch-target",
        severity: "serious",
        title: "Touch target too small",
        description: "20x20px button",
        evidence: { width: 20, height: 20 },
        selector: "button#submit-btn",
        viewport: "mobile",
        source: "deterministic",
        deterministic: true,
        confidence: 1.0,
      },
      {
        id: "f-hierarchy",
        category: "visual-hierarchy",
        severity: "moderate",
        title: "Poor visual hierarchy on CTA",
        description: "Button lacks contrast with hero background",
        evidence: { contrast: "low" },
        selector: "button#submit-btn",
        viewport: "mobile",
        source: "heuristic",
        deterministic: false,
        confidence: 0.8,
      },
    ];

    const deduplicated = FindingDeduplicator.deduplicate(findings);
    // MUST remain 2 separate distinct findings!
    expect(deduplicated.length).toBe(2);
    expect(deduplicated.find((f) => f.category === "touch-target")).toBeDefined();
    expect(deduplicated.find((f) => f.category === "visual-hierarchy")).toBeDefined();
  });

  it("keeps findings on different viewports separate", () => {
    const findings: Finding[] = [
      {
        id: "f-mobile",
        category: "overflow",
        severity: "critical",
        title: "Overflow on container",
        description: "Overflows on mobile",
        evidence: {},
        selector: "div.card",
        viewport: "mobile",
        source: "deterministic",
        deterministic: true,
        confidence: 1.0,
      },
      {
        id: "f-desktop",
        category: "overflow",
        severity: "serious",
        title: "Overflow on container",
        description: "Overflows on desktop",
        evidence: {},
        selector: "div.card",
        viewport: "desktop",
        source: "deterministic",
        deterministic: true,
        confidence: 1.0,
      },
    ];

    const deduplicated = FindingDeduplicator.deduplicate(findings);
    expect(deduplicated.length).toBe(2);
    expect(deduplicated.map((f) => f.viewport)).toEqual(["mobile", "desktop"]);
  });
});
