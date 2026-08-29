/**
 * Phase 4D: Intent Analyzer
 *
 * Parses raw user requests into a structured DesignIntent object.
 *
 * CRITICAL REQUIREMENTS:
 * 1. Strictly separates EXPLICIT user requirements from INFERRED defaults.
 * 2. Does NOT hallucinate specific names, fake companies, testimonials, or arbitrary brand colors.
 * 3. Identifies missing information cleanly without interrogating or blocking the user.
 */

import type {
  UserRequest,
  DesignIntent,
  ProjectType,
  ExplicitOrInferred,
} from "./types.js";
import { SmartDefaultsGenerator, ARCHETYPES } from "./smart-defaults.js";

interface KeywordPattern {
  type: ProjectType;
  regex: RegExp;
  weight: number;
}

const PROJECT_TYPE_PATTERNS: KeywordPattern[] = [
  {
    type: "portfolio",
    regex: /\b(portfolio|showcase|resume|cv|personal\s+site|my\s+work|creative\s+director|designer\s+portfolio|photographer|artist|developer\s+portfolio)\b/i,
    weight: 1.0,
  },
  {
    type: "saas_landing",
    regex: /\b(saas|software|platform|b2b|landing\s+page|startup|subscription|app\s+landing|product\s+launch|pricing\s+tier)\b/i,
    weight: 0.95,
  },
  {
    type: "ecommerce",
    regex: /\b(ecommerce|e-commerce|shop|store|retail|products?|cart|checkout|merchandise|boutique|buy|catalog)\b/i,
    weight: 0.95,
  },
  {
    type: "blog",
    regex: /\b(blog|articles?|newsletter|journal|publication|editorial|posts?|news|essays?|writings?)\b/i,
    weight: 0.9,
  },
  {
    type: "agency",
    regex: /\b(agency|studio|consultancy|digital\s+agency|firm|services\s+company|creative\s+studio|client\s+work)\b/i,
    weight: 0.9,
  },
  {
    type: "documentation",
    regex: /\b(docs|documentation|api\s+reference|guides?|manual|developer\s+docs|handbook|knowledge\s+base)\b/i,
    weight: 0.95,
  },
  {
    type: "dashboard",
    regex: /\b(dashboard|analytics|admin|console|metrics|portal|data\s+view|cockpit)\b/i,
    weight: 0.95,
  },
  {
    type: "mobile_showcase",
    regex: /\b(mobile\s+app|ios\s+app|android\s+app|app\s+store|google\s+play|download\s+app)\b/i,
    weight: 0.9,
  },
];

const STYLE_KEYWORDS = [
  { keyword: "dark", value: "Dark mode modern aesthetic with deep neutral backgrounds and luminous accents" },
  { keyword: "light", value: "Clean light mode aesthetic with crisp typography and subtle surface separation" },
  { keyword: "minimal", value: "Minimalist restrained design emphasizing whitespace, typography, and essential elements" },
  { keyword: "editorial", value: "Editorial magazine-style layout with strong typography contrast and asymmetric pacing" },
  { keyword: "glassmorphism", value: "Modern frosted glass surfaces with subtle backdrop blur and hairline border strokes" },
  { keyword: "brutalist", value: "Neo-brutalist high-contrast styling with bold outlines, vivid solids, and raw typography" },
  { keyword: "playful", value: "Energetic playful visual direction with rounded corners, friendly typography, and warm tones" },
  { keyword: "corporate", value: "Executive corporate presentation with balanced structure, restrained navy/slate tones, and clear trust indicators" },
  { keyword: "luxury", value: "Premium luxury presentation with elegant typography, generous margins, and subtle metallic or monochromatic accents" },
  { keyword: "cyberpunk", value: "Futuristic high-tech visual language with neon accents, dark canvas, and monospace annotations" },
];

export class IntentAnalyzer {
  /**
   * Analyzes a UserRequest to produce a complete DesignIntent.
   */
  public static analyze(request: UserRequest): DesignIntent {
    const rawPrompt = (request.prompt || "").trim();
    const existingFindings = request.existingFindings || [];

    // 1. Detect Project Type
    const { projectType, isExplicitProjectType, typeConfidence } = this.detectProjectType(rawPrompt, request);
    const archetype = ARCHETYPES[projectType];

    // 2. Detect Business Domain & Specialization
    const domainResult = this.detectBusinessDomain(rawPrompt, projectType, archetype);

    // 3. Detect Desired Style
    const styleResult = this.detectDesiredStyle(rawPrompt, archetype);

    // 4. Detect Target Audience
    const audienceResult = this.detectAudience(rawPrompt, archetype);

    // 5. Detect Primary & Secondary Goals
    const goalResult = this.detectPrimaryGoal(rawPrompt, projectType, archetype);

    // 6. Detect Pages Required
    const pagesResult = this.detectPages(rawPrompt, archetype);

    // 7. Detect CTAs
    const { primaryCta, secondaryCta } = this.detectCtas(rawPrompt, archetype);

    // 8. Extract Functional & Visual Requirements
    const functionalRequirements = this.extractFunctionalRequirements(rawPrompt, archetype);
    const visualRequirements = this.extractVisualRequirements(rawPrompt, archetype, existingFindings);

    // 9. Extract Technical Constraints & Preferences
    const technicalConstraints = this.extractTechnicalConstraints(rawPrompt, request);
    const knownPreferences = this.extractKnownPreferences(rawPrompt);

    // 10. Identify Missing Information
    const missingInformation = this.identifyMissingInformation(rawPrompt, projectType, isExplicitProjectType);

    // Overall confidence calculation
    const overallConfidence = Number(
      (
        (typeConfidence +
          domainResult.confidence +
          styleResult.confidence +
          goalResult.confidence +
          audienceResult.confidence) /
        5
      ).toFixed(2)
    );

    return {
      projectType: isExplicitProjectType
        ? SmartDefaultsGenerator.createExplicit(projectType, "Explicitly stated in user prompt.")
        : SmartDefaultsGenerator.createInferred(
            projectType,
            typeConfidence,
            `Inferred from contextual keywords in prompt "${rawPrompt.slice(0, 40)}..."`
          ),
      businessDomain: domainResult,
      primaryGoal: goalResult,
      targetAudience: audienceResult,
      desiredStyle: styleResult,
      pages: pagesResult,
      primaryCta,
      secondaryCta,
      functionalRequirements,
      visualRequirements,
      technicalConstraints,
      knownPreferences,
      missingInformation,
      confidence: overallConfidence,
    };
  }

  private static detectProjectType(
    prompt: string,
    request: UserRequest
  ): { projectType: ProjectType; isExplicitProjectType: boolean; typeConfidence: number } {
    if (!prompt) {
      if (request.existingUrl || request.existingRepoPath) {
        return { projectType: "generic", isExplicitProjectType: false, typeConfidence: 0.6 };
      }
      return { projectType: "portfolio", isExplicitProjectType: false, typeConfidence: 0.5 };
    }

    for (const pattern of PROJECT_TYPE_PATTERNS) {
      if (pattern.regex.test(prompt)) {
        return {
          projectType: pattern.type,
          isExplicitProjectType: true,
          typeConfidence: pattern.weight,
        };
      }
    }

    return {
      projectType: "generic",
      isExplicitProjectType: false,
      typeConfidence: 0.65,
    };
  }

  private static detectBusinessDomain(
    prompt: string,
    projectType: ProjectType,
    archetype: typeof ARCHETYPES[ProjectType]
  ): ExplicitOrInferred<string> {
    // Check for explicit domain qualifiers (e.g. "for a 3D artist", "for a coffee shop", "for a legal firm")
    const domainMatch = prompt.match(/\b(?:for|about|representing)\s+(?:an?|the)?\s*([a-zA-Z0-9\s-]+?)(?:\s+(?:website|site|app|portfolio|landing\s+page|landing)|\.|$)/i);
    if (domainMatch && domainMatch[1] && domainMatch[1].trim().length > 2) {
      const explicitDomain = domainMatch[1].trim();
      return SmartDefaultsGenerator.createExplicit(
        `${explicitDomain} (${archetype.businessDomain})`,
        `Explicitly tailored for "${explicitDomain}" from prompt.`
      );
    }

    return SmartDefaultsGenerator.createInferred(
      archetype.businessDomain,
      0.75,
      `Standard domain positioning for ${projectType} projects.`
    );
  }

  private static detectDesiredStyle(
    prompt: string,
    archetype: typeof ARCHETYPES[ProjectType]
  ): ExplicitOrInferred<string> {
    const matchedStyles: string[] = [];

    for (const item of STYLE_KEYWORDS) {
      const regex = new RegExp(`\\b${item.keyword}\\b`, "i");
      if (regex.test(prompt)) {
        matchedStyles.push(item.value);
      }
    }

    if (matchedStyles.length > 0) {
      return SmartDefaultsGenerator.createExplicit(
        matchedStyles.join("; "),
        `Explicit styling preferences extracted from keywords in prompt.`
      );
    }

    return SmartDefaultsGenerator.createInferred(
      archetype.desiredStyle,
      0.72,
      `Sensible modern styling default for ${archetype.projectType} applications.`
    );
  }

  private static detectAudience(
    prompt: string,
    archetype: typeof ARCHETYPES[ProjectType]
  ): ExplicitOrInferred<string> {
    const audienceMatch = prompt.match(/\b(?:target(?:ing)?|audience|for)\s+(?:is\s+)?([a-zA-Z0-9\s,-]+?)(?:\.|$)/i);
    if (audienceMatch && audienceMatch[1] && audienceMatch[1].length > 4 && !audienceMatch[1].includes("website")) {
      return SmartDefaultsGenerator.createExplicit(
        audienceMatch[1].trim(),
        `Explicit target audience identified in user request.`
      );
    }

    return SmartDefaultsGenerator.createInferred(
      archetype.targetAudience,
      0.7,
      `Standard user demographic and viewer persona for ${archetype.projectType}.`
    );
  }

  private static detectPrimaryGoal(
    prompt: string,
    projectType: ProjectType,
    archetype: typeof ARCHETYPES[ProjectType]
  ): ExplicitOrInferred<string> {
    const goalMatch = prompt.match(/\b(?:goal|objective|purpose|want\s+to)\s+(?:is\s+to\s+)?([a-zA-Z0-9\s,-]+?)(?:\.|$)/i);
    if (goalMatch && goalMatch[1] && goalMatch[1].length > 5) {
      return SmartDefaultsGenerator.createExplicit(
        goalMatch[1].trim(),
        `Explicit project objective provided in user request.`
      );
    }

    return SmartDefaultsGenerator.createInferred(
      archetype.primaryGoal,
      0.75,
      `Primary conversion objective established for ${projectType} category.`
    );
  }

  private static detectPages(
    prompt: string,
    archetype: typeof ARCHETYPES[ProjectType]
  ): ExplicitOrInferred<string[]> {
    if (/\b(?:one[- ]page|single[- ]page|landing\s+page\s+only)\b/i.test(prompt)) {
      return SmartDefaultsGenerator.createExplicit(
        ["Home (Single Page with Anchored Sections)"],
        "Explicitly requested single-page architecture."
      );
    }

    const pagesMatch = prompt.match(/\bpages?:?\s*([a-zA-Z0-9\s,/-]+?)(?:\.|$)/i);
    if (pagesMatch && pagesMatch[1]) {
      const explicitPages = pagesMatch[1]
        .split(/[,/]/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      if (explicitPages.length > 0) {
        return SmartDefaultsGenerator.createExplicit(
          explicitPages,
          "Explicit page list specified in prompt."
        );
      }
    }

    return SmartDefaultsGenerator.createInferred(
      archetype.pages,
      0.8,
      `Standard multi-section page architecture for ${archetype.projectType}.`
    );
  }

  private static detectCtas(
    prompt: string,
    archetype: typeof ARCHETYPES[ProjectType]
  ): { primaryCta: ExplicitOrInferred<string>; secondaryCta?: ExplicitOrInferred<string> } {
    const ctaMatch = prompt.match(/\b(?:primary\s+)?(?:cta|button|call[- ]to[- ]action):?\s*(?:is\s+|to\s+|should\s+be\s+)?["']?([^"'.\n\r]+?)["']?(?:\.|$|\n)/i);
    if (ctaMatch && ctaMatch[1] && ctaMatch[1].length > 2) {
      return {
        primaryCta: SmartDefaultsGenerator.createExplicit(
          ctaMatch[1].trim(),
          "Explicit Call to Action label specified in prompt."
        ),
        secondaryCta: archetype.secondaryCta
          ? SmartDefaultsGenerator.createInferred(archetype.secondaryCta, 0.7, "Complementary secondary action.")
          : undefined,
      };
    }

    return {
      primaryCta: SmartDefaultsGenerator.createInferred(
        archetype.primaryCta,
        0.8,
        `Standard primary action for ${archetype.projectType}.`
      ),
      secondaryCta: archetype.secondaryCta
        ? SmartDefaultsGenerator.createInferred(
            archetype.secondaryCta,
            0.7,
            `Standard secondary action for ${archetype.projectType}.`
          )
        : undefined,
    };
  }

  private static extractFunctionalRequirements(
    prompt: string,
    archetype: typeof ARCHETYPES[ProjectType]
  ): string[] {
    const requirements: string[] = [...archetype.functionalRequirements];

    // Detect specific requested functional features
    if (/\b(pricing|tiers|billing)\b/i.test(prompt)) {
      requirements.push("Tiered pricing matrix with monthly/annual billing option");
    }
    if (/\b(filter|search|sort)\b/i.test(prompt)) {
      requirements.push("Interactive filtering, category selection, and instant search");
    }
    if (/\b(dark\s+mode|theme\s+toggle)\b/i.test(prompt)) {
      requirements.push("Dark mode / light mode theme toggle control");
    }
    if (/\b(contact|form|inquiry|lead)\b/i.test(prompt)) {
      requirements.push("Accessible client contact / lead capture form with validation");
    }
    if (/\b(animation|motion|micro-interaction)\b/i.test(prompt)) {
      requirements.push("Subtle CSS/Tailwind transitions and hover state micro-animations");
    }

    return Array.from(new Set(requirements));
  }

  private static extractVisualRequirements(
    prompt: string,
    archetype: typeof ARCHETYPES[ProjectType],
    existingFindings: any[]
  ): string[] {
    const visual: string[] = [...archetype.visualRequirements];

    // Always enforce core visual discipline
    visual.push("Strict adherence to 8pt spatial grid scale (p-2, p-4, p-6, p-8, p-12)");
    visual.push("WCAG AA color contrast compliance (minimum 4.5:1 for body text, 3:1 for large text)");
    visual.push("Zero horizontal scrollbar/overflow across all viewports (375px, 768px, 1440px)");
    visual.push("Interactive touch targets must meet minimum 44x44px bounding area on mobile");

    if (existingFindings.length > 0) {
      visual.push(`Directly address ${existingFindings.length} previously detected visual/accessibility defect(s)`);
    }

    return Array.from(new Set(visual));
  }

  private static extractTechnicalConstraints(
    prompt: string,
    request: UserRequest
  ): string[] {
    const constraints: string[] = [
      "Use React/Next.js component structure with semantic HTML5 elements",
      "Use modern Tailwind CSS utility classes for styling without ad-hoc inline styles",
      "Ensure all interactive elements have unique, descriptive IDs or aria-labels for testing",
      "Preserve existing exports and component signatures if augmenting an existing project",
    ];

    if (request.customConstraints && request.customConstraints.length > 0) {
      constraints.push(...request.customConstraints);
    }

    return constraints;
  }

  private static extractKnownPreferences(prompt: string): string[] {
    const preferences: string[] = [];

    if (/\b(dark\s+mode|dark\s+theme|dark)\b/i.test(prompt)) {
      preferences.push("Preference for dark background canvas and luminous typography");
    }
    if (/\b(minimal|clean|simple)\b/i.test(prompt)) {
      preferences.push("Preference for uncluttered layouts with generous negative space");
    }
    if (/\b(modern|sleek|futuristic)\b/i.test(prompt)) {
      preferences.push("Preference for crisp edges, modern geometry, and subtle border highlights");
    }
    if (/\b(fast|performance|lightweight)\b/i.test(prompt)) {
      preferences.push("Preference for lightweight DOM footprint and optimal render performance");
    }

    return preferences;
  }

  private static identifyMissingInformation(
    prompt: string,
    projectType: ProjectType,
    isExplicit: boolean
  ): string[] {
    const missing: string[] = [];

    if (!isExplicit) {
      missing.push(`Specific business niche (defaulting to archetype: ${projectType})`);
    }
    if (!/\b(color|palette|brand|theme)\b/i.test(prompt)) {
      missing.push("Explicit brand color palette (using modern harmonious archetype tokens)");
    }
    if (!/\b(logo|imagery|assets|photos)\b/i.test(prompt)) {
      missing.push("Custom brand imagery or photography (using semantic SVG placeholders/layout cards)");
    }
    if (!/\b(contact|email|phone|social)\b/i.test(prompt)) {
      missing.push("Specific contact destinations (using standardized contact form and links)");
    }

    return missing;
  }
}
