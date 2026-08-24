import type { DeterministicRule, RuleInspectionContext } from "./types.js";
import type { Finding } from "../../types.js";

export class HeadingRule implements DeterministicRule {
  public readonly name = "HeadingHierarchyRule";

  public evaluate(context: RuleInspectionContext): Finding[] {
    const findings: Finding[] = [];
    const headings = context.extraction.headings || [];

    if (headings.length === 0) {
      return findings;
    }

    const h1Headings = headings.filter((h) => h.level === 1);

    // 1. Check for missing H1
    if (h1Headings.length === 0 && headings.length > 0) {
      findings.push({
        id: `heading-missing-h1-${context.viewport.name}`,
        category: "heading-hierarchy",
        severity: "moderate",
        title: "Missing primary <h1> heading",
        description: `The document contains ${headings.length} subheadings but lacks a top-level <h1> heading to establish document structure.`,
        evidence: {
          totalHeadings: headings.length,
          firstHeadingFound: headings[0].tagName,
        },
        selector: headings[0].selector,
        boundingBox: headings[0].boundingBox,
        viewport: context.viewport.name,
        source: "deterministic",
        deterministic: true,
        confidence: 1.0,
        proposedImprovement: "Add a single, prominent <h1> heading representing the page title or primary headline.",
      });
    }

    // 2. Check for multiple H1 headings
    if (h1Headings.length > 1) {
      findings.push({
        id: `heading-multiple-h1-${context.viewport.name}`,
        category: "heading-hierarchy",
        severity: "minor",
        title: "Multiple <h1> headings on single page",
        description: `Found ${h1Headings.length} distinct <h1> elements. Standard accessibility best practices recommend one primary <h1> per document view.`,
        evidence: {
          h1Count: h1Headings.length,
          h1Texts: h1Headings.map((h) => h.textContent.slice(0, 50)),
        },
        selector: h1Headings[1].selector,
        boundingBox: h1Headings[1].boundingBox,
        viewport: context.viewport.name,
        source: "deterministic",
        deterministic: true,
        confidence: 0.95,
        proposedImprovement: "Change secondary <h1> headings to <h2> to maintain a unified document outline.",
      });
    }

    // 3. Check for skipped heading levels (e.g. h1 -> h3 or h2 -> h5)
    let previousLevel = 0;
    for (let i = 0; i < headings.length; i++) {
      const current = headings[i];
      if (previousLevel > 0 && current.level > previousLevel + 1) {
        findings.push({
          id: `heading-skipped-level-${context.viewport.name}-${findings.length + 1}`,
          category: "heading-hierarchy",
          severity: "moderate",
          title: `Skipped heading level (<h${previousLevel}> to <h${current.level}>)`,
          description: `Heading hierarchy jumped from <h${previousLevel}> to <h${current.level}> ("${current.textContent.slice(0, 40)}"), skipping <h${previousLevel + 1}>.`,
          evidence: {
            previousLevel,
            currentLevel: current.level,
            skippedLevels: Array.from({ length: current.level - previousLevel - 1 }, (_, idx) => previousLevel + 1 + idx),
            text: current.textContent,
          },
          selector: current.selector,
          boundingBox: current.boundingBox,
          viewport: context.viewport.name,
          source: "deterministic",
          deterministic: true,
          confidence: 1.0,
          proposedImprovement: `Adjust <${current.tagName}> to <h${previousLevel + 1}> to prevent breaking assistive technology reading order.`,
        });
      }
      previousLevel = current.level;
    }

    return findings;
  }
}
