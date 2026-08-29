/**
 * Phase 4D: Intent Analyzer & Smart Defaults Unit Tests
 * Scenarios A, B, C, D, K, L
 */

import { describe, it, expect } from "vitest";
import { IntentAnalyzer } from "../../../src/agent/design/intent.js";
import type { UserRequest } from "../../../src/agent/design/types.js";

describe("Phase 4D: Intent Analyzer & Explicit/Inferred Separation", () => {
  it("Scenario A: parses vague portfolio request with clear inferred defaults and no hallucination", () => {
    const request: UserRequest = {
      prompt: "make me a portfolio website",
    };

    const intent = IntentAnalyzer.analyze(request);

    expect(intent.projectType.value).toBe("portfolio");
    expect(intent.projectType.source).toBe("explicit");
    expect(intent.businessDomain.source).toBe("inferred");
    expect(intent.desiredStyle.source).toBe("inferred");
    expect(intent.primaryGoal.source).toBe("inferred");
    expect(intent.primaryCta.value).toBe("View Selected Work");
    expect(intent.primaryCta.source).toBe("inferred");

    // Hallucination check: must NOT invent fake names, specific companies, or fake testimonials
    expect(intent.businessDomain.value).not.toContain("John Doe");
    expect(intent.businessDomain.value).not.toContain("Acme Corp");
    expect(intent.missingInformation.length).toBeGreaterThan(0);
  });

  it("Scenario B: parses eCommerce request with shopping flow and cart actions", () => {
    const request: UserRequest = {
      prompt: "build an online shop for handmade ceramic coffee mugs",
    };

    const intent = IntentAnalyzer.analyze(request);

    expect(intent.projectType.value).toBe("ecommerce");
    expect(intent.businessDomain.value).toContain("ceramic coffee mugs");
    expect(intent.businessDomain.source).toBe("explicit");
    expect(intent.primaryCta.value).toBe("Shop Now");
    expect(intent.functionalRequirements.some((r) => r.toLowerCase().includes("cart"))).toBe(true);
  });

  it("Scenario C: parses SaaS landing page with trial CTA and pricing requirements", () => {
    const request: UserRequest = {
      prompt: "Create a modern SaaS landing page for an AI developer platform with pricing tiers",
    };

    const intent = IntentAnalyzer.analyze(request);

    expect(intent.projectType.value).toBe("saas_landing");
    expect(intent.businessDomain.value).toContain("AI developer platform");
    expect(intent.primaryCta.value).toBe("Start Free Trial");
    expect(intent.functionalRequirements.some((r) => r.toLowerCase().includes("pricing"))).toBe(true);
  });

  it("Scenario D: parses highly detailed prompt with explicit style, audience, and constraints", () => {
    const request: UserRequest = {
      prompt: "Make a dark minimal portfolio for a 3D artist targeting game studios and film directors. Primary CTA: 'View 3D Reel'. Only 1 single-page layout.",
      customConstraints: ["Must include WebGL canvas preview container"],
    };

    const intent = IntentAnalyzer.analyze(request);

    expect(intent.projectType.value).toBe("portfolio");
    expect(intent.desiredStyle.value).toContain("Dark mode");
    expect(intent.desiredStyle.source).toBe("explicit");
    expect(intent.primaryCta.value).toBe("View 3D Reel");
    expect(intent.primaryCta.source).toBe("explicit");
    expect(intent.pages.value[0]).toContain("Single Page");
    expect(intent.technicalConstraints).toContain("Must include WebGL canvas preview container");
  });

  it("Scenario K: explicitly tags every property with source ('explicit' vs 'inferred') and confidence score", () => {
    const request: UserRequest = {
      prompt: "portfolio website",
    };

    const intent = IntentAnalyzer.analyze(request);

    expect(["explicit", "inferred"]).toContain(intent.projectType.source);
    expect(["explicit", "inferred"]).toContain(intent.businessDomain.source);
    expect(["explicit", "inferred"]).toContain(intent.desiredStyle.source);
    expect(["explicit", "inferred"]).toContain(intent.primaryGoal.source);
    expect(["explicit", "inferred"]).toContain(intent.targetAudience.source);
    expect(["explicit", "inferred"]).toContain(intent.pages.source);
    expect(["explicit", "inferred"]).toContain(intent.primaryCta.source);

    expect(intent.confidence).toBeGreaterThanOrEqual(0.1);
    expect(intent.confidence).toBeLessThanOrEqual(1.0);
  });

  it("Scenario L: prevents hallucination when prompt is completely empty or minimal", () => {
    const request: UserRequest = {
      prompt: "",
    };

    const intent = IntentAnalyzer.analyze(request);

    expect(intent.projectType.source).toBe("inferred");
    expect(intent.missingInformation.length).toBeGreaterThanOrEqual(3);
    // Ensure no random brand hex codes or person identities exist
    expect(intent.businessDomain.value).not.toMatch(/#[0-9a-f]{6}/i);
    expect(intent.primaryGoal.value).toBeDefined();
  });
});
