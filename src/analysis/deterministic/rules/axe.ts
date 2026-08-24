import { AxeBuilder } from "@axe-core/playwright";
import type { DeterministicRule, RuleInspectionContext } from "./types.js";
import type { Finding, FindingSeverity } from "../../types.js";
import { logger } from "../../../utils/logger.js";

export class AxeRule implements DeterministicRule {
  public readonly name = "AxeAccessibilityRule";

  private mapImpactToSeverity(impact?: string | null): FindingSeverity {
    switch (impact) {
      case "critical":
        return "critical";
      case "serious":
        return "serious";
      case "moderate":
        return "moderate";
      case "minor":
        return "minor";
      default:
        return "moderate";
    }
  }

  public async evaluate(context: RuleInspectionContext): Promise<Finding[]> {
    const findings: Finding[] = [];

    if (!context.page) {
      // If no live Playwright page is passed (e.g. offline unit testing),
      // perform basic fallback accessibility checks on extracted DOM elements
      for (const el of context.extraction.elements) {
        if (el.tagName === "img" && !el.ariaLabel) {
          const imgSummary = context.extraction.images?.find((img) => img.selector === (el.id ? `#${el.id}` : el.tagName));
          if (imgSummary && !imgSummary.alt) {
            findings.push({
              id: `axe-image-alt-${context.viewport.name}-${findings.length + 1}`,
              category: "accessibility",
              severity: "critical",
              title: "Images must have alternate text (image-alt)",
              description: "Image element is missing an alt attribute, hindering screen reader accessibility.",
              evidence: { ruleId: "image-alt", selector: imgSummary.selector, src: imgSummary.src },
              selector: imgSummary.selector,
              boundingBox: imgSummary.boundingBox,
              viewport: context.viewport.name,
              source: "deterministic",
              deterministic: true,
              confidence: 1.0,
              proposedImprovement: "Add a meaningful alt attribute describing the image or alt=\"\" for decorative images.",
            });
          }
        }
      }
      return findings;
    }

    try {
      const results = await new AxeBuilder({ page: context.page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
        .analyze();

      for (const violation of results.violations) {
        const severity = this.mapImpactToSeverity(violation.impact);

        for (const [nodeIndex, node] of violation.nodes.entries()) {
          const selector = node.target?.join(" ") || `unknown-element-${nodeIndex}`;

          // Find bounding box from extracted elements if matching selector
          const matchedElement = context.extraction.elements.find(
            (e) => (e.id && selector.includes(e.id)) || (e.className && selector.includes(e.className.split(" ")[0]))
          );

          findings.push({
            id: `axe-${violation.id}-${context.viewport.name}-${findings.length + 1}`,
            category: "accessibility",
            severity,
            title: `${violation.help} (${violation.id})`,
            description: violation.description,
            evidence: {
              ruleId: violation.id,
              impact: violation.impact,
              helpUrl: violation.helpUrl,
              tags: violation.tags,
              html: node.html,
              failureSummary: node.failureSummary,
            },
            selector,
            boundingBox: matchedElement?.boundingBox,
            viewport: context.viewport.name,
            source: "deterministic",
            deterministic: true,
            confidence: 1.0,
            proposedImprovement: `Resolve WCAG violation for ${violation.id}: ${node.failureSummary || violation.help}. Learn more: ${violation.helpUrl}`,
          });
        }
      }
    } catch (err: any) {
      logger.warn(`Axe-core evaluation skipped on ${context.viewport.label}: ${err.message}`);
    }

    return findings;
  }
}
