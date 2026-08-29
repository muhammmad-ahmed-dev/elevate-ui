/**
 * Phase 4D: Ranked Visual Priorities Generator
 *
 * Establishes project-specific, context-aware visual priorities to guide coding agents
 * on what aspects of the design require the highest attention and polish.
 *
 * CRITICAL REQUIREMENTS:
 * 1. Prioritization depends directly on the project domain and user goals.
 * 2. Does NOT apply a blind, static ranking across all site types.
 */

import type { VisualPriorityItem, DesignIntent } from "./types.js";

export class VisualPrioritiesGenerator {
  /**
   * Generates a ranked list of visual priorities tailored to the DesignIntent.
   */
  public static generate(intent: DesignIntent): VisualPriorityItem[] {
    const type = intent.projectType.value;

    switch (type) {
      case "portfolio":
        return [
          {
            rank: 1,
            title: "Hero Statement & Creator Identity",
            description: "Immediate, high-impact display typography establishing creative positioning within 3 seconds of arrival.",
            category: "hierarchy",
          },
          {
            rank: 2,
            title: "Flagship Project Discoverability",
            description: "Prominent visual case study cards with high-contrast typography, clear category tags, and preview imagery.",
            category: "discovery",
          },
          {
            rank: 3,
            title: "Typography Scale & Contrast",
            description: "Strict typographic pacing pairing oversized display headers with generous, highly legible body copy (WCAG AA).",
            category: "typography",
          },
          {
            rank: 4,
            title: "Inquiry CTA Prominence",
            description: "Unambiguous primary contact button with clear visual elevation and hover feedback.",
            category: "cta",
          },
          {
            rank: 5,
            title: "Responsive Mobile Touch Ergonomics",
            description: "Touch targets exceeding 44x44px and smooth single-column reflow on 375px viewports.",
            category: "responsive",
          },
          {
            rank: 6,
            title: "Whitespace Rhythm & Spatial Discipline",
            description: "Generous 8pt-aligned section spacing allowing creative work and text blocks to breathe.",
            category: "spacing",
          },
        ];

      case "saas_landing":
        return [
          {
            rank: 1,
            title: "Hero Value Proposition & Free Trial CTA",
            description: "Centered, crystal-clear value message accompanied by prominent high-contrast signup and demo action buttons.",
            category: "cta",
          },
          {
            rank: 2,
            title: "Feature Bento Grid Scannability",
            description: "Structured visual cards breaking down complex product capabilities into easily digestible benefit modules.",
            category: "discovery",
          },
          {
            rank: 3,
            title: "Pricing Tier Differentiation",
            description: "High visual contrast for recommended/popular tier with clear price tags and feature checklists.",
            category: "hierarchy",
          },
          {
            rank: 4,
            title: "Social Proof & Trust Indicators",
            description: "Prominent customer logo marquee and metric badges establishing immediate enterprise credibility.",
            category: "hierarchy",
          },
          {
            rank: 5,
            title: "Multi-Viewport Reflow & Form Ergonomics",
            description: "Zero horizontal overflow on 375px and full-width mobile action buttons.",
            category: "responsive",
          },
        ];

      case "ecommerce":
        return [
          {
            rank: 1,
            title: "Product Card Visual Impact & Imagery",
            description: "High-resolution product photography with consistent aspect ratios and clear badge tags.",
            category: "imagery",
          },
          {
            rank: 2,
            title: "Price Legibility & Add-to-Cart Action",
            description: "High-contrast price typography and instant-action cart buttons.",
            category: "cta",
          },
          {
            rank: 3,
            title: "Category Navigation & Filter Bar",
            description: "Accessible category pills and sticky search/filter tools for fast catalogue browsing.",
            category: "discovery",
          },
          {
            rank: 4,
            title: "Mobile Purchase Flow & Touch Targets",
            description: "Sticky mobile checkout bar and thumb-friendly 44px buttons.",
            category: "responsive",
          },
        ];

      case "blog":
        return [
          {
            rank: 1,
            title: "Reading Typography Hierarchy & Comfort",
            description: "Carefully proportioned body copy (65-75 chars/line), generous line-heights, and clear heading rhythm.",
            category: "typography",
          },
          {
            rank: 2,
            title: "Featured Article Spotlight",
            description: "Heroic lead story presentation with author metadata and estimated reading time.",
            category: "hierarchy",
          },
          {
            rank: 3,
            title: "Newsletter Subscription Callout",
            description: "High-contrast inline and footer capture forms driving reader subscription.",
            category: "cta",
          },
          {
            rank: 4,
            title: "Category Taxonomy & Discovery",
            description: "Clean category pill navigation enabling rapid archive exploration.",
            category: "discovery",
          },
        ];

      case "documentation":
        return [
          {
            rank: 1,
            title: "Sidebar & Heading Navigation",
            description: "Multi-level sticky navigation tree with active-state indicators and quick search bar.",
            category: "discovery",
          },
          {
            rank: 2,
            title: "Code Snippet Legibility & Contrast",
            description: "High-contrast syntax highlighting, monospace font fidelity, and instant copy affordances.",
            category: "typography",
          },
          {
            rank: 3,
            title: "Visual Callout & Admonition Styling",
            description: "Distinct visual styling for notes, warnings, tips, and caution blocks.",
            category: "hierarchy",
          },
          {
            rank: 4,
            title: "Mobile Drawer Navigation",
            description: "Fast-loading off-canvas navigation drawer with touch-friendly links.",
            category: "responsive",
          },
        ];

      default:
        return [
          {
            rank: 1,
            title: "Hero Hierarchy & Value Clarity",
            description: "Clear headline typography and primary CTA driving immediate visitor comprehension.",
            category: "hierarchy",
          },
          {
            rank: 2,
            title: "Content Grid Structure & Alignment",
            description: "Disciplined 8pt spatial grid alignment across feature cards and modules.",
            category: "spacing",
          },
          {
            rank: 3,
            title: "Typography Scale & Contrast",
            description: "Accessible color contrast complying with WCAG AA standards.",
            category: "typography",
          },
          {
            rank: 4,
            title: "Mobile Responsive Reflow",
            description: "Flawless reflow on 375px viewports with zero horizontal overflow.",
            category: "responsive",
          },
        ];
    }
  }
}
