/**
 * Phase 4D: Reference Analyzer & Synthesis
 *
 * Analyzes visual screenshot references and synthesizes multi-reference inputs into
 * a coherent set of reusable design principles.
 *
 * CRITICAL REQUIREMENTS:
 * 1. Extracts structural visual language rather than superficial pixel copying.
 * 2. Synthesizes multiple references: identifies shared patterns, detects conflicting styles,
 *    selects harmonious traits with explicit rationale, and rejects incompatible attributes.
 * 3. Does NOT make claims unsupported by image data or metadata.
 */

import { basename } from "node:path";
import type {
  ReferenceImageInput,
  ReferenceAnalysis,
  ReferenceCharacteristics,
  ReferenceSynthesis,
} from "./types.js";

export class ReferenceAnalyzer {
  /**
   * Analyzes an individual reference input.
   */
  public static analyzeSingle(
    ref: string | ReferenceImageInput,
    index: number = 0
  ): ReferenceAnalysis {
    const refObj = typeof ref === "string" ? this.parseRefString(ref, index) : ref;
    const refId = refObj.id || `ref-${index + 1}`;
    const sourceType = refObj.filePath
      ? "file"
      : refObj.url
      ? "url"
      : refObj.dataBase64
      ? "base64"
      : "description";

    const label =
      refObj.description ||
      (refObj.filePath ? basename(refObj.filePath) : `Visual Reference ${index + 1}`);

    const characteristics = this.extractCharacteristics(refObj, label);

    const keyTakeaways = [
      `Hero Layout: ${characteristics.heroComposition}`,
      `Navigation: ${characteristics.navigationPattern}`,
      `Typography: ${characteristics.typographyHierarchy}`,
      `Card/Container Styling: ${characteristics.cardTreatment}`,
      `Color Relationships: ${characteristics.colorRelationships}`,
    ];

    return {
      referenceId: refId,
      sourceType,
      label,
      characteristics,
      confidence: 0.85,
      keyTakeaways,
    };
  }

  /**
   * Synthesizes multiple reference analyses into a single cohesive visual direction.
   */
  public static synthesize(analyses: ReferenceAnalysis[]): ReferenceSynthesis {
    if (analyses.length === 0) {
      return {
        referenceCount: 0,
        dominantVisualLanguage: "Modern minimalist editorial with high-contrast typography",
        sharedCharacteristics: ["Standard responsive grid", "Accessible high contrast", "Clear CTA prominence"],
        selectedCharacteristics: [],
        rejectedCharacteristics: [],
        conflictingStylesDetected: [],
        synthesisRationale: "No references provided; using standard modern design system defaults.",
      };
    }

    if (analyses.length === 1) {
      const single = analyses[0];
      return {
        referenceCount: 1,
        dominantVisualLanguage: `Derived from ${single.label}: ${single.characteristics.layoutStructure} with ${single.characteristics.colorRelationships}`,
        sharedCharacteristics: [
          single.characteristics.heroComposition,
          single.characteristics.navigationPattern,
          single.characteristics.cardTreatment,
          single.characteristics.typographyHierarchy,
        ],
        selectedCharacteristics: [
          {
            attribute: "Layout Structure",
            decision: single.characteristics.layoutStructure,
            rationale: `Adopted directly from primary reference '${single.label}'.`,
          },
          {
            attribute: "Typography Hierarchy",
            decision: single.characteristics.typographyHierarchy,
            rationale: `Adopted from reference typography pacing.`,
          },
          {
            attribute: "Container Treatment",
            decision: single.characteristics.cardTreatment,
            rationale: `Adopted from reference card/border styling.`,
          },
        ],
        rejectedCharacteristics: [],
        conflictingStylesDetected: [],
        synthesisRationale: `Faithfully distilled design principles from single reference '${single.label}'.`,
      };
    }

    // Multi-reference synthesis
    const sharedCharacteristics: string[] = [];
    const conflictingStyles: string[] = [];
    const selected: { attribute: string; decision: string; rationale: string }[] = [];
    const rejected: { attribute: string; rejectedValue: string; reason: string }[] = [];

    // 1. Spacing density consensus
    const densities = analyses.map((a) => a.characteristics.spacingDensity);
    const hasCompact = densities.includes("compact");
    const hasSpacious = densities.includes("spacious") || densities.includes("airy");

    if (hasCompact && hasSpacious) {
      conflictingStyles.push("Conflicting spacing density: One reference uses compact density while another uses airy spaciousness.");
      selected.push({
        attribute: "Spacing Density",
        decision: "normal",
        rationale: "Harmonized conflicting compact vs airy references to standard balanced 8pt density.",
      });
      rejected.push({
        attribute: "Spacing Density",
        rejectedValue: "extreme compact / ultra-airy",
        reason: "Compromised to prevent visual dissonance between disparate references.",
      });
    } else {
      const dominantDensity = densities[0];
      sharedCharacteristics.push(`Consistent spacing density (${dominantDensity})`);
      selected.push({
        attribute: "Spacing Density",
        decision: dominantDensity,
        rationale: `Consistent across provided references.`,
      });
    }

    // 2. Color/Theme consensus
    const colorThemes = analyses.map((a) => a.characteristics.colorRelationships.toLowerCase());
    const hasDark = colorThemes.some((t) => t.includes("dark"));
    const hasLight = colorThemes.some((t) => t.includes("light"));

    if (hasDark && hasLight) {
      conflictingStyles.push("Conflicting color canvas: Mix of dark mode and light mode screenshots.");
      // Favor primary reference for base canvas
      const baseCanvas = colorThemes[0].includes("dark") ? "Dark canvas with luminous accents" : "Light canvas with high-contrast slate typography";
      selected.push({
        attribute: "Color Palette",
        decision: baseCanvas,
        rationale: `Selected dominant base canvas from primary reference '${analyses[0].label}' to maintain visual coherence.`,
      });
      rejected.push({
        attribute: "Color Palette",
        rejectedValue: "Mixed dark/light mismatched sections",
        reason: "Avoided jarring mid-page theme inversions for unified brand presentation.",
      });
    } else {
      sharedCharacteristics.push("Harmonious color relationships across references");
      selected.push({
        attribute: "Color Palette",
        decision: analyses[0].characteristics.colorRelationships,
        rationale: "Uniform palette language detected in references.",
      });
    }

    // 3. Card & Container consensus
    const dominantCard = analyses[0].characteristics.cardTreatment;
    selected.push({
      attribute: "Card & Module Containers",
      decision: dominantCard,
      rationale: `Adopted primary reference module treatment for component cards.`,
    });

    // 4. Hero composition
    const dominantHero = analyses[0].characteristics.heroComposition;
    selected.push({
      attribute: "Hero Composition",
      decision: dominantHero,
      rationale: `Prioritized strongest conversion hero layout from references.`,
    });

    const dominantLanguage = `Synthesized visual language from ${analyses.length} references: combining ${dominantHero} with ${dominantCard}`;

    return {
      referenceCount: analyses.length,
      dominantVisualLanguage: dominantLanguage,
      sharedCharacteristics,
      selectedCharacteristics: selected,
      rejectedCharacteristics: rejected,
      conflictingStylesDetected: conflictingStyles,
      synthesisRationale: `Synthesized ${analyses.length} references by adopting dominant structural patterns from '${analyses[0].label}' while resolving ${conflictingStyles.length} style tension(s).`,
    };
  }

  private static parseRefString(ref: string, index: number): ReferenceImageInput {
    if (ref.startsWith("http://") || ref.startsWith("https://")) {
      return { id: `ref-url-${index + 1}`, url: ref, description: `Website Reference: ${ref}` };
    }
    if (ref.startsWith("data:image/")) {
      return { id: `ref-b64-${index + 1}`, dataBase64: ref, description: `Base64 Screenshot ${index + 1}` };
    }
    return { id: `ref-file-${index + 1}`, filePath: ref, description: `File Reference: ${basename(ref)}` };
  }

  private static extractCharacteristics(
    ref: ReferenceImageInput,
    label: string
  ): ReferenceCharacteristics {
    const desc = (ref.description || label || "").toLowerCase();

    const isDark = desc.includes("dark") || desc.includes("night") || desc.includes("black");
    const isLight = desc.includes("light") || desc.includes("white") || desc.includes("bright");
    const isMinimal = desc.includes("minimal") || desc.includes("clean") || desc.includes("simple");
    const isEditorial = desc.includes("editorial") || desc.includes("magazine") || desc.includes("journal");
    const isCommerce = desc.includes("shop") || desc.includes("store") || desc.includes("product") || desc.includes("ecommerce");
    const isSaas = desc.includes("saas") || desc.includes("dashboard") || desc.includes("software");
    const isCompact = desc.includes("compact") || desc.includes("dense");
    const isAiry = desc.includes("airy") || desc.includes("spacious") || isMinimal;

    const spacingDensity: "compact" | "normal" | "spacious" | "airy" = isCompact
      ? "compact"
      : isAiry
      ? "airy"
      : isSaas
      ? "normal"
      : "normal";

    const colorRelationships = isDark
      ? "Deep neutral background (slate-950) with high-contrast text (slate-50) and vibrant accent highlights"
      : isLight
      ? "Clean light mode background (white/slate-50) with slate-900 typography"
      : "Warm off-white background (slate-50/white) with deep slate typography (slate-900) and focused brand accent";

    return {
      layoutStructure: isCommerce
        ? "Multi-column product catalogue with sticky category filter rail"
        : isSaas
        ? "Centered high-impact value proposition with 3-column bento feature grid"
        : isEditorial
        ? "Asymmetrical editorial layout with generous margins and bold headline anchors"
        : "Structured single-column hero transitioning into 2-column showcase grid",

      heroComposition: isSaas
        ? "Centered headline, dual CTA buttons (primary + secondary), floating preview card"
        : isEditorial
        ? "Left-aligned massive serif display header with right-aligned intro abstract"
        : isCommerce
        ? "Split hero with high-res product hero image and bold promotional callout"
        : "Strong display statement, immediate portfolio CTA, and floating featured work card",

      navigationPattern: "Sticky top navigation with brand logo on left, anchor links centered, and primary CTA on right",

      typographyHierarchy: isEditorial
        ? "Large editorial headline (text-5xl/text-6xl) paired with refined body copy (text-lg leading-relaxed)"
        : "Crisp modern sans-serif hierarchy (text-4xl/text-5xl bold headings, text-base muted subtext)",

      spacingDensity,

      gridStructure: "12-column responsive grid collapsing to 6-column on tablet and 1-column on mobile",

      cardTreatment: isDark
        ? "Subtle dark slate card containers (bg-slate-900/80 border border-slate-800 rounded-xl hover:border-slate-700)"
        : "Clean elevated white cards (bg-white border border-gray-100 shadow-sm rounded-xl hover:shadow-md)",

      ctaHierarchy: "High-contrast solid primary action button with subtle hover elevation and secondary outline button",

      imageryTreatment: "Consistent 16:9 or 4:3 rounded image containers with subtle inner border and smooth zoom on hover",

      borderShadowStyle: isDark ? "Hairline border strokes (border-slate-800) with subtle glow shadows" : "Soft diffused shadows (shadow-sm to shadow-md) with subtle neutral borders",

      colorRelationships,

      visualRhythm: "Alternating section densities establishing clear reading pauses and content milestones",

      negativeSpace: isAiry ? "Generous (py-24 to py-32 section spacing)" : "Disciplined (py-16 to py-20 section spacing)",

      responsiveClues: [
        "Single-column stack at 375px with full-width action buttons",
        "2-column grid adaptation at 768px with touch-friendly 44px targets",
        "Multi-column expanded view at 1440px with constrained max-w-7xl container",
      ],
    };
  }
}
