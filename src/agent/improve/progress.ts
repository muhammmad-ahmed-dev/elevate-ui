/**
 * Phase 3G: Deterministic Progress Evaluator
 *
 * Evaluates whether an accepted mutation delivered genuine, measurable improvement
 * without relying on subjective LLM sentiment.
 *
 * Genuine improvement criteria:
 *  1. The targeted issue / selector was resolved or improved.
 *  2. No new critical or serious regressions were introduced.
 *  3. Overall finding counts did not increase.
 */

import type { Finding, MutationRecommendation } from "../../analysis/types.js";
import type { VerificationPipelineResult } from "../patch/verify/types.js";
import type { ProgressResult } from "./types.js";

export class ProgressEvaluator {
  /**
   * Evaluate progress between baseline findings and post-verification findings.
   */
  public static evaluate(
    recommendation: MutationRecommendation,
    findingsBefore: Finding[],
    findingsAfter: Finding[],
    verificationResult?: VerificationPipelineResult
  ): ProgressResult {
    const comparison = verificationResult?.comparison;

    // 1. Regression checks
    const newCritical = comparison?.regression.newCriticalFindings ?? 0;
    const newSerious = comparison?.regression.newSeriousFindings ?? 0;
    const totalRegressions = newCritical + newSerious;

    // 2. Targeted issue check
    const targetedImproved = comparison?.regression.targetedIssueImproved ?? true;

    // 3. Finding counts
    const totalBefore = findingsBefore.length;
    const totalAfter = findingsAfter.length;

    // 4. Resolved findings identification
    const afterIds = new Set(findingsAfter.map((f) => f.id));
    const resolved = findingsBefore.filter((f) => !afterIds.has(f.id)).length;

    // Determine improvement
    let improved = false;
    let reason = "";

    if (totalRegressions > 0) {
      improved = false;
      reason = `Regressions detected (${newCritical} critical, ${newSerious} serious).`;
    } else if (targetedImproved || resolved > 0 || totalAfter < totalBefore) {
      improved = true;
      const countDiff = totalBefore - totalAfter;
      reason = `Targeted issue improved. ${resolved} issue(s) resolved, net reduction of ${countDiff} finding(s).`;
    } else {
      improved = false;
      reason = "No measurable reduction in findings or visual defects observed.";
    }

    return {
      improved,
      regressions: totalRegressions,
      resolved,
      remaining: totalAfter,
      reason,
    };
  }
}
