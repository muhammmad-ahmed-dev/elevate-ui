import type { Page } from "playwright";
import type { MultiViewportResult, ViewportName } from "../../browser/types.js";
import type { Finding } from "../types.js";
import type { DeterministicRule, RuleInspectionContext } from "./rules/types.js";
import { AxeRule } from "./rules/axe.js";
import { TouchTargetRule, type TouchTargetRuleOptions } from "./rules/touch-target.js";
import { BrokenImageRule } from "./rules/broken-image.js";
import { HeadingRule } from "./rules/heading.js";
import { OverflowRule } from "./rules/overflow.js";
import { CLSRule } from "./rules/cls.js";
import { logger } from "../../utils/logger.js";

export interface RuleEvaluatorOptions {
  rules?: DeterministicRule[];
  touchTargetOptions?: TouchTargetRuleOptions;
}

export class RuleEvaluator {
  private rules: DeterministicRule[];

  constructor(options: RuleEvaluatorOptions = {}) {
    if (options.rules && options.rules.length > 0) {
      this.rules = options.rules;
    } else {
      this.rules = [
        new AxeRule(),
        new TouchTargetRule(options.touchTargetOptions),
        new BrokenImageRule(),
        new HeadingRule(),
        new OverflowRule(),
        new CLSRule(),
      ];
    }
  }

  public async evaluateViewport(context: RuleInspectionContext): Promise<Finding[]> {
    const findings: Finding[] = [];

    for (const rule of this.rules) {
      try {
        const ruleFindings = await rule.evaluate(context);
        findings.push(...ruleFindings);
      } catch (err: any) {
        logger.error(`Rule ${rule.name} failed on ${context.viewport.label}: ${err.message}`);
      }
    }

    return findings;
  }

  public async evaluateMultiViewport(
    multiViewportResult: MultiViewportResult,
    pages?: Partial<Record<ViewportName, Page>>
  ): Promise<Finding[]> {
    const start = Date.now();
    logger.step("DETERMINISTIC", `Running ${this.rules.length} rule evaluators across viewports...`);
    const allFindings: Finding[] = [];

    for (const [viewportName, extraction] of Object.entries(multiViewportResult.captures)) {
      const page = pages?.[viewportName as ViewportName];
      const context: RuleInspectionContext = {
        viewport: extraction.viewport,
        extraction,
        page,
      };

      const viewportFindings = await this.evaluateViewport(context);
      allFindings.push(...viewportFindings);
    }

    logger.success(
      `Deterministic analysis complete: flagged ${allFindings.length} issues (${Date.now() - start}ms)`
    );

    return allFindings;
  }
}
