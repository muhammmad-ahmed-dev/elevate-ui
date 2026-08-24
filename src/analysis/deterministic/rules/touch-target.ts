import type { DeterministicRule, RuleInspectionContext } from "./types.js";
import type { Finding } from "../../types.js";

export interface TouchTargetRuleOptions {
  minimumWidth?: number;
  minimumHeight?: number;
}

export class TouchTargetRule implements DeterministicRule {
  public readonly name = "TouchTargetRule";
  private minimumWidth: number;
  private minimumHeight: number;

  constructor(options: TouchTargetRuleOptions = {}) {
    this.minimumWidth = options.minimumWidth ?? 44;
    this.minimumHeight = options.minimumHeight ?? 44;
  }

  public evaluate(context: RuleInspectionContext): Finding[] {
    const findings: Finding[] = [];
    const interactiveTags = new Set(["button", "a", "input", "select", "textarea"]);
    const interactiveRoles = new Set([
      "button",
      "link",
      "menuitem",
      "tab",
      "checkbox",
      "radio",
      "switch",
      "option",
    ]);

    for (const el of context.extraction.elements) {
      const tag = el.tagName.toLowerCase();
      const role = el.role?.toLowerCase();
      const isInteractive = interactiveTags.has(tag) || (role && interactiveRoles.has(role));

      if (!isInteractive) {
        continue;
      }

      const { width, height } = el.boundingBox;

      // Skip elements that are zero-sized (hidden / invisible)
      if (width <= 0 || height <= 0) {
        continue;
      }

      if (width < this.minimumWidth || height < this.minimumHeight) {
        const selector = el.id ? `#${el.id}` : (el.className ? `${tag}.${el.className.split(" ")[0]}` : tag);
        const isSeverelyUndersized = width < 30 || height < 30;

        findings.push({
          id: `touch-target-${context.viewport.name}-${findings.length + 1}`,
          category: "touch-target",
          severity: isSeverelyUndersized ? "serious" : "moderate",
          title: `Undersized interactive touch target on <${tag}>`,
          description: `Interactive element has physical dimensions ${Math.round(width)}x${Math.round(height)}px, which fails the ${this.minimumWidth}x${this.minimumHeight}px touch target requirement on ${context.viewport.label}.`,
          evidence: {
            actualWidth: width,
            actualHeight: height,
            minimumWidth: this.minimumWidth,
            minimumHeight: this.minimumHeight,
            tagName: tag,
            role: el.role,
            textContent: el.textContent,
          },
          selector,
          boundingBox: el.boundingBox,
          viewport: context.viewport.name,
          source: "deterministic",
          deterministic: true,
          confidence: 1.0,
          proposedImprovement: `Increase the interactive target area to at least ${this.minimumWidth}x${this.minimumHeight}px by increasing padding (e.g. p-2.5 or p-3) or setting min-w-[${this.minimumWidth}px] min-h-[${this.minimumHeight}px].`,
        });
      }
    }

    return findings;
  }
}
