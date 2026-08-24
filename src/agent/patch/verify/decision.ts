/**
 * Phase 3E: Decision Gate
 *
 * Evaluates the BeforeAfterComparison and returns exactly one of:
 *   ACCEPT | ROLLBACK | ERROR | BLOCKED
 *
 * BINDING SAFETY RULES (from Phase 3D Final Gate):
 *  1. NEVER calls legacy safety git rollback.
 *  2. The only rollback path is MutationTransactionRunner.rollback(transaction).
 *  3. If rollback returns criticalError: true → decision = ERROR with recovery instructions.
 *  4. A soft visual improvement NEVER overrides a failed hard gate.
 */

import type { MutationTransaction } from "../../types.js";
import { MutationTransactionRunner } from "../transaction/transaction.js";
import { logger } from "../../../utils/logger.js";
import type {
  BeforeAfterComparison,
  DecisionGateResult,
  VerificationDecision,
  VerificationPipelineOptions,
} from "./types.js";

/** Human-readable recovery instructions when rollback fails. */
const CRITICAL_ROLLBACK_FAILURE_INSTRUCTIONS = [
  "CRITICAL: Elevate was unable to roll back the applied mutation.",
  "Your repository may be in a partially mutated state.",
  "Recovery steps:",
  "  1. Run: git stash list",
  "     Look for an entry matching 'elevate-tx-'. This contains your pre-mutation work.",
  "  2. If found, run: git stash pop --index",
  "  3. Run: git reflog",
  "     Find the commit hash immediately before the failed mutation (look for 'elevate')",
  "  4. Run: git reset --hard <commit-hash>",
  "  5. If all else fails, contact support with your transaction ID.",
];

export class DecisionGate {
  private runner: MutationTransactionRunner;

  constructor(projectRoot: string) {
    this.runner = new MutationTransactionRunner({ projectRoot });
  }

  /**
   * Evaluate all verification evidence and decide whether to ACCEPT or ROLLBACK.
   * If ROLLBACK or ERROR is chosen, performs the rollback through the authorised
   * MutationTransactionRunner.rollback() path.
   */
  public async evaluate(
    transaction: MutationTransaction,
    comparison: BeforeAfterComparison,
    options: Pick<
      VerificationPipelineOptions,
      "allowNeutralVisualResult" | "enableVisualReanalysis"
    > = {}
  ): Promise<DecisionGateResult> {
    const rationale: string[] = [];
    let decision: VerificationDecision = "ACCEPT";

    // --- 1. Hard gate failures are always ROLLBACK ---
    if (!comparison.regression.hardGatesPassed) {
      decision = "ROLLBACK";
      const failedGates = comparison.hardGates
        .filter((g) => g.mandatory && !g.passed)
        .map((g) => g.name);
      rationale.push(`HARD GATE FAILURE: ${failedGates.join(", ")} failed.`);
      logger.error(`DecisionGate: Hard gates failed → ROLLBACK (${failedGates.join(", ")})`);
    }

    // --- 2. Runtime / browser failure is always ROLLBACK ---
    if (comparison.regression.newRuntimeFailures) {
      decision = "ROLLBACK";
      rationale.push("RUNTIME FAILURE: Browser verification failed after mutation.");
      logger.error("DecisionGate: Browser verification failed → ROLLBACK");
    }

    // --- 3. New critical regression is always ROLLBACK ---
    if (comparison.regression.newCriticalFindings > 0) {
      decision = "ROLLBACK";
      rationale.push(
        `REGRESSION: ${comparison.regression.newCriticalFindings} new critical finding(s) introduced.`
      );
      logger.error(
        `DecisionGate: ${comparison.regression.newCriticalFindings} new critical findings → ROLLBACK`
      );
    }

    // --- 4. Targeted issue degraded is ROLLBACK ---
    if (comparison.regression.targetedIssueDegraded) {
      decision = "ROLLBACK";
      rationale.push(
        `REGRESSION: Targeted issue worsened. ${comparison.targetedIssueComparison.rationale}`
      );
      logger.error("DecisionGate: Targeted issue degraded → ROLLBACK");
    }

    // --- 5. New serious regressions are ROLLBACK (unless hard gate already caught it) ---
    if (comparison.regression.newSeriousFindings > 0 && decision === "ACCEPT") {
      decision = "ROLLBACK";
      rationale.push(
        `REGRESSION: ${comparison.regression.newSeriousFindings} new serious finding(s) introduced.`
      );
      logger.warn(
        `DecisionGate: ${comparison.regression.newSeriousFindings} new serious findings → ROLLBACK`
      );
    }

    // --- 6. Visual regression from confirmed provider ---
    if (comparison.regression.visualRegressionDetected && decision === "ACCEPT") {
      decision = "ROLLBACK";
      rationale.push("VISUAL REGRESSION: Provider detected new critical/serious visual issues.");
    }

    // --- 7. Accept conditions ---
    if (decision === "ACCEPT") {
      if (comparison.regression.targetedIssueImproved) {
        rationale.push(`ACCEPT: Targeted issue improved. ${comparison.targetedIssueComparison.rationale}`);
      } else if (options.allowNeutralVisualResult) {
        rationale.push("ACCEPT: No regressions detected. Neutral visual result allowed by policy.");
      } else if (!comparison.regression.targetedIssueImproved) {
        // No improvement and no policy to accept neutral → ROLLBACK
        decision = "ROLLBACK";
        rationale.push(
          `ROLLBACK: No targeted improvement detected. ${comparison.targetedIssueComparison.rationale}`
        );
        logger.warn("DecisionGate: No targeted improvement → ROLLBACK");
      }
    }

    // --- 8. If decision is not ACCEPT, execute rollback via authorized path ---
    if (decision !== "ACCEPT") {
      logger.warn(
        `DecisionGate: Executing rollback for transaction ${transaction.transactionId.slice(0, 8)}...`
      );
      const rollbackResult = await this.runner.rollback(transaction);

      if (rollbackResult.success) {
        logger.success("DecisionGate: Rollback succeeded. Repository restored.");
        return {
          decision,
          rationale,
          rollbackResult,
          transaction,
        };
      }

      // Rollback itself failed — escalate to ERROR / BLOCKED
      if (rollbackResult.criticalError) {
        logger.error(
          "DecisionGate: CRITICAL — rollback failed. Repository may be in inconsistent state."
        );
        return {
          decision: "ERROR",
          rationale: [
            ...rationale,
            "CRITICAL: Rollback failed. See recoveryInstructions for manual steps.",
          ],
          rollbackResult,
          recoveryInstructions: CRITICAL_ROLLBACK_FAILURE_INSTRUCTIONS,
          transaction,
        };
      }

      // Non-critical rollback failure (partial) — BLOCKED
      return {
        decision: "BLOCKED",
        rationale: [
          ...rationale,
          `Rollback did not fully succeed: ${rollbackResult.error}`,
        ],
        rollbackResult,
        recoveryInstructions: CRITICAL_ROLLBACK_FAILURE_INSTRUCTIONS,
        transaction,
      };
    }

    // --- decision = ACCEPT (no rollback needed) ---
    if (decision === "ACCEPT") {
      this.runner.complete(transaction);
      logger.success(
        `DecisionGate: ACCEPT — mutation verified. ${rationale[0] ?? ""}`
      );
    }

    return {
      decision,
      rationale,
      transaction,
    };
  }
}
