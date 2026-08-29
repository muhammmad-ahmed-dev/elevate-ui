/**
 * Phase 4D: Responsive Design Planner
 *
 * Formulates explicit multi-viewport rules for Mobile (375px), Tablet (768px), and Desktop (1440px).
 *
 * CRITICAL REQUIREMENTS:
 * 1. Enforces minimum 44x44px interactive touch targets on mobile.
 * 2. Enforces zero horizontal scrollbars and robust overflow prevention.
 * 3. Specifies exact layout reflow, typography scaling, and navigation transformations.
 */

import type { ResponsivePlan, ViewportRuleSet, DesignIntent } from "./types.js";

export class ResponsivePlanner {
  /**
   * Generates a comprehensive multi-viewport responsive strategy.
   */
  public static generate(intent: DesignIntent): ResponsivePlan {
    const mobile375: ViewportRuleSet = {
      viewportName: "mobile (375px)",
      widthPx: 375,
      layoutStructure: "Strict single-column vertical stack with full-width container bounds (w-full px-4)",
      navigationBehavior: "Collapsible drawer or sheet menu with prominent hamburger toggle button (min 44x44px)",
      typographyAdjustments: "Headings scaled down: Display (text-3xl / 30px), H1 (text-2xl / 24px), Body (text-base / 16px)",
      spacingDensity: "Compact vertical padding (py-12 section spacing, gap-4 between cards)",
      gridColumns: "grid-cols-1 (single column for all card lists, features, and showcases)",
      ctaPlacement: "Full-width primary action buttons (w-full sm:w-auto) ensuring easy single-thumb reachability",
      overflowRules: "w-full max-w-full overflow-hidden / overflow-x-hidden; no hardcoded pixel widths > 320px",
    };

    const tablet768: ViewportRuleSet = {
      viewportName: "tablet (768px)",
      widthPx: 768,
      layoutStructure: "2-column balanced grid layout with constrained container margins (max-w-2xl px-6)",
      navigationBehavior: "Compact horizontal navigation or collapsible menu based on link count",
      typographyAdjustments: "Intermediate heading scale: Display (text-4xl / 36px), H1 (text-3xl / 30px), Body (text-base)",
      spacingDensity: "Moderate vertical padding (py-16 section spacing, gap-6 between cards)",
      gridColumns: "grid-cols-2 (two columns for portfolio items, feature cards, and testimonials)",
      ctaPlacement: "Inline auto-width action buttons grouped horizontally (flex flex-row gap-3)",
      overflowRules: "Container constrained with max-w-2xl mx-auto; images set to w-full object-cover",
    };

    const desktop1440: ViewportRuleSet = {
      viewportName: "desktop (1440px)",
      widthPx: 1440,
      layoutStructure: "Multi-column expansive layout constrained by centered max-w-7xl canvas (max-w-7xl mx-auto px-8)",
      navigationBehavior: "Full horizontal navigation bar with brand on left, links centered, and primary action on right",
      typographyAdjustments: "Full scale display typography: Display (text-5xl to text-6xl / 60px), H1 (text-4xl to text-5xl), Body (text-lg)",
      spacingDensity: "Generous architectural pacing (py-20 to py-24 section spacing, gap-8 between cards)",
      gridColumns: intent.projectType.value === "ecommerce" || intent.projectType.value === "dashboard"
        ? "grid-cols-3 or grid-cols-4 for dense catalogue/metric discovery"
        : "grid-cols-2 or grid-cols-3 for balanced case study and feature presentation",
      ctaPlacement: "Prominent inline CTA buttons with clear primary/secondary visual hierarchy and hover scale effects",
      overflowRules: "Strict max-w-7xl mx-auto centering; full-bleed backgrounds with bounded content containers",
    };

    return {
      mobile375,
      tablet768,
      desktop1440,
      touchTargetMinimumPx: 44,
      overflowPreventionStrategy: "All root containers use w-full max-w-full overflow-x-hidden; media elements use object-cover w-full h-auto; typography wraps gracefully with break-words.",
    };
  }
}
