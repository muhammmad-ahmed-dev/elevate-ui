/**
 * Phase 4D: Agent Director (Main Design Planning Orchestrator)
 *
 * Directs, structures, and optimizes user requests across 4 input modes:
 *   1. BUILD_FROM_SCRATCH
 *   2. REFERENCE_DRIVEN
 *   3. EXISTING_SITE
 *   4. HYBRID
 *
 * CRITICAL REQUIREMENTS:
 * 1. Read-only execution: planning never modifies workspace files directly.
 * 2. Formulates high-density, token-efficient agent context.
 * 3. Bridges design plans directly to CodingAgentAdapter instances without hardcoded lock-in.
 */

import type {
  UserRequest,
  InputMode,
  DesignPlanResult,
  ReferenceAnalysis,
  ReferenceSynthesis,
} from "./types.js";
import { IntentAnalyzer } from "./intent.js";
import { ReferenceAnalyzer } from "./references.js";
import { SitePlanner } from "./site-plan.js";
import { ComponentPlanner } from "./component-plan.js";
import { DesignSystemGenerator } from "./design-system.js";
import { ResponsivePlanner } from "./responsive-plan.js";
import { VisualPrioritiesGenerator } from "./visual-priorities.js";
import { AcceptanceCriteriaGenerator } from "./acceptance.js";
import { DesignBriefAssembler } from "./brief.js";
import { AgentContextBuilder } from "./agent-context.js";

export class AgentDirector {
  /**
   * Automatically detects the appropriate InputMode from user request attributes.
   */
  public static detectMode(request: UserRequest): InputMode {
    if (request.targetMode) {
      return request.targetMode;
    }

    const hasReferences = Boolean(request.references && request.references.length > 0);
    const hasExistingSite = Boolean(
      request.existingRepoPath || request.existingUrl || (request.existingFindings && request.existingFindings.length > 0)
    );

    if (hasExistingSite && hasReferences) {
      return "HYBRID";
    }
    if (hasExistingSite) {
      return "EXISTING_SITE";
    }
    if (hasReferences) {
      return "REFERENCE_DRIVEN";
    }
    return "BUILD_FROM_SCRATCH";
  }

  /**
   * Plans a complete design blueprint and produces optimized agent context.
   */
  public static plan(request: UserRequest): DesignPlanResult {
    const planId = `plan-${Date.now()}`;
    const mode = this.detectMode(request);

    // 1. Intent Analysis
    const intent = IntentAnalyzer.analyze(request);

    // 2. Reference Analysis & Synthesis (if references provided)
    let referenceSynthesis: ReferenceSynthesis | undefined;
    if (request.references && request.references.length > 0) {
      const analyses: ReferenceAnalysis[] = request.references.map((ref, idx) =>
        ReferenceAnalyzer.analyzeSingle(ref, idx)
      );
      referenceSynthesis = ReferenceAnalyzer.synthesize(analyses);
    }

    // 3. Site Architecture Plan
    const sitePlan = SitePlanner.generate(intent);

    // 4. Component Breakdown Plan
    const componentPlan = ComponentPlanner.generate(sitePlan, intent);

    // 5. Lightweight Design System
    const designSystem = DesignSystemGenerator.generate(intent, referenceSynthesis);

    // 6. Multi-Viewport Responsive Plan (375px / 768px / 1440px)
    const responsivePlan = ResponsivePlanner.generate(intent);

    // 7. Ranked Visual Priorities
    const visualPriorities = VisualPrioritiesGenerator.generate(intent);

    // 8. Measurable Acceptance Criteria
    const acceptanceCriteria = AcceptanceCriteriaGenerator.generate(intent, responsivePlan);

    // 9. Comprehensive Design Brief
    const designBrief = DesignBriefAssembler.assemble(
      mode,
      intent,
      sitePlan,
      responsivePlan,
      referenceSynthesis
    );

    // 10. Optimized Agent Context & Token Metrics
    const agentContext = AgentContextBuilder.build(
      mode,
      designBrief,
      sitePlan,
      componentPlan,
      designSystem,
      responsivePlan,
      visualPriorities,
      acceptanceCriteria,
      referenceSynthesis
    );

    const agentTaskContext = AgentContextBuilder.buildTaskContext(
      mode,
      designBrief,
      sitePlan,
      componentPlan,
      designSystem,
      responsivePlan,
      visualPriorities,
      acceptanceCriteria,
      referenceSynthesis
    );

    // 11. Human-Readable Presentation Summary
    const humanSummary = this.formatHumanSummary(
      mode,
      intent,
      designBrief,
      sitePlan,
      componentPlan,
      responsivePlan,
      agentContext.metrics
    );

    return {
      planId,
      mode,
      designIntent: intent,
      referenceSynthesis,
      designBrief,
      sitePlan,
      componentPlan,
      designSystem,
      responsivePlan,
      visualPriorities,
      acceptanceCriteria,
      agentContext,
      agentTaskContext,
      humanSummary,
    };
  }

  /**
   * Generates a structured, clean human-readable summary for console / CLI display.
   */
  private static formatHumanSummary(
    mode: InputMode,
    intent: ReturnType<typeof IntentAnalyzer.analyze>,
    brief: ReturnType<typeof DesignBriefAssembler.assemble>,
    sitePlan: ReturnType<typeof SitePlanner.generate>,
    componentPlan: ReturnType<typeof ComponentPlanner.generate>,
    responsivePlan: ReturnType<typeof ResponsivePlanner.generate>,
    metrics: ReturnType<typeof AgentContextBuilder.calculateMetrics>
  ): string {
    const pageStructure = sitePlan.pages
      .map((p) => `  * ${p.title} (${p.slug}): ${p.sections.map((s) => s.name).join(" -> ")}`)
      .join("\n");

    const componentList = componentPlan.components
      .map((c) => `  * ${c.name} (${c.filePath})`)
      .join("\n");

    const inferredList = brief.inferredAssumptions
      .slice(0, 4)
      .map((a) => `  * Inferred ${a.attribute}: "${a.assumedValue}" (${Math.round(a.confidence * 100)}% confidence)`)
      .join("\n");

    return [
      `================================================================================`,
      `ELEVATE AGENT DIRECTOR — DESIGN BLUEPRINT`,
      `================================================================================`,
      `PROJECT:      ${brief.brandDirection}`,
      `MODE:         ${mode}`,
      `TYPE:         ${brief.projectType.toUpperCase()}`,
      `GOAL:         ${brief.projectGoal}`,
      `AUDIENCE:     ${brief.targetAudience}`,
      `STYLE:        ${brief.visualDirection}`,
      `PRIMARY CTA:  ${brief.primaryCta}`,
      ``,
      `SITE STRUCTURE:`,
      pageStructure,
      ``,
      `PLANNED COMPONENTS:`,
      componentList,
      ``,
      `RESPONSIVE TARGETS:`,
      `  * Mobile:  375px (min touch target: ${responsivePlan.touchTargetMinimumPx}x${responsivePlan.touchTargetMinimumPx}px)`,
      `  * Tablet:  768px (2-col grid reflow)`,
      `  * Desktop: 1440px (max-w-7xl centered canvas)`,
      ``,
      brief.inferredAssumptions.length > 0 ? `INFERRED ASSUMPTIONS:\n${inferredList}\n` : "",
      `AGENT CONTEXT TOKEN METRICS:`,
      `  * Estimated Tokens:  ~${metrics.estimatedTokens} tokens (${metrics.characterCount} chars)`,
      `  * Target Files:      ${metrics.fileCount}`,
      `  * Acceptance Rules:  ${metrics.requirementCount}`,
      `  * Repetition Count:  ${metrics.repetitionCount} (0 repeated blocks)`,
      `================================================================================`,
      `STATUS: Agent Context Ready for Execution`,
      `================================================================================`,
    ]
      .filter((line) => line !== undefined && line !== null)
      .join("\n");
  }
}
