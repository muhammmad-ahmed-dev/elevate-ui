/**
 * Phase 4D: Reference Analyzer & Multi-Reference Synthesis Tests
 * Scenarios E, F, G, H
 */

import { describe, it, expect } from "vitest";
import { ReferenceAnalyzer } from "../../../src/agent/design/references.js";
import type { ReferenceImageInput } from "../../../src/agent/design/types.js";

describe("Phase 4D: Reference Analyzer & Multi-Reference Synthesis", () => {
  it("Scenario E: extracts visual characteristics from a screenshot-only reference", () => {
    const ref: ReferenceImageInput = {
      id: "screenshot-01",
      filePath: "/path/to/minimal_dark_portfolio_hero.png",
      description: "Dark minimalist portfolio hero with typography focus and floating card",
    };

    const analysis = ReferenceAnalyzer.analyzeSingle(ref, 0);

    expect(analysis.referenceId).toBe("screenshot-01");
    expect(analysis.sourceType).toBe("file");
    expect(analysis.characteristics.heroComposition).toContain("display statement");
    expect(["spacious", "airy"]).toContain(analysis.characteristics.spacingDensity);
    expect(analysis.characteristics.colorRelationships).toContain("slate-950");
    expect(analysis.keyTakeaways.length).toBeGreaterThan(0);
  });

  it("Scenario F: analyzes reference input provided alongside prompt instructions", () => {
    const ref = "https://example.com/modern-saas-bento-preview.jpg";
    const analysis = ReferenceAnalyzer.analyzeSingle(ref, 0);

    expect(analysis.sourceType).toBe("url");
    expect(analysis.characteristics.layoutStructure).toBeDefined();
    expect(analysis.characteristics.responsiveClues.length).toBeGreaterThanOrEqual(2);
  });

  it("Scenario G: synthesizes multiple harmonious references into cohesive visual language", () => {
    const ref1: ReferenceImageInput = {
      id: "ref-1",
      description: "Dark modern SaaS hero with glowing button",
    };
    const ref2: ReferenceImageInput = {
      id: "ref-2",
      description: "Dark bento grid features with slate containers",
    };

    const analyses = [
      ReferenceAnalyzer.analyzeSingle(ref1, 0),
      ReferenceAnalyzer.analyzeSingle(ref2, 1),
    ];

    const synthesis = ReferenceAnalyzer.synthesize(analyses);

    expect(synthesis.referenceCount).toBe(2);
    expect(synthesis.dominantVisualLanguage.toLowerCase()).toContain("dark");
    expect(synthesis.selectedCharacteristics.length).toBeGreaterThanOrEqual(3);
    expect(synthesis.conflictingStylesDetected.length).toBe(0);
    expect(synthesis.synthesisRationale).toContain("dominant structural patterns");
  });

  it("Scenario H: detects conflicting references (dark vs light, compact vs airy) and resolves them with explicit rationale", () => {
    const refDark: ReferenceImageInput = {
      id: "ref-dark",
      description: "Dark mode compact mobile app dashboard",
    };
    const refLight: ReferenceImageInput = {
      id: "ref-light",
      description: "Light mode airy editorial magazine layout",
    };

    const analyses = [
      ReferenceAnalyzer.analyzeSingle(refDark, 0),
      ReferenceAnalyzer.analyzeSingle(refLight, 1),
    ];

    const synthesis = ReferenceAnalyzer.synthesize(analyses);

    expect(synthesis.referenceCount).toBe(2);
    expect(synthesis.conflictingStylesDetected.length).toBeGreaterThan(0);
    expect(synthesis.rejectedCharacteristics.length).toBeGreaterThan(0);

    // Verify rejection has reason
    const rejectedItem = synthesis.rejectedCharacteristics[0];
    expect(rejectedItem.reason).toBeDefined();
    expect(rejectedItem.rejectedValue).toBeDefined();

    // Verify selection resolved tension
    const selectedItem = synthesis.selectedCharacteristics.find((s) => s.attribute.includes("Density") || s.attribute.includes("Palette"));
    expect(selectedItem).toBeDefined();
    expect(selectedItem?.rationale).toBeDefined();
  });
});
