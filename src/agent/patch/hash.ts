/**
 * Phase 3B: Patch Hash Utility
 *
 * Generates a deterministic SHA-256 hex digest of a patch string.
 * Used for traceability in MutationTransaction.patchHash.
 *
 * The hash is NOT a security boundary — it is an integrity /
 * traceability marker only.
 */

import { createHash } from "node:crypto";

/**
 * Compute a SHA-256 hex digest of the provided patch string.
 * Returns an empty string when the patch is empty/undefined.
 */
export function hashPatch(patch: string | undefined): string {
  if (!patch || patch.trim().length === 0) {
    return "";
  }
  return createHash("sha256").update(patch, "utf8").digest("hex");
}
