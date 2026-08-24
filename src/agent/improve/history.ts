/**
 * Phase 3G: Recommendation History & Fingerprinting
 *
 * Tracks the complete lifecycle of recommendations considered across passes,
 * computes deterministic fingerprints to prevent repeating identical proposals,
 * and excludes failed, rolled-back, or superseded recommendations from future passes.
 */

import { createHash } from "node:crypto";
import type { MutationRecommendation } from "../../analysis/types.js";
import type {
  RecommendationHistoryItem,
  RecommendationStatus,
} from "./types.js";
import type { VerificationDecision } from "../patch/verify/types.js";

/**
 * Computes a deterministic normalized fingerprint for a recommendation.
 *
 * Fingerprint combines:
 *  - Target CSS selector (trimmed & lowercase)
 *  - Problem statement keywords
 *  - Proposed improvement keywords
 *  - Source finding IDs (sorted)
 */
export function computeRecommendationFingerprint(
  rec: MutationRecommendation
): string {
  const normSelector = (rec.affectedSelector || "").trim().toLowerCase();
  const normProblem = (rec.problem || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const normImprovement = (rec.proposedImprovement || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const sortedFindingIds = [...(rec.sourceFindingIds || [])].sort().join(",");

  const raw = `${normSelector}|${normProblem}|${normImprovement}|${sortedFindingIds}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

export class RecommendationHistoryTracker {
  private history: RecommendationHistoryItem[] = [];
  private attemptedFingerprints = new Set<string>();
  private attemptedIds = new Set<string>();

  /**
   * Check if a recommendation has already been attempted in this run (by ID or fingerprint).
   */
  public isAttempted(rec: MutationRecommendation): boolean {
    if (this.attemptedIds.has(rec.id)) return true;
    const fp = computeRecommendationFingerprint(rec);
    return this.attemptedFingerprints.has(fp);
  }

  /**
   * Check if a recommendation proposes an identical change to an earlier proposal.
   */
  public isRepeated(rec: MutationRecommendation): boolean {
    const fp = computeRecommendationFingerprint(rec);
    return this.attemptedFingerprints.has(fp);
  }

  /**
   * Register a newly selected recommendation for an upcoming pass attempt.
   */
  public recordAttempt(rec: MutationRecommendation, passNumber: number): RecommendationHistoryItem {
    const fingerprint = computeRecommendationFingerprint(rec);
    this.attemptedIds.add(rec.id);
    this.attemptedFingerprints.add(fingerprint);

    const item: RecommendationHistoryItem = {
      recommendationId: rec.id,
      fingerprint,
      problem: rec.problem,
      proposedImprovement: rec.proposedImprovement,
      affectedSelector: rec.affectedSelector,
      affectedComponents: rec.affectedComponents,
      sourceFindingIds: rec.sourceFindingIds || [],
      passNumber,
      status: "ATTEMPTED",
    };

    this.history.push(item);
    return item;
  }

  /**
   * Update the final outcome of an attempted recommendation.
   */
  public updateStatus(
    recId: string,
    status: RecommendationStatus,
    details?: {
      reason?: string;
      transactionId?: string;
      decision?: VerificationDecision;
    }
  ): void {
    const item = this.history.find((h) => h.recommendationId === recId);
    if (item) {
      item.status = status;
      if (details?.reason) item.reasonSkippedOrRejected = details.reason;
      if (details?.transactionId) item.transactionId = details.transactionId;
      if (details?.decision) item.decision = details.decision;
    }
  }

  /**
   * Record skipped or superseded recommendations.
   */
  public recordSkipped(
    rec: MutationRecommendation,
    passNumber: number,
    status: RecommendationStatus,
    reason: string
  ): void {
    const fingerprint = computeRecommendationFingerprint(rec);
    this.history.push({
      recommendationId: rec.id,
      fingerprint,
      problem: rec.problem,
      proposedImprovement: rec.proposedImprovement,
      affectedSelector: rec.affectedSelector,
      affectedComponents: rec.affectedComponents,
      sourceFindingIds: rec.sourceFindingIds || [],
      passNumber,
      status,
      reasonSkippedOrRejected: reason,
    });
  }

  /**
   * Filter candidate recommendations by excluding previously attempted, rolled back, or failed ones.
   */
  public filterCandidates(recommendations: MutationRecommendation[]): MutationRecommendation[] {
    return recommendations.filter((rec) => !this.isAttempted(rec));
  }

  /**
   * Retrieve complete recommendation history.
   */
  public getHistory(): RecommendationHistoryItem[] {
    return [...this.history];
  }

  /**
   * Get counts of considered, accepted, rolled back, and skipped recommendations.
   */
  public getStats(): { considered: number; accepted: number; rolledBack: number; skipped: number } {
    return {
      considered: this.history.length,
      accepted: this.history.filter((h) => h.status === "ACCEPTED").length,
      rolledBack: this.history.filter((h) => h.status === "ROLLED_BACK").length,
      skipped: this.history.filter((h) => h.status === "SKIPPED" || h.status === "SUPERSEDED").length,
    };
  }
}
