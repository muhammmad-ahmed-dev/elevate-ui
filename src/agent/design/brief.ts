/**
 * Phase 4D: Design Brief Assembler
 *
 * Consolidates DesignIntent, SmartDefaults, ReferenceSynthesis, and SitePlans into
 * an authoritative, structured DesignBrief object.
 *
 * CRITICAL REQUIREMENTS:
 * 1. Explicitly records all inferred assumptions alongside their confidence scores.
 * 2. Unifies strategic brand direction, accessibility expectations, and performance goals.
 */

import type {
  DesignBrief,
  DesignIntent,
  ReferenceSynthesis,
  SitePlan,
  ResponsivePlan,
  InputMode,
} from "./types.js";

export class DesignBriefAssembler {
  /**
   * Assembles a comprehensive DesignBrief object.
   */
  public static assemble(
    mode: InputMode,
    intent: DesignIntent,
    sitePlan: SitePlan,
    responsivePlan: ResponsivePlan,
    referenceSynthesis?: ReferenceSynthesis
  ): DesignBrief {
    const briefId = `brief-${Date.now()}`;
    const createdAt = new Date().toISOString();

    const explicitRequirements: string[] = [];
    const inferredAssumptions: {
      attribute: string;
      assumedValue: string;
      confidence: number;
      reason: string;
    }[] = [];

    // Separate explicit vs inferred from intent
    if (intent.projectType.source === "explicit") {
      explicitRequirements.push(`Project Type: ${intent.projectType.value}`);
    } else {
      inferredAssumptions.push({
        attribute: "Project Type",
        assumedValue: intent.projectType.value,
        confidence: intent.projectType.confidence,
        reason: intent.projectType.rationale || "Inferred from prompt semantics.",
      });
    }

    if (intent.businessDomain.source === "explicit") {
      explicitRequirements.push(`Business Domain: ${intent.businessDomain.value}`);
    } else {
      inferredAssumptions.push({
        attribute: "Business Domain",
        assumedValue: intent.businessDomain.value,
        confidence: intent.businessDomain.confidence,
        reason: intent.businessDomain.rationale || "Domain inferred from project archetype.",
      });
    }

    if (intent.desiredStyle.source === "explicit") {
      explicitRequirements.push(`Visual Style: ${intent.desiredStyle.value}`);
    } else {
      inferredAssumptions.push({
        attribute: "Visual Style",
        assumedValue: intent.desiredStyle.value,
        confidence: intent.desiredStyle.confidence,
        reason: intent.desiredStyle.rationale || "Modern aesthetic default for domain.",
      });
    }

    if (intent.primaryGoal.source === "explicit") {
      explicitRequirements.push(`Primary Goal: ${intent.primaryGoal.value}`);
    } else {
      inferredAssumptions.push({
        attribute: "Primary Goal",
        assumedValue: intent.primaryGoal.value,
        confidence: intent.primaryGoal.confidence,
        reason: intent.primaryGoal.rationale || "Standard conversion goal for project type.",
      });
    }

    if (intent.targetAudience.source === "explicit") {
      explicitRequirements.push(`Target Audience: ${intent.targetAudience.value}`);
    } else {
      inferredAssumptions.push({
        attribute: "Target Audience",
        assumedValue: intent.targetAudience.value,
        confidence: intent.targetAudience.confidence,
        reason: intent.targetAudience.rationale || "Standard visitor demographic.",
      });
    }

    if (intent.primaryCta.source === "explicit") {
      explicitRequirements.push(`Primary CTA: ${intent.primaryCta.value}`);
    } else {
      inferredAssumptions.push({
        attribute: "Primary CTA",
        assumedValue: intent.primaryCta.value,
        confidence: intent.primaryCta.confidence,
        reason: intent.primaryCta.rationale || "Domain standard action button.",
      });
    }

    // Explicit technical constraints
    for (const req of intent.technicalConstraints) {
      explicitRequirements.push(`Constraint: ${req}`);
    }

    // Site structure summary
    const pageSummaries = sitePlan.pages.map((p) => `${p.title} (${p.sections.map((s) => s.name).join(" -> ")})`);
    const siteStructureSummary = pageSummaries.join(" | ");

    // Responsive summary
    const responsiveStrategySummary = `Mobile 375px: ${responsivePlan.mobile375.layoutStructure}; Tablet 768px: ${responsivePlan.tablet768.layoutStructure}; Desktop 1440px: ${responsivePlan.desktop1440.layoutStructure}; Min touch target: ${responsivePlan.touchTargetMinimumPx}px.`;

    const accessibilityExpectations = [
      "WCAG 2.1 AA Color Contrast compliance (>= 4.5:1 text, >= 3.0:1 UI boundaries)",
      "Touch target minimum 44x44px for all mobile interactive elements",
      "Semantic HTML5 landmarks (<header>, <nav>, <main>, <section>, <footer>)",
      "Keyboard navigable interactive elements with visible focus rings",
    ];

    const performanceExpectations = [
      "Optimized DOM hierarchy avoiding deeply nested redundant containers",
      "Zero horizontal layout shifts and zero page horizontal overflow",
      "Modern CSS utility styling via Tailwind without heavy runtime scripts",
    ];

    const referencesUsed: string[] = [];
    if (referenceSynthesis && referenceSynthesis.referenceCount > 0) {
      referencesUsed.push(`${referenceSynthesis.referenceCount} visual reference(s) synthesized`);
      for (const sel of referenceSynthesis.selectedCharacteristics) {
        referencesUsed.push(`Selected '${sel.attribute}': ${sel.decision}`);
      }
    }

    return {
      briefId,
      createdAt,
      inputMode: mode,
      projectGoal: intent.primaryGoal.value,
      targetAudience: intent.targetAudience.value,
      projectType: intent.projectType.value,
      brandDirection: intent.businessDomain.value,
      visualDirection: referenceSynthesis?.dominantVisualLanguage || intent.desiredStyle.value,
      contentHierarchy: sitePlan.contentPriorities,
      primaryCta: intent.primaryCta.value,
      secondaryCta: intent.secondaryCta?.value,
      siteStructureSummary,
      responsiveStrategySummary,
      accessibilityExpectations,
      performanceExpectations,
      explicitRequirements,
      inferredAssumptions,
      referencesUsed,
    };
  }
}
