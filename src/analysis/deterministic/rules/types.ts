import type { Page } from "playwright";
import type { ViewportConfig, ViewportExtraction } from "../../../browser/types.js";
import type { Finding } from "../../types.js";

export interface RuleInspectionContext {
  viewport: ViewportConfig;
  extraction: ViewportExtraction;
  page?: Page;
}

export interface DeterministicRule {
  readonly name: string;
  evaluate(context: RuleInspectionContext): Promise<Finding[]> | Finding[];
}
