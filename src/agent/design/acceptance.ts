/**
 * Phase 4D: Measurable Acceptance Criteria Generator
 *
 * Formulates testable, deterministic, and verifiable acceptance criteria for design implementation.
 *
 * CRITICAL REQUIREMENTS:
 * 1. Criteria must be measurable and verifiable via Elevate's deterministic & browser verification pipeline.
 * 2. Covers multi-viewport responsiveness, touch targets, overflow, typography contrast, and CTAs.
 */

import type { AcceptanceCriterion, DesignIntent, ResponsivePlan } from "./types.js";

export class AcceptanceCriteriaGenerator {
  /**
   * Generates a comprehensive list of measurable acceptance criteria.
   */
  public static generate(
    intent: DesignIntent,
    responsivePlan: ResponsivePlan
  ): AcceptanceCriterion[] {
    const criteria: AcceptanceCriterion[] = [
      {
        id: "ac-responsive-viewports",
        category: "responsive",
        description: "Application layout reflows cleanly without breaking across 375px (Mobile), 768px (Tablet), and 1440px (Desktop) viewports.",
        verificationMethod: "browser_inspection",
      },
      {
        id: "ac-no-horizontal-overflow",
        category: "layout",
        description: "Page body and all parent containers maintain document.documentElement.scrollWidth <= window.innerWidth with zero horizontal scrollbars.",
        verificationMethod: "deterministic_check",
      },
      {
        id: "ac-touch-target-size",
        category: "accessibility",
        description: `All interactive buttons, links, and form inputs on mobile (375px) meet or exceed the minimum ${responsivePlan.touchTargetMinimumPx}x${responsivePlan.touchTargetMinimumPx}px bounding box requirement.`,
        verificationMethod: "deterministic_check",
      },
      {
        id: "ac-color-contrast",
        category: "accessibility",
        description: "All text and interactive label elements achieve WCAG AA contrast compliance (minimum 4.5:1 for standard text, 3:1 for large display headers).",
        verificationMethod: "deterministic_check",
      },
      {
        id: "ac-primary-cta-prominence",
        category: "cta",
        description: `Primary Call-to-Action ('${intent.primaryCta.value}') is immediately visible in the hero section above the mobile and desktop fold.`,
        verificationMethod: "browser_inspection",
      },
      {
        id: "ac-spatial-grid-consistency",
        category: "layout",
        description: "Component padding, section margins, and card gaps strictly adhere to standard 8pt spatial grid increments (p-2, p-4, p-6, p-8, p-12, py-16, py-20).",
        verificationMethod: "deterministic_check",
      },
      {
        id: "ac-typography-hierarchy",
        category: "visual_direction",
        description: "Visual hierarchy is established with distinct font sizes and weights for Display, H1, H2, Body, and Caption tokens.",
        verificationMethod: "heuristic",
      },
      {
        id: "ac-theme-coherence",
        category: "visual_direction",
        description: `Visual theme and palette accurately reflect '${intent.desiredStyle.value}' with consistent surface elevations and border treatments.`,
        verificationMethod: "heuristic",
      },
    ];

    if (intent.functionalRequirements.some((r) => r.toLowerCase().includes("pricing"))) {
      criteria.push({
        id: "ac-pricing-table",
        category: "layout",
        description: "Pricing plans are clearly formatted with price tags, feature lists, and distinct action buttons per tier.",
        verificationMethod: "browser_inspection",
      });
    }

    if (intent.functionalRequirements.some((r) => r.toLowerCase().includes("contact"))) {
      criteria.push({
        id: "ac-contact-form-accessibility",
        category: "accessibility",
        description: "All contact input fields include associated label elements or aria-labels for screen reader accessibility.",
        verificationMethod: "deterministic_check",
      });
    }

    return criteria;
  }
}
