/**
 * Phase 4D: Intelligent Design Planning & Agent Context Optimization
 * Type Definitions & Contracts
 *
 * Establishes Elevate as an Agent Director: converting user prompts, screenshots,
 * and existing repos into structured, token-efficient, high-signal design context
 * for external coding agents.
 */

// ---------------------------------------------------------------------------
// 1. Input Modes & Core Values
// ---------------------------------------------------------------------------

export type InputMode =
  | "BUILD_FROM_SCRATCH"
  | "REFERENCE_DRIVEN"
  | "EXISTING_SITE"
  | "HYBRID";

/**
 * Explicit vs Inferred value wrapper.
 * Every inferred property MUST be transparently tagged with confidence and rationale.
 */
export interface ExplicitOrInferred<T> {
  value: T;
  source: "explicit" | "inferred";
  confidence: number;
  rationale?: string;
}

export interface ReferenceImageInput {
  id?: string;
  filePath?: string;
  dataBase64?: string;
  mimeType?: string;
  description?: string;
  url?: string;
}

export interface UserRequest {
  /** Raw user prompt or instruction (e.g. "make a dark portfolio for a 3D artist"). */
  prompt?: string;

  /** Optional reference screenshots or URLs. */
  references?: (string | ReferenceImageInput)[];

  /** Optional path to an existing local repository. */
  existingRepoPath?: string;

  /** Optional live URL of an existing site. */
  existingUrl?: string;

  /** Existing audit findings from Elevate if already captured. */
  existingFindings?: any[];

  /** Explicit mode override if requested by user. */
  targetMode?: InputMode;

  /** Additional custom technical or design constraints. */
  customConstraints?: string[];
}

// ---------------------------------------------------------------------------
// 2. Intent Analysis
// ---------------------------------------------------------------------------

export type ProjectType =
  | "portfolio"
  | "saas_landing"
  | "ecommerce"
  | "blog"
  | "agency"
  | "documentation"
  | "dashboard"
  | "mobile_showcase"
  | "generic";

export interface DesignIntent {
  projectType: ExplicitOrInferred<ProjectType>;
  businessDomain: ExplicitOrInferred<string>;
  primaryGoal: ExplicitOrInferred<string>;
  targetAudience: ExplicitOrInferred<string>;
  desiredStyle: ExplicitOrInferred<string>;
  pages: ExplicitOrInferred<string[]>;
  primaryCta: ExplicitOrInferred<string>;
  secondaryCta?: ExplicitOrInferred<string>;
  functionalRequirements: string[];
  visualRequirements: string[];
  technicalConstraints: string[];
  knownPreferences: string[];
  missingInformation: string[];
  confidence: number;
}

// ---------------------------------------------------------------------------
// 3. Reference Analysis & Synthesis
// ---------------------------------------------------------------------------

export interface ReferenceCharacteristics {
  layoutStructure: string;
  heroComposition: string;
  navigationPattern: string;
  typographyHierarchy: string;
  spacingDensity: "compact" | "normal" | "spacious" | "airy";
  gridStructure: string;
  cardTreatment: string;
  ctaHierarchy: string;
  imageryTreatment: string;
  borderShadowStyle: string;
  colorRelationships: string;
  visualRhythm: string;
  negativeSpace: string;
  responsiveClues: string[];
}

export interface ReferenceAnalysis {
  referenceId: string;
  sourceType: "file" | "url" | "base64" | "description";
  label?: string;
  characteristics: ReferenceCharacteristics;
  confidence: number;
  keyTakeaways: string[];
}

export interface ReferenceSynthesis {
  referenceCount: number;
  dominantVisualLanguage: string;
  sharedCharacteristics: string[];
  selectedCharacteristics: {
    attribute: string;
    decision: string;
    rationale: string;
  }[];
  rejectedCharacteristics: {
    attribute: string;
    rejectedValue: string;
    reason: string;
  }[];
  conflictingStylesDetected: string[];
  synthesisRationale: string;
}

// ---------------------------------------------------------------------------
// 4. Design System Tokens
// ---------------------------------------------------------------------------

export interface TypographyToken {
  role: "display" | "h1" | "h2" | "h3" | "h4" | "body" | "body-lg" | "caption" | "button";
  fontSize: string;
  lineHeight: string;
  fontWeight: string;
  tailwindClass: string;
}

export interface ColorRoleToken {
  role:
    | "background"
    | "surface"
    | "surface-elevated"
    | "foreground"
    | "foreground-muted"
    | "primary"
    | "primary-hover"
    | "secondary"
    | "accent"
    | "border"
    | "border-subtle";
  tailwindClass: string;
  suggestedHex?: string;
  source: "explicit" | "extracted_reference" | "inferred";
  description: string;
}

export interface DesignSystem {
  name: string;
  themeStyle: string;
  typography: {
    fontFamilies: {
      sans: string;
      heading?: string;
      mono?: string;
    };
    scale: TypographyToken[];
  };
  spacingScale: {
    baseUnit: string;
    componentPadding: string;
    sectionPaddingMobile: string;
    sectionPaddingDesktop: string;
    containerMaxWidth: string;
  };
  radiusGuidance: {
    sm: string;
    md: string;
    lg: string;
    full: string;
  };
  elevationGuidance: {
    card: string;
    dropdown: string;
    modal: string;
  };
  colorRoles: ColorRoleToken[];
  layoutWidths: {
    container: string;
    content: string;
    narrow: string;
  };
  breakpoints: {
    mobile: string;
    tablet: string;
    desktop: string;
  };
  interactionStates: {
    buttonHover: string;
    cardHover: string;
    focusRing: string;
  };
}

// ---------------------------------------------------------------------------
// 5. Site Architecture & Component Planning
// ---------------------------------------------------------------------------

export interface PageSectionPlan {
  id: string;
  name: string;
  purpose: string;
  recommendedComponents: string[];
  contentPriorities: string[];
  cta?: string;
  layoutPattern: string;
}

export interface PagePlan {
  slug: string;
  title: string;
  purpose: string;
  isPrimary: boolean;
  sections: PageSectionPlan[];
}

export interface SitePlan {
  pages: PagePlan[];
  navigation: {
    desktopPattern: string;
    mobilePattern: string;
    sticky: boolean;
    items: { label: string; href: string }[];
  };
  userFlow: string[];
  ctaHierarchy: {
    primary: string;
    secondary?: string;
    tertiary?: string;
  };
  contentPriorities: string[];
}

export interface ComponentDefinition {
  name: string;
  filePath: string;
  role: string;
  responsibility: string;
  suggestedProps: string[];
  reusableElements: string[];
  responsiveBehavior: {
    mobile: string;
    tablet?: string;
    desktop: string;
  };
  allowedDesignTokens: string[];
  expectedVisualHierarchy: string;
}

export interface ComponentPlan {
  components: ComponentDefinition[];
  entryComponent: string;
  sharedUtilities: string[];
}

// ---------------------------------------------------------------------------
// 6. Responsive Strategy & Acceptance Criteria
// ---------------------------------------------------------------------------

export interface ViewportRuleSet {
  viewportName: "mobile (375px)" | "tablet (768px)" | "desktop (1440px)";
  widthPx: number;
  layoutStructure: string;
  navigationBehavior: string;
  typographyAdjustments: string;
  spacingDensity: string;
  gridColumns: string;
  ctaPlacement: string;
  overflowRules: string;
}

export interface ResponsivePlan {
  mobile375: ViewportRuleSet;
  tablet768: ViewportRuleSet;
  desktop1440: ViewportRuleSet;
  touchTargetMinimumPx: number;
  overflowPreventionStrategy: string;
}

export interface VisualPriorityItem {
  rank: number;
  title: string;
  description: string;
  category: "hierarchy" | "discovery" | "typography" | "cta" | "spacing" | "responsive" | "imagery";
}

export interface AcceptanceCriterion {
  id: string;
  category: "responsive" | "cta" | "layout" | "accessibility" | "visual_direction" | "performance";
  description: string;
  verificationMethod: "deterministic_check" | "browser_inspection" | "heuristic";
}

// ---------------------------------------------------------------------------
// 7. Design Brief
// ---------------------------------------------------------------------------

export interface DesignBrief {
  briefId: string;
  createdAt: string;
  inputMode: InputMode;
  projectGoal: string;
  targetAudience: string;
  projectType: ProjectType;
  brandDirection: string;
  visualDirection: string;
  contentHierarchy: string[];
  primaryCta: string;
  secondaryCta?: string;
  siteStructureSummary: string;
  responsiveStrategySummary: string;
  accessibilityExpectations: string[];
  performanceExpectations: string[];
  explicitRequirements: string[];
  inferredAssumptions: {
    attribute: string;
    assumedValue: string;
    confidence: number;
    reason: string;
  }[];
  referencesUsed: string[];
}

// ---------------------------------------------------------------------------
// 8. Agent Context & Metrics
// ---------------------------------------------------------------------------

export interface AgentContextMetrics {
  characterCount: number;
  estimatedTokens: number;
  fileCount: number;
  screenshotCount: number;
  requirementCount: number;
  repetitionCount: number;
  compressionRatio: number;
}

export interface AgentContext {
  contextId: string;
  mode: InputMode;
  systemDirective: string;
  structuredPrompt: string;
  metrics: AgentContextMetrics;
  generatedAt: string;
}

export interface AgentTaskContext {
  taskPrompt: string;
  targetFiles: string[];
  category: string;
  problemDescription: string;
  expectedVisualImprovement: string;
  customInstructions: string;
  designBrief: DesignBrief;
  sitePlan: SitePlan;
  componentPlan: ComponentPlan;
  designSystem: DesignSystem;
  responsivePlan: ResponsivePlan;
  acceptanceCriteria: AcceptanceCriterion[];
  metrics: AgentContextMetrics;
}

// ---------------------------------------------------------------------------
// 9. Director Result
// ---------------------------------------------------------------------------

export interface DesignPlanResult {
  planId: string;
  mode: InputMode;
  designIntent: DesignIntent;
  referenceSynthesis?: ReferenceSynthesis;
  designBrief: DesignBrief;
  sitePlan: SitePlan;
  componentPlan: ComponentPlan;
  designSystem: DesignSystem;
  responsivePlan: ResponsivePlan;
  visualPriorities: VisualPriorityItem[];
  acceptanceCriteria: AcceptanceCriterion[];
  agentContext: AgentContext;
  agentTaskContext: AgentTaskContext;
  humanSummary: string;
}
