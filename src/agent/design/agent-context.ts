/**
 * Phase 4D: Agent Context Builder & Token Optimizer
 *
 * Compresses design plans into high-density, token-efficient prompt context
 * specifically engineered for external coding agents.
 *
 * CRITICAL REQUIREMENTS:
 * 1. Maximizes signal-to-noise ratio: includes only actionable implementation directives.
 * 2. Tracks explicit token efficiency metrics (character count, estimated tokens, repetition count).
 * 3. Clearly labels estimated tokens as estimates unless provider exposes exact counts.
 */

import type {
  AgentContext,
  AgentContextMetrics,
  AgentTaskContext,
  DesignBrief,
  SitePlan,
  ComponentPlan,
  DesignSystem,
  ResponsivePlan,
  VisualPriorityItem,
  AcceptanceCriterion,
  ReferenceSynthesis,
  InputMode,
} from "./types.js";

export class AgentContextBuilder {
  /**
   * Builds the compact, structured AgentContext and token metrics.
   */
  public static build(
    mode: InputMode,
    brief: DesignBrief,
    sitePlan: SitePlan,
    componentPlan: ComponentPlan,
    designSystem: DesignSystem,
    responsivePlan: ResponsivePlan,
    visualPriorities: VisualPriorityItem[],
    acceptanceCriteria: AcceptanceCriterion[],
    referenceSynthesis?: ReferenceSynthesis
  ): AgentContext {
    const contextId = `ctx-${Date.now()}`;
    const generatedAt = new Date().toISOString();

    const systemDirective =
      "You are an expert full-stack web developer and UI designer. Implement the specified web application using React/Next.js and Tailwind CSS with pixel-perfect responsive execution and accessible interactions.";

    const promptSections: string[] = [];

    // 1. Project Goal & Directive
    promptSections.push(
      `### 1. PROJECT OBJECTIVE & DOMAIN\n` +
        `- Type: ${brief.projectType.toUpperCase()}\n` +
        `- Domain: ${brief.brandDirection}\n` +
        `- Goal: ${brief.projectGoal}\n` +
        `- Audience: ${brief.targetAudience}\n` +
        `- Primary CTA: "${brief.primaryCta}"` +
        (brief.secondaryCta ? ` | Secondary CTA: "${brief.secondaryCta}"` : "")
    );

    // 2. Design Direction & Palette
    const colorSummary = designSystem.colorRoles
      .slice(0, 7)
      .map((c) => `${c.role}: ${c.tailwindClass}`)
      .join(" | ");

    promptSections.push(
      `### 2. DESIGN DIRECTION & DESIGN SYSTEM\n` +
        `- Visual Style: ${brief.visualDirection}\n` +
        `- Typography: Sans (${designSystem.typography.fontFamilies.sans.split(",")[0]}), Heading (${designSystem.typography.fontFamilies.heading?.split(",")[0] || "Sans"})\n` +
        `- Spacing Scale: 8pt grid (${designSystem.spacingScale.componentPadding}, ${designSystem.spacingScale.sectionPaddingDesktop})\n` +
        `- Core Tokens: ${colorSummary}\n` +
        `- Elevation: Card (${designSystem.elevationGuidance.card})\n` +
        `- Radius: Buttons/Inputs (${designSystem.radiusGuidance.md}), Cards (${designSystem.radiusGuidance.lg})`
    );

    // 3. Site Architecture
    const pageStructure = sitePlan.pages
      .map((p) => `* Page "${p.slug}" (${p.title}): ${p.sections.map((s) => s.name).join(" -> ")}`)
      .join("\n");

    promptSections.push(
      `### 3. SITE STRUCTURE & USER FLOW\n` +
        `${pageStructure}\n` +
        `- Navigation: ${sitePlan.navigation.desktopPattern} (Sticky: ${sitePlan.navigation.sticky})\n` +
        `- Flow: ${sitePlan.userFlow.join(" -> ")}`
    );

    // 4. Component Plan
    const componentLines = componentPlan.components.map((c) => {
      const tokens = c.allowedDesignTokens.slice(0, 2).join("; ");
      return `* \`${c.filePath}\` (${c.name}): ${c.responsibility}\n  - Responsive: Mobile: ${c.responsiveBehavior.mobile}; Desktop: ${c.responsiveBehavior.desktop}\n  - Tokens: ${tokens}`;
    });

    promptSections.push(
      `### 4. COMPONENT ARCHITECTURE & RESPONSIBILITIES\n` +
        `Entry: \`${componentPlan.entryComponent}\`\n` +
        componentLines.join("\n")
    );

    // 5. Ranked Visual Priorities
    const priorityLines = visualPriorities.map((p) => `${p.rank}. ${p.title}: ${p.description}`);
    promptSections.push(
      `### 5. RANKED VISUAL PRIORITIES\n` + priorityLines.join("\n")
    );

    // 6. Responsive Strategy (375px / 768px / 1440px)
    promptSections.push(
      `### 6. RESPONSIVE RULES (375px / 768px / 1440px)\n` +
        `- 375px (Mobile): ${responsivePlan.mobile375.layoutStructure}. ${responsivePlan.mobile375.navigationBehavior}. ${responsivePlan.mobile375.ctaPlacement}. Min touch target: ${responsivePlan.touchTargetMinimumPx}x${responsivePlan.touchTargetMinimumPx}px.\n` +
        `- 768px (Tablet): ${responsivePlan.tablet768.layoutStructure}. ${responsivePlan.tablet768.gridColumns}.\n` +
        `- 1440px (Desktop): ${responsivePlan.desktop1440.layoutStructure}. ${responsivePlan.desktop1440.navigationBehavior}.\n` +
        `- Overflow Rule: ${responsivePlan.overflowPreventionStrategy}`
    );

    // 7. Visual Reference Synthesis (if present)
    if (referenceSynthesis && referenceSynthesis.referenceCount > 0) {
      const selected = referenceSynthesis.selectedCharacteristics
        .map((s) => `${s.attribute}: ${s.decision}`)
        .join("; ");
      promptSections.push(
        `### 7. REFERENCE SYNTHESIS\n` +
          `- Visual Reference Language: ${referenceSynthesis.dominantVisualLanguage}\n` +
          `- Adopted Characteristics: ${selected}\n` +
          `- Rationale: ${referenceSynthesis.synthesisRationale}`
      );
    }

    // 8. Implementation Constraints & Guardrails
    promptSections.push(
      `### 8. TECHNICAL CONSTRAINTS & ACCESSIBILITY\n` +
        `- Strict WCAG AA compliance (4.5:1 text contrast minimum).\n` +
        `- Use semantic HTML5 elements (<header>, <nav>, <main>, <section>, <footer>).\n` +
        `- All interactive elements must have unique, descriptive IDs or aria-labels for browser automation tests.\n` +
        `- Do NOT hardcode arbitrary colors outside the design system.\n` +
        `- Do NOT use fixed pixel widths > 320px without max-w-full.`
    );

    // 9. Measurable Acceptance Criteria
    const criteriaLines = acceptanceCriteria.map((c, i) => `${i + 1}. [${c.category.toUpperCase()}] ${c.description}`);
    promptSections.push(
      `### 9. ACCEPTANCE CRITERIA\n` + criteriaLines.join("\n")
    );

    const structuredPrompt = promptSections.join("\n\n");

    // Calculate token efficiency metrics
    const metrics = this.calculateMetrics(
      structuredPrompt,
      componentPlan.components.map((c) => c.filePath),
      referenceSynthesis?.referenceCount || 0,
      acceptanceCriteria.length + visualPriorities.length
    );

    return {
      contextId,
      mode,
      systemDirective,
      structuredPrompt,
      metrics,
      generatedAt,
    };
  }

  /**
   * Constructs the bridge object `AgentTaskContext` for dispatching to `CodingAgentAdapter`.
   */
  public static buildTaskContext(
    mode: InputMode,
    brief: DesignBrief,
    sitePlan: SitePlan,
    componentPlan: ComponentPlan,
    designSystem: DesignSystem,
    responsivePlan: ResponsivePlan,
    visualPriorities: VisualPriorityItem[],
    acceptanceCriteria: AcceptanceCriterion[],
    referenceSynthesis?: ReferenceSynthesis
  ): AgentTaskContext {
    const agentContext = this.build(
      mode,
      brief,
      sitePlan,
      componentPlan,
      designSystem,
      responsivePlan,
      visualPriorities,
      acceptanceCriteria,
      referenceSynthesis
    );

    const targetFiles = componentPlan.components.map((c) => c.filePath);
    if (!targetFiles.includes(componentPlan.entryComponent)) {
      targetFiles.unshift(componentPlan.entryComponent);
    }

    return {
      taskPrompt: agentContext.structuredPrompt,
      targetFiles,
      category: `design-plan-${brief.projectType}`,
      problemDescription: `Implement ${brief.projectType} web design for '${brief.brandDirection}' adhering to design brief and responsive rules.`,
      expectedVisualImprovement: brief.visualDirection,
      customInstructions: agentContext.systemDirective,
      designBrief: brief,
      sitePlan,
      componentPlan,
      designSystem,
      responsivePlan,
      acceptanceCriteria,
      metrics: agentContext.metrics,
    };
  }

  /**
   * Analyzes context character length, estimated tokens, and detects repeated phrasing.
   */
  public static calculateMetrics(
    prompt: string,
    files: string[],
    screenshotCount: number,
    requirementCount: number
  ): AgentContextMetrics {
    const characterCount = prompt.length;
    // Standard heuristic: 1 token ≈ 4 characters
    const estimatedTokens = Math.ceil(characterCount / 4);

    // Calculate repetition by checking for duplicate sentences or lines
    const lines = prompt
      .split("\n")
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l.length > 20);

    const uniqueLines = new Set<string>();
    let repetitionCount = 0;
    for (const line of lines) {
      if (uniqueLines.has(line)) {
        repetitionCount++;
      } else {
        uniqueLines.add(line);
      }
    }

    // Unique structural line density ratio (1.0 = zero redundant lines, lower = higher redundancy)
    const compressionRatio = lines.length > 0
      ? Number((uniqueLines.size / lines.length).toFixed(2))
      : 1.0;

    return {
      characterCount,
      estimatedTokens,
      fileCount: files.length,
      screenshotCount,
      requirementCount,
      repetitionCount,
      compressionRatio,
    };
  }
}
