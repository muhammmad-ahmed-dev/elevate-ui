/**
 * Phase 3F: Recommendation Selector
 *
 * Selects the single highest-priority, actionable recommendation from Phase 2
 * audit findings for a single-pass improvement attempt.
 *
 * Selection criteria:
 *  - Highest rank/priority in the synthesized recommendation list.
 *  - Confidence threshold (>= minConfidence, default 0.5).
 *  - Well-defined problem statement and actionable improvement.
 *  - Identified target selector or source finding evidence.
 *
 * READ-ONLY: Does not modify any state or filesystem.
 */

import type { MutationRecommendation } from "../../analysis/types.js";
import { logger } from "../../utils/logger.js";

export interface RecommendationSelectorOptions {
  /** Minimum model confidence required to attempt mutation (0.0–1.0). Default: 0.5. */
  minConfidence?: number;
  /** Disallow recommendations marked with 'high' risk unless explicitly permitted. Default: false. */
  allowHighRisk?: boolean;
}

/**
 * Select the single best actionable recommendation from a list.
 *
 * @param recommendations  Synthesized recommendations from Phase 2 audit.
 * @param options          Filtering options.
 * @returns The chosen MutationRecommendation, or null if no actionable candidates exist.
 */
export function selectBestRecommendation(
  recommendations: MutationRecommendation[],
  options: RecommendationSelectorOptions = {}
): MutationRecommendation | null {
  if (!recommendations || recommendations.length === 0) {
    logger.info("RecommendationSelector: No recommendations provided.");
    return null;
  }

  const minConfidence = options.minConfidence ?? 0.5;
  const allowHighRisk = options.allowHighRisk ?? false;

  for (const rec of recommendations) {
    // 1. Confidence check
    if (typeof rec.confidence === "number" && rec.confidence < minConfidence) {
      logger.dim(
        `RecommendationSelector: Skipping '${rec.id}' — confidence ${rec.confidence} below threshold ${minConfidence}.`
      );
      continue;
    }

    // 2. Risk check
    if (!allowHighRisk && rec.risk === "high") {
      logger.dim(
        `RecommendationSelector: Skipping '${rec.id}' — high risk rejected by policy.`
      );
      continue;
    }

    // 3. Problem and action validity check
    if (!rec.problem?.trim() || !rec.proposedImprovement?.trim()) {
      logger.dim(
        `RecommendationSelector: Skipping '${rec.id}' — missing problem or proposed improvement.`
      );
      continue;
    }

    // 4. Must have target selector or source findings
    const hasTargetSelector = Boolean(rec.affectedSelector && rec.affectedSelector.trim());
    const hasSourceFindings = Array.isArray(rec.sourceFindingIds) && rec.sourceFindingIds.length > 0;
    const hasEvidence = rec.evidence && Object.keys(rec.evidence).length > 0;

    if (!hasTargetSelector && !hasSourceFindings && !hasEvidence) {
      logger.dim(
        `RecommendationSelector: Skipping '${rec.id}' — lacks concrete target selector or evidence.`
      );
      continue;
    }

    logger.info(
      `RecommendationSelector: Selected '${rec.id}' (${rec.proposedImprovement.slice(0, 60)}...) [Confidence: ${Math.round((rec.confidence ?? 1) * 100)}%, Risk: ${rec.risk}]`
    );
    return rec;
  }

  logger.info("RecommendationSelector: No recommendation satisfied actionable criteria.");
  return null;
}
