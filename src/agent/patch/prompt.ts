/**
 * Phase 3B: Patch Generation Prompt Builder
 *
 * Constructs the strictly-constrained prompt sent to any patch provider.
 * All constraint language is embedded here, not scattered across providers.
 *
 * READ-ONLY: nothing in this module modifies files.
 */

import type { PatchGenerationRequest, SourceFileContext } from "./types.js";

// ---------------------------------------------------------------------------
// System-level constraint block (constant for all requests)
// ---------------------------------------------------------------------------

const MUTATION_CONSTRAINT_BLOCK = `
=== ELEVATE MUTATION CONSTRAINTS — READ CAREFULLY ===

You are a targeted visual-design patch generator.
Your ONLY job is to produce a minimal unified diff that addresses the specific visual recommendation below.

MANDATORY RULES — NEVER VIOLATE THESE:
1. ONLY modify files listed in the "AUTHORISED FILES" section.
2. ONLY modify the specific component or selector identified in the recommendation.
3. DO NOT modify any other component, file, or module.
4. DO NOT change React hook logic (useState, useEffect, useMemo, useCallback, useRef, useContext, useReducer).
5. DO NOT change any state management code (Redux, Zustand, Jotai, Recoil, etc.).
6. DO NOT add, remove, or change any API calls, fetch() calls, or network requests.
7. DO NOT change any server actions, server-only code, or backend logic.
8. DO NOT change any authentication, session, or authorization code.
9. DO NOT change any database queries, ORM calls, or data-access logic.
10. DO NOT change routing logic, Next.js page exports, or layout files unrelated to the selector.
11. DO NOT add, remove, or change any import statements for external packages (no new dependencies).
12. DO NOT change package.json, tsconfig.json, or any configuration file.
13. DO NOT change any .env or environment configuration.
14. DO NOT generate a full file replacement — produce only a targeted unified diff.
15. DO NOT change exported function signatures that other modules depend on.
16. DO NOT produce unrelated refactors or code-quality improvements.
17. KEEP THE DIFF AS SMALL AS POSSIBLE. Every extra line increases risk.

ALLOWED CHANGES (visual presentation only):
- JSX structure changes WITHIN the targeted component only
- Tailwind CSS class additions, removals, or replacements
- className attribute changes
- Inline style changes for visual properties (color, spacing, typography)
- Responsive class variants (sm:, md:, lg:, xl:)
- Decorative layout changes within the targeted component

OUTPUT FORMAT — STRICTLY REQUIRED:
Return ONLY a valid JSON object. No markdown. No prose. No explanations outside the JSON.

{
  "patch": "<unified diff text with --- a/path, +++ b/path headers>",
  "files": ["<relative/path/to/file>"],
  "summary": "<one sentence describing the change>",
  "expectedImpact": "<one sentence on expected visual improvement>",
  "risk": "low" | "medium" | "high",
  "confidence": <float 0.0–1.0>
}

If you cannot produce a safe, minimal diff, set "patch" to "" and explain in "summary".
=== END CONSTRAINTS ===
`.trim();

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

/**
 * Constructs the full prompt string sent to a patch provider.
 * Includes the constraint block, recommendation context, evidence,
 * and the source files — but never API keys or env content.
 */
export function buildPatchPrompt(request: PatchGenerationRequest): string {
  const { recommendation, patchPlan, relevantSource, relevantEvidence } = request;

  // Format allowed files (relative paths only — no absolute paths in prompts)
  const allowedFilesSection = patchPlan.allowedFiles
    .map((f) => {
      // Find the relative path from our source context if available
      const ctx = relevantSource.find((s) => s.absolutePath === f);
      return ctx ? `  - ${ctx.relativePath}` : `  - (file unavailable in context)`;
    })
    .join("\n");

  // Format prohibited areas
  const prohibitedSection = patchPlan.prohibitedAreas
    .slice(0, 10) // Cap to keep prompt manageable
    .map((p) => `  - ${p.description}`)
    .join("\n");

  // Format source files (only content — no absolute paths)
  const sourceSection = relevantSource
    .map((f) => formatSourceFile(f))
    .join("\n\n");

  // Format evidence (serialised, capped to prevent prompt bloat)
  const evidenceJson = JSON.stringify(
    sanitiseEvidence(relevantEvidence),
    null,
    2
  ).slice(0, 2000);

  // Format verification requirements
  const verifySection = patchPlan.verificationRequirements
    .map((r) => `  - ${r}`)
    .join("\n");

  return [
    MUTATION_CONSTRAINT_BLOCK,
    "",
    "=== RECOMMENDATION ===",
    `ID: ${recommendation.id}`,
    `Problem: ${recommendation.problem}`,
    `Proposed Improvement: ${recommendation.proposedImprovement}`,
    `Target Selector: ${recommendation.affectedSelector ?? "(none)"}`,
    `Affected Components: ${(recommendation.affectedComponents ?? []).join(", ") || "(none)"}`,
    `Affected Viewports: ${recommendation.affectedViewports.join(", ")}`,
    `Estimated Scope: ${recommendation.estimatedMutationScope}`,
    `Risk: ${recommendation.risk}`,
    `Confidence: ${recommendation.confidence}`,
    `Rationale: ${recommendation.rationale}`,
    "",
    "=== AUTHORISED FILES (modify ONLY these) ===",
    allowedFilesSection,
    "",
    "=== PROHIBITED AREAS (NEVER touch) ===",
    prohibitedSection,
    "",
    "=== VERIFICATION REQUIREMENTS (your patch must pass these) ===",
    verifySection,
    "",
    "=== DOM/CSS EVIDENCE FROM BROWSER ANALYSIS ===",
    evidenceJson,
    "",
    "=== SOURCE FILES ===",
    sourceSection || "(no source files available in context)",
    "",
    "=== TASK ===",
    `Generate the minimal targeted unified diff that resolves the recommendation above.`,
    `Modify only: ${patchPlan.allowedSelectors.join(", ") || (recommendation.affectedSelector ?? "the targeted element")}`,
    `Do not touch anything else. Return only the JSON object described in the OUTPUT FORMAT above.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSourceFile(file: SourceFileContext): string {
  return [
    `--- FILE: ${file.relativePath}${file.isPrimaryTarget ? " [PRIMARY TARGET]" : ""} ---`,
    file.content,
    `--- END FILE: ${file.relativePath} ---`,
  ].join("\n");
}

/**
 * Strip any values that look like secrets from the evidence object.
 * The evidence is structured data from Phase 2 analysis (DOM metrics,
 * finding metadata) — not raw source or env content — but we sanitise
 * defensively anyway.
 */
function sanitiseEvidence(
  evidence: Record<string, unknown>
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  const BLOCKED_KEYS = new Set([
    "apikey",
    "api_key",
    "secret",
    "password",
    "token",
    "credential",
    "authorization",
    "privatekey",
    "private_key",
  ]);

  for (const [k, v] of Object.entries(evidence)) {
    if (BLOCKED_KEYS.has(k.toLowerCase())) continue;
    if (typeof v === "string" && v.length > 500) {
      // Truncate very long strings to prevent accidental source dumps
      safe[k] = v.slice(0, 500) + "…";
    } else {
      safe[k] = v;
    }
  }

  return safe;
}
