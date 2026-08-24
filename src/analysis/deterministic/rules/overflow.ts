import type { DeterministicRule, RuleInspectionContext } from "./types.js";
import type { Finding } from "../../types.js";

export class OverflowRule implements DeterministicRule {
  public readonly name = "HorizontalOverflowRule";

  public evaluate(context: RuleInspectionContext): Finding[] {
    const findings: Finding[] = [];
    const issues = context.extraction.overflowIssues || [];

    for (const [index, issue] of issues.entries()) {
      const isSevere = issue.overflowAmount > 30;
      findings.push({
        id: `overflow-${context.viewport.name}-${index + 1}`,
        category: "overflow",
        severity: isSevere ? "critical" : "serious",
        title: `Horizontal layout overflow (+${Math.round(issue.overflowAmount)}px)`,
        description: `Element <${issue.element}> spills ${Math.round(issue.overflowAmount)}px beyond viewport width (scrollWidth: ${issue.scrollWidth}px vs clientWidth: ${issue.clientWidth}px) causing horizontal scrolling on ${context.viewport.label}.`,
        evidence: {
          element: issue.element,
          selector: issue.selector,
          overflowAmount: issue.overflowAmount,
          scrollWidth: issue.scrollWidth,
          clientWidth: issue.clientWidth,
        },
        selector: issue.selector,
        boundingBox: issue.boundingBox,
        viewport: context.viewport.name,
        source: "deterministic",
        deterministic: true,
        confidence: 1.0,
        proposedImprovement: `Add max-w-full, overflow-x-hidden, or replace fixed width (${issue.scrollWidth}px) with responsive container constraints (e.g. w-full max-w-screen-sm).`,
      });
    }

    return findings;
  }
}
