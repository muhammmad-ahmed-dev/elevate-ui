/**
 * Phase 3E: Deterministic Re-Audit + Regression Analysis
 *
 * Runs the existing deterministic analysis pipeline against the
 * after-mutation browser capture and compares it with the before-mutation
 * findings array to produce a structured RegressionSummary.
 *
 * Reuses:
 *  - RuleEvaluator (deterministic/evaluator.ts)
 *  - FindingNormalizer (normalization.ts)
 *  - FindingDeduplicator (deduplication.ts)
 *
 * Does NOT duplicate finding normalisation, deduplication, or prioritization.
 */

import type { Finding, MutationRecommendation } from "../../../analysis/types.js";
import type { MultiViewportResult } from "../../../browser/types.js";
import { RuleEvaluator } from "../../../analysis/deterministic/evaluator.js";
import { FindingNormalizer } from "../../../analysis/normalization.js";
import { FindingDeduplicator } from "../../../analysis/deduplication.js";
import { logger } from "../../../utils/logger.js";
import type {
  DeterministicComparisonResult,
  RegressionSummary,
  TargetedIssueComparison,
  VisualReanalysisResult,
  BeforeAfterComparison,
  VerificationGateResult,
  BrowserVerificationResult,
  RegressionAnalysisOptions,
} from "./types.js";

// ---------------------------------------------------------------------------
// Deterministic re-audit
// ---------------------------------------------------------------------------

/**
 * Run the deterministic analysis pipeline against after-mutation browser data.
 * Reuses RuleEvaluator, FindingNormalizer, FindingDeduplicator.
 */
export async function runDeterministicReaudit(
  captureResult: MultiViewportResult
): Promise<{ findings: Finding[]; errors: string[] }> {
  const start = Date.now();
  logger.step("VERIFY", "Running deterministic re-audit after mutation...");

  const errors: string[] = [];

  try {
    const evaluator = new RuleEvaluator();
    const rawFindings = await evaluator.evaluateMultiViewport(captureResult);
    const normalized = FindingNormalizer.normalize(rawFindings);
    const deduped = FindingDeduplicator.deduplicate(normalized);

    logger.success(
      `Deterministic re-audit complete: ${deduped.length} findings (${Date.now() - start}ms)`
    );
    return { findings: deduped, errors };
  } catch (err: any) {
    const msg = `Deterministic re-audit failed: ${err.message}`;
    logger.error(msg);
    errors.push(msg);
    return { findings: [], errors };
  }
}

// ---------------------------------------------------------------------------
// Before / after comparison
// ---------------------------------------------------------------------------

function countBySeverity(findings: Finding[], severity: "critical" | "serious"): number {
  return findings.filter((f) => f.severity === severity).length;
}

function countByCategory(
  findings: Finding[],
  category: string
): number {
  return findings.filter((f) => f.category === category).length;
}

/**
 * Compare before and after findings to detect regressions.
 * A "new" finding is one whose category + title + viewport combination
 * was NOT present in the before set.
 */
export function compareDeterministicFindings(
  before: Finding[],
  after: Finding[]
): DeterministicComparisonResult {
  // Key: `${category}|${title}|${viewport}` — coarse but stable fingerprint
  function key(f: Finding): string {
    return `${f.category}|${f.title.toLowerCase().trim()}|${f.viewport}`;
  }

  const beforeKeys = new Set(before.map(key));
  const afterKeys = new Set(after.map(key));

  const newFindings = after.filter((f) => !beforeKeys.has(key(f)));
  const resolvedFindings = before.filter((f) => !afterKeys.has(key(f)));
  const unchangedFindings = after.filter((f) => beforeKeys.has(key(f)));

  return {
    beforeFindings: before,
    afterFindings: after,
    newFindings,
    resolvedFindings,
    unchangedFindings,
    newCriticalCount: countBySeverity(newFindings, "critical"),
    newSeriousCount: countBySeverity(newFindings, "serious"),
    newAccessibilityCount: countByCategory(newFindings, "accessibility"),
    newOverflowCount: countByCategory(newFindings, "overflow"),
    newBrokenImageCount: countByCategory(newFindings, "broken-image"),
    newTouchTargetCount: countByCategory(newFindings, "touch-target"),
  };
}

// ---------------------------------------------------------------------------
// Targeted issue comparison
// ---------------------------------------------------------------------------

/**
 * Compare the specific issue targeted by the recommendation.
 *
 * Rules:
 * - "improved" = the targeted finding's category + selector no longer appears,
 *   OR its severity decreased, OR it moved from deterministic to no longer present.
 * - "degraded" = it was absent before and present after, OR severity increased.
 * - "neutral" = unchanged presence.
 *
 * Does NOT equate "different" with "improved".
 */
export function compareTargetedIssue(
  before: Finding[],
  after: Finding[],
  recommendation: MutationRecommendation
): TargetedIssueComparison {
  const selector = recommendation.affectedSelector?.toLowerCase().trim();
  const sourceFindingIdSet = new Set(recommendation.sourceFindingIds);

  // Find targeted findings before: either matching sourceFindingIds or matching selector
  let beforeTargeted = before.filter((f) => {
    if (sourceFindingIdSet.has(f.id)) return true;
    if (selector && f.selector && f.selector.toLowerCase().trim() === selector) return true;
    return false;
  });

  // Fallback if none matched by ID or selector: match by recommendation category
  if (beforeTargeted.length === 0 && before.length > 0) {
    const recCategory = recommendation.id.split("-").slice(2).join("-");
    beforeTargeted = before.filter((f) => f.category === recCategory);
  }

  // Get signatures of targeted issues: selectors and titles
  const targetedSelectors = new Set(
    beforeTargeted.map((f) => f.selector?.toLowerCase().trim()).filter(Boolean) as string[]
  );
  if (selector) targetedSelectors.add(selector);

  const targetedTitles = new Set(
    beforeTargeted.map((f) => f.title.toLowerCase().trim())
  );

  // Find targeted findings after: must match the targeted selector or the finding title
  const afterTargeted = after.filter((f) => {
    const fSel = f.selector?.toLowerCase().trim();
    if (fSel && targetedSelectors.has(fSel)) return true;
    const fTitle = f.title.toLowerCase().trim();
    if (targetedTitles.has(fTitle)) return true;
    return false;
  });

  const severityOrder: Record<string, number> = {
    critical: 4,
    serious: 3,
    moderate: 2,
    minor: 1,
    info: 0,
  };

  const beforeMaxSeverity = beforeTargeted.length > 0
    ? Math.max(...beforeTargeted.map((f) => severityOrder[f.severity] ?? 0))
    : -1;
  const afterMaxSeverity = afterTargeted.length > 0
    ? Math.max(...afterTargeted.map((f) => severityOrder[f.severity] ?? 0))
    : -1;

  // Clearly improved: finding gone, OR severity dropped
  const targetedIssueImproved =
    (beforeTargeted.length > 0 && afterTargeted.length === 0) ||
    (beforeTargeted.length > 0 && afterMaxSeverity < beforeMaxSeverity);

  // Clearly degraded: new finding introduced, OR severity increased
  const targetedIssueDegraded =
    (beforeTargeted.length === 0 && afterTargeted.length > 0) ||
    (beforeTargeted.length > 0 && afterMaxSeverity > beforeMaxSeverity);

  let rationale: string;
  if (targetedIssueImproved) {
    rationale = beforeTargeted.length > 0 && afterTargeted.length === 0
      ? `Targeted issue (${recommendation.affectedSelector ?? recommendation.id}) fully resolved after mutation.`
      : `Targeted issue severity reduced from ${beforeTargeted[0]?.severity} to ${afterTargeted[0]?.severity}.`;
  } else if (targetedIssueDegraded) {
    rationale = `Targeted issue worsened or introduced new occurrence after mutation.`;
  } else if (beforeTargeted.length === 0 && afterTargeted.length === 0) {
    rationale = "Targeted finding not detectable before or after — neutral result.";
  } else {
    rationale = "Targeted issue unchanged — same severity and presence before and after.";
  }

  return {
    recommendationId: recommendation.id,
    targetedIssueImproved,
    targetedIssueDegraded,
    evidenceBefore: beforeTargeted[0]?.evidence ?? {},
    evidenceAfter: afterTargeted[0]?.evidence ?? {},
    rationale,
  };
}

// ---------------------------------------------------------------------------
// Regression summary
// ---------------------------------------------------------------------------

/**
 * Combine all verification results into a single RegressionSummary.
 */
export function buildRegressionSummary(
  deterministicComparison: DeterministicComparisonResult,
  targetedComparison: TargetedIssueComparison,
  hardGates: VerificationGateResult[],
  browserCheck: BrowserVerificationResult,
  visualResult: VisualReanalysisResult,
  _options: RegressionAnalysisOptions = {}
): RegressionSummary {
  const hardGatesPassed = hardGates.every((g) => !g.mandatory || g.passed);
  const newRuntimeFailures = !browserCheck.success;

  // Visual regression: only flag if provider was available AND returned new findings
  const visualRegressionDetected = visualResult.available &&
    visualResult.errors.length === 0 &&
    visualResult.findings.some((f) => f.severity === "critical" || f.severity === "serious");

  const anyHardRegression =
    !hardGatesPassed ||
    deterministicComparison.newCriticalCount > 0 ||
    deterministicComparison.newOverflowCount > 0 ||
    newRuntimeFailures;

  return {
    targetedIssueImproved: targetedComparison.targetedIssueImproved,
    targetedIssueDegraded: targetedComparison.targetedIssueDegraded,
    newCriticalFindings: deterministicComparison.newCriticalCount,
    newSeriousFindings: deterministicComparison.newSeriousCount,
    newAccessibilityFindings: deterministicComparison.newAccessibilityCount,
    newOverflowFindings: deterministicComparison.newOverflowCount,
    newBrokenImageFindings: deterministicComparison.newBrokenImageCount,
    newTouchTargetFindings: deterministicComparison.newTouchTargetCount,
    newRuntimeFailures,
    visualRegressionDetected,
    hardGatesPassed,
    anyHardRegression,
  };
}

// ---------------------------------------------------------------------------
// Full regression assembly
// ---------------------------------------------------------------------------

/**
 * Build the complete BeforeAfterComparison object from all evidence.
 */
export function assembleBeforeAfterComparison(
  transactionId: string,
  recommendation: MutationRecommendation,
  findingsBefore: Finding[],
  findingsAfter: Finding[],
  hardGates: VerificationGateResult[],
  browserCheck: BrowserVerificationResult,
  visualResult: VisualReanalysisResult,
  options: RegressionAnalysisOptions = {}
): BeforeAfterComparison {
  const deterministicComparison = compareDeterministicFindings(findingsBefore, findingsAfter);
  const targetedIssueComparison = compareTargetedIssue(findingsBefore, findingsAfter, recommendation);
  const regression = buildRegressionSummary(
    deterministicComparison,
    targetedIssueComparison,
    hardGates,
    browserCheck,
    visualResult,
    options
  );

  return {
    transactionId,
    recommendationId: recommendation.id,
    findingsBefore,
    findingsAfter,
    deterministicComparison,
    targetedIssueComparison,
    visualReanalysis: visualResult,
    hardGates,
    browserCheck,
    regression,
  };
}
