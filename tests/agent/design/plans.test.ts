/**
 * Phase 4D: Design Plans, Architecture, & Design System Tests
 * Scenarios M, N, O, P, S
 */

import { describe, it, expect } from "vitest";
import { IntentAnalyzer } from "../../../src/agent/design/intent.js";
import { ResponsivePlanner } from "../../../src/agent/design/responsive-plan.js";
import { DesignSystemGenerator } from "../../../src/agent/design/design-system.js";
import { SitePlanner } from "../../../src/agent/design/site-plan.js";
import { ComponentPlanner } from "../../../src/agent/design/component-plan.js";
import { AcceptanceCriteriaGenerator } from "../../../src/agent/design/acceptance.js";
import { VisualPrioritiesGenerator } from "../../../src/agent/design/visual-priorities.js";
import type { UserRequest } from "../../../src/agent/design/types.js";

describe("Phase 4D: Design Plans, Architecture & System Extraction", () => {
  it("Scenario M: generates responsive plan with strict rules for 375px, 768px, and 1440px", () => {
    const request: UserRequest = { prompt: "Portfolio for web developer" };
    const intent = IntentAnalyzer.analyze(request);
    const plan = ResponsivePlanner.generate(intent);

    expect(plan.mobile375.widthPx).toBe(375);
    expect(plan.mobile375.gridColumns).toContain("grid-cols-1");
    expect(plan.mobile375.ctaPlacement).toContain("Full-width");

    expect(plan.tablet768.widthPx).toBe(768);
    expect(plan.tablet768.gridColumns).toContain("grid-cols-2");

    expect(plan.desktop1440.widthPx).toBe(1440);
    expect(plan.desktop1440.layoutStructure).toContain("max-w-7xl");

    expect(plan.touchTargetMinimumPx).toBe(44);
    expect(plan.overflowPreventionStrategy).toContain("overflow-x-hidden");
  });

  it("Scenario N: extracts lightweight design system with provenance-tagged color roles", () => {
    const request: UserRequest = { prompt: "Dark mode SaaS platform" };
    const intent = IntentAnalyzer.analyze(request);
    const system = DesignSystemGenerator.generate(intent);

    expect(system.themeStyle).toContain("Dark");
    expect(system.typography.scale.length).toBeGreaterThanOrEqual(7);
    expect(system.spacingScale.baseUnit).toContain("8px");

    // Check color roles provenance
    const bgRole = system.colorRoles.find((r) => r.role === "background");
    expect(bgRole).toBeDefined();
    expect(bgRole?.tailwindClass).toBe("bg-slate-950");
    expect(bgRole?.source).toBe("inferred");
    expect(bgRole?.suggestedHex).toBe("#020617");
  });

  it("Scenario O: generates adaptive site architecture matching project domain", () => {
    const portfolioReq: UserRequest = { prompt: "Designer portfolio" };
    const saasReq: UserRequest = { prompt: "SaaS landing page" };

    const portfolioIntent = IntentAnalyzer.analyze(portfolioReq);
    const saasIntent = IntentAnalyzer.analyze(saasReq);

    const portfolioSite = SitePlanner.generate(portfolioIntent);
    const saasSite = SitePlanner.generate(saasIntent);

    // Ensure portfolio has work grid and saas has pricing
    const portfolioSections = portfolioSite.pages[0].sections.map((s) => s.name);
    const saasSections = saasSite.pages[0].sections.map((s) => s.name);

    expect(portfolioSections.some((s) => s.includes("Work"))).toBe(true);
    expect(saasSections.some((s) => s.includes("Pricing"))).toBe(true);
    expect(portfolioSite.ctaHierarchy.primary).toBe("View Selected Work");
    expect(saasSite.ctaHierarchy.primary).toBe("Start Free Trial");
  });

  it("Scenario P: generates component plan with defined single responsibilities and responsive behaviors", () => {
    const request: UserRequest = { prompt: "Personal portfolio website" };
    const intent = IntentAnalyzer.analyze(request);
    const sitePlan = SitePlanner.generate(intent);
    const componentPlan = ComponentPlanner.generate(sitePlan, intent);

    expect(componentPlan.components.length).toBeGreaterThanOrEqual(4);
    expect(componentPlan.entryComponent).toBe("src/app/page.tsx");

    for (const comp of componentPlan.components) {
      expect(comp.name).toBeDefined();
      expect(comp.filePath).toContain("src/components/");
      expect(comp.responsibility).toBeDefined();
      expect(comp.responsiveBehavior.mobile).toBeDefined();
      expect(comp.responsiveBehavior.desktop).toBeDefined();
      expect(comp.allowedDesignTokens.length).toBeGreaterThan(0);
    }
  });

  it("Scenario S: generates measurable, testable acceptance criteria", () => {
    const request: UserRequest = { prompt: "SaaS landing page with contact form" };
    const intent = IntentAnalyzer.analyze(request);
    const responsivePlan = ResponsivePlanner.generate(intent);
    const criteria = AcceptanceCriteriaGenerator.generate(intent, responsivePlan);

    expect(criteria.length).toBeGreaterThanOrEqual(6);

    const responsiveCriterion = criteria.find((c) => c.id === "ac-responsive-viewports");
    expect(responsiveCriterion).toBeDefined();
    expect(responsiveCriterion?.verificationMethod).toBe("browser_inspection");

    const touchTargetCriterion = criteria.find((c) => c.id === "ac-touch-target-size");
    expect(touchTargetCriterion).toBeDefined();
    expect(touchTargetCriterion?.description).toContain("44x44px");

    const overflowCriterion = criteria.find((c) => c.id === "ac-no-horizontal-overflow");
    expect(overflowCriterion).toBeDefined();
  });

  it("generates ranked visual priorities tailored to the project", () => {
    const portfolioIntent = IntentAnalyzer.analyze({ prompt: "Portfolio" });
    const saasIntent = IntentAnalyzer.analyze({ prompt: "SaaS landing page" });

    const portfolioPriorities = VisualPrioritiesGenerator.generate(portfolioIntent);
    const saasPriorities = VisualPrioritiesGenerator.generate(saasIntent);

    expect(portfolioPriorities[0].rank).toBe(1);
    expect(portfolioPriorities.some((p) => p.title.includes("Hero"))).toBe(true);
    expect(saasPriorities.some((p) => p.title.includes("Pricing"))).toBe(true);
  });
});
