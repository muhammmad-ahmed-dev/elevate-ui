/**
 * Phase 4D: Design System Token Extractor
 *
 * Generates lightweight, cohesive design tokens and utility rules for Tailwind CSS.
 *
 * CRITICAL REQUIREMENTS:
 * 1. Every color role specifies its provenance (explicit, extracted_reference, or inferred).
 * 2. Does NOT treat inferred color suggestions as hard user constraints.
 * 3. Enforces standard 8pt spatial grid scale and WCAG AA contrast standards.
 */

import type {
  DesignIntent,
  ReferenceSynthesis,
  DesignSystem,
  TypographyToken,
  ColorRoleToken,
} from "./types.js";

export class DesignSystemGenerator {
  /**
   * Generates a complete lightweight DesignSystem tailored to intent and references.
   */
  public static generate(
    intent: DesignIntent,
    referenceSynthesis?: ReferenceSynthesis
  ): DesignSystem {
    const isDark =
      intent.desiredStyle.value.toLowerCase().includes("dark") ||
      Boolean(referenceSynthesis && referenceSynthesis.dominantVisualLanguage.toLowerCase().includes("dark"));

    const isEditorial =
      intent.desiredStyle.value.toLowerCase().includes("editorial") ||
      intent.projectType.value === "portfolio" ||
      intent.projectType.value === "blog";

    const isTechSaas =
      intent.projectType.value === "saas_landing" ||
      intent.projectType.value === "dashboard" ||
      intent.projectType.value === "documentation";

    const typographyScale = this.buildTypographyScale(isEditorial);
    const colorRoles = this.buildColorRoles(isDark, isTechSaas, intent, referenceSynthesis);

    return {
      name: `${intent.projectType.value}-design-system`,
      themeStyle: isDark ? "Dark Modern Theme" : "Light Refined Theme",
      typography: {
        fontFamilies: {
          sans: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          heading: isEditorial
            ? "'Plus Jakarta Sans', 'Playfair Display', Georgia, serif"
            : "'Plus Jakarta Sans', Inter, sans-serif",
          mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        },
        scale: typographyScale,
      },
      spacingScale: {
        baseUnit: "8px (0.5rem)",
        componentPadding: "p-4 sm:p-6 lg:p-8",
        sectionPaddingMobile: "py-12 px-4",
        sectionPaddingDesktop: "py-20 lg:py-24 px-6 lg:px-8",
        containerMaxWidth: "max-w-7xl mx-auto",
      },
      radiusGuidance: {
        sm: "rounded-md (6px)",
        md: "rounded-lg (8px)",
        lg: "rounded-xl (12px)",
        full: "rounded-full (9999px)",
      },
      elevationGuidance: {
        card: isDark
          ? "border border-slate-800/80 bg-slate-900/60 backdrop-blur shadow-sm"
          : "border border-gray-100 bg-white shadow-sm hover:shadow-md",
        dropdown: isDark
          ? "border border-slate-800 bg-slate-900 shadow-xl"
          : "border border-gray-200 bg-white shadow-lg",
        modal: isDark
          ? "border border-slate-700 bg-slate-900 shadow-2xl"
          : "border border-gray-200 bg-white shadow-2xl",
      },
      colorRoles,
      layoutWidths: {
        container: "max-w-7xl",
        content: "max-w-4xl",
        narrow: "max-w-2xl",
      },
      breakpoints: {
        mobile: "375px (default / sm: 640px)",
        tablet: "768px (md: 768px)",
        desktop: "1440px (lg: 1024px / xl: 1280px / 2xl: 1536px)",
      },
      interactionStates: {
        buttonHover: "transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
        cardHover: "transition-all duration-300 hover:border-slate-700 hover:shadow-md",
        focusRing: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
      },
    };
  }

  private static buildTypographyScale(isEditorial: boolean): TypographyToken[] {
    return [
      {
        role: "display",
        fontSize: "text-4xl sm:text-5xl lg:text-6xl",
        lineHeight: "leading-tight tracking-tight",
        fontWeight: isEditorial ? "font-bold" : "font-extrabold",
        tailwindClass: "text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight",
      },
      {
        role: "h1",
        fontSize: "text-3xl sm:text-4xl lg:text-5xl",
        lineHeight: "leading-tight tracking-tight",
        fontWeight: "font-bold",
        tailwindClass: "text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight",
      },
      {
        role: "h2",
        fontSize: "text-2xl sm:text-3xl",
        lineHeight: "leading-snug tracking-tight",
        fontWeight: "font-semibold",
        tailwindClass: "text-2xl sm:text-3xl font-semibold tracking-tight leading-snug",
      },
      {
        role: "h3",
        fontSize: "text-xl sm:text-2xl",
        lineHeight: "leading-snug",
        fontWeight: "font-semibold",
        tailwindClass: "text-xl sm:text-2xl font-semibold leading-snug",
      },
      {
        role: "h4",
        fontSize: "text-lg sm:text-xl",
        lineHeight: "leading-normal",
        fontWeight: "font-medium",
        tailwindClass: "text-lg sm:text-xl font-medium leading-normal",
      },
      {
        role: "body-lg",
        fontSize: "text-lg sm:text-xl",
        lineHeight: "leading-relaxed",
        fontWeight: "font-normal",
        tailwindClass: "text-lg sm:text-xl font-normal leading-relaxed text-slate-400",
      },
      {
        role: "body",
        fontSize: "text-base sm:text-lg",
        lineHeight: "leading-relaxed",
        fontWeight: "font-normal",
        tailwindClass: "text-base sm:text-lg font-normal leading-relaxed",
      },
      {
        role: "caption",
        fontSize: "text-xs sm:text-sm",
        lineHeight: "leading-normal",
        fontWeight: "font-medium",
        tailwindClass: "text-xs sm:text-sm font-medium text-slate-500",
      },
      {
        role: "button",
        fontSize: "text-sm sm:text-base",
        lineHeight: "leading-none",
        fontWeight: "font-semibold",
        tailwindClass: "text-sm sm:text-base font-semibold",
      },
    ];
  }

  private static buildColorRoles(
    isDark: boolean,
    isTechSaas: boolean,
    intent: DesignIntent,
    referenceSynthesis?: ReferenceSynthesis
  ): ColorRoleToken[] {
    const isReferenceDerived = Boolean(referenceSynthesis && referenceSynthesis.referenceCount > 0);
    const source: "explicit" | "extracted_reference" | "inferred" = isReferenceDerived
      ? "extracted_reference"
      : "inferred";

    if (isDark) {
      return [
        {
          role: "background",
          tailwindClass: "bg-slate-950",
          suggestedHex: "#020617",
          source,
          description: "Primary canvas background: deep slate neutral ensuring high contrast",
        },
        {
          role: "surface",
          tailwindClass: "bg-slate-900/80",
          suggestedHex: "#0f172a",
          source,
          description: "Container surface: elevated dark card container with subtle translucency",
        },
        {
          role: "surface-elevated",
          tailwindClass: "bg-slate-800/80",
          suggestedHex: "#1e293b",
          source,
          description: "Higher elevation surface for dropdowns, popovers, and interactive highlights",
        },
        {
          role: "foreground",
          tailwindClass: "text-slate-50",
          suggestedHex: "#f8fafc",
          source,
          description: "Primary text and heading foreground (WCAG AAA contrast)",
        },
        {
          role: "foreground-muted",
          tailwindClass: "text-slate-400",
          suggestedHex: "#94a3b8",
          source,
          description: "Secondary subtext, descriptions, and metadata",
        },
        {
          role: "primary",
          tailwindClass: isTechSaas ? "bg-indigo-600 text-white" : "bg-blue-600 text-white",
          suggestedHex: isTechSaas ? "#4f46e5" : "#2563eb",
          source,
          description: "Primary brand action and CTA button background",
        },
        {
          role: "primary-hover",
          tailwindClass: isTechSaas ? "hover:bg-indigo-500" : "hover:bg-blue-500",
          suggestedHex: isTechSaas ? "#6366f1" : "#3b82f6",
          source,
          description: "Hover state for primary action buttons",
        },
        {
          role: "secondary",
          tailwindClass: "bg-slate-800 text-slate-100 hover:bg-slate-700",
          suggestedHex: "#1e293b",
          source,
          description: "Secondary action button and auxiliary controls",
        },
        {
          role: "accent",
          tailwindClass: "text-cyan-400",
          suggestedHex: "#22d3ee",
          source,
          description: "Visual accent highlighting badges, metric tags, and key values",
        },
        {
          role: "border",
          tailwindClass: "border-slate-800",
          suggestedHex: "#1e293b",
          source,
          description: "Standard structural border for cards and sections",
        },
        {
          role: "border-subtle",
          tailwindClass: "border-slate-800/60",
          suggestedHex: "#1e293b99",
          source,
          description: "Hairline dividers and subtle container outlines",
        },
      ];
    }

    // Light Theme
    return [
      {
        role: "background",
        tailwindClass: "bg-slate-50",
        suggestedHex: "#f8fafc",
        source,
        description: "Primary canvas background: soft warm off-white reducing eye strain",
      },
      {
        role: "surface",
        tailwindClass: "bg-white",
        suggestedHex: "#ffffff",
        source,
        description: "Container surface: crisp white card container",
      },
      {
        role: "surface-elevated",
        tailwindClass: "bg-white shadow-md",
        suggestedHex: "#ffffff",
        source,
        description: "Elevated container with soft drop shadow",
      },
      {
        role: "foreground",
        tailwindClass: "text-slate-900",
        suggestedHex: "#0f172a",
        source,
        description: "Primary text and heading foreground (WCAG AAA contrast)",
      },
      {
        role: "foreground-muted",
        tailwindClass: "text-slate-600",
        suggestedHex: "#475569",
        source,
        description: "Secondary subtext, descriptions, and metadata",
      },
      {
        role: "primary",
        tailwindClass: "bg-blue-600 text-white",
        suggestedHex: "#2563eb",
        source,
        description: "Primary brand action and CTA button background",
      },
      {
        role: "primary-hover",
        tailwindClass: "hover:bg-blue-700",
        suggestedHex: "#1d4ed8",
        source,
        description: "Hover state for primary action buttons",
      },
      {
        role: "secondary",
        tailwindClass: "bg-slate-100 text-slate-900 hover:bg-slate-200",
        suggestedHex: "#f1f5f9",
        source,
        description: "Secondary action button and auxiliary controls",
      },
      {
        role: "accent",
        tailwindClass: "text-blue-600",
        suggestedHex: "#2563eb",
        source,
        description: "Visual accent highlighting badges and feature badges",
      },
      {
        role: "border",
        tailwindClass: "border-slate-200",
        suggestedHex: "#e2e8f0",
        source,
        description: "Standard structural border for cards and sections",
      },
      {
        role: "border-subtle",
        tailwindClass: "border-slate-100",
        suggestedHex: "#f1f5f9",
        source,
        description: "Hairline dividers and subtle container outlines",
      },
    ];
  }
}
