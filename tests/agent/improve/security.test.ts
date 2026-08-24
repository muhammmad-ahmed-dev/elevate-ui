/**
 * Phase 3F: Security & Invariant Verification Tests
 *
 * Tests Scenario 23:
 *  - Confirm zero calls to GitManager.rollback() in improve module.
 *  - Confirm zero calls to git clean in improve module.
 *  - Confirm no API keys or credentials leaked in approval displays or logs.
 */

import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { formatApprovalDisplay } from "../../../src/agent/improve/approval.js";
import type { ApprovalPromptDetails } from "../../../src/agent/improve/types.js";

describe("Phase 3F Safety & Security Invariants (Scenario 23)", () => {
  it("does not call GitManager.rollback() anywhere in src/agent/improve/", async () => {
    const improveDir = join(__dirname, "../../../src/agent/improve");
    const files = await readdir(improveDir);

    for (const file of files) {
      if (file.endsWith(".ts")) {
        const content = await readFile(join(improveDir, file), "utf8");
        expect(content).not.toContain("GitManager.rollback");
      }
    }
  });

  it("does not call git clean anywhere in src/agent/improve/", async () => {
    const improveDir = join(__dirname, "../../../src/agent/improve");
    const files = await readdir(improveDir);

    for (const file of files) {
      if (file.endsWith(".ts")) {
        const content = await readFile(join(improveDir, file), "utf8");
        expect(content).not.toContain("git clean");
        expect(content).not.toContain("clean -fd");
      }
    }
  });

  it("never leaks API keys or secrets in formatApprovalDisplay", () => {
    const fakeApiKey = "AIzaSySecretApiKey123456789";
    const details: ApprovalPromptDetails = {
      recommendation: {
        id: "rec-1",
        problem: "Low contrast",
        evidence: { selector: ".btn", envKey: fakeApiKey },
        affectedSelector: ".btn",
        affectedViewports: ["desktop"],
        proposedImprovement: "Update color",
        rationale: "Rationale",
        confidence: 0.9,
        estimatedMutationScope: "single-element",
        risk: "low",
        sourceFindingIds: ["f1"],
      },
      locatorResult: {
        recommendationId: "rec-1",
        confidence: "high",
        isAmbiguous: false,
        summary: "Mapped",
        candidates: [],
        primaryCandidate: {
          absolutePath: "/app/src/Btn.tsx",
          relativePath: "src/Btn.tsx",
          componentNames: ["Btn"],
          confidence: 0.9,
          evidence: [],
          isReactComponent: true,
          matchedSelectors: [".btn"],
          matchedTailwindClasses: ["btn"],
        },
      },
      patchPlan: {
        id: "plan-1",
        createdAt: new Date().toISOString(),
        recommendation: {} as any,
        allowedFiles: ["src/Btn.tsx"],
        allowedComponents: ["Btn"],
        allowedSelectors: [".btn"],
        expectedVisualImprovement: "Improve",
        prohibitedAreas: [],
        maxFilesAllowed: 2,
        maxLinesChanged: 150,
        verificationRequirements: [],
        protectedPaths: [],
      },
      patchResult: {
        success: true,
        patch: "--- a/src/Btn.tsx\n+++ b/src/Btn.tsx\n@@ -1,1 +1,1 @@\n-old\n+new\n",
        provider: "mock",
        model: "mock-model",
        changedFilesClaimed: ["src/Btn.tsx"],
        reasoningSummary: "Summary",
        expectedImpact: "Impact",
        risk: "low",
        confidence: 0.9,
        durationMs: 10,
        rawMetadata: { apiKey: fakeApiKey },
      },
      validatedPatch: {
        valid: true,
        rawPatch: "--- a/src/Btn.tsx\n+++ b/src/Btn.tsx\n@@ -1,1 +1,1 @@\n-old\n+new\n",
        originalPatchHash: "hash123",
        parsedDiff: { files: [], totalAdditions: 1, totalDeletions: 1, totalChanged: 2 },
        normalizedFiles: ["src/Btn.tsx"],
        providerClaimedFiles: ["src/Btn.tsx"],
        pathGuardResult: { valid: true, violations: [], normalizedPaths: ["src/Btn.tsx"] },
        scopeResult: { valid: true, violations: [], filesChecked: ["src/Btn.tsx"], totalAdditions: 1, totalDeletions: 1, totalChanged: 2 },
        astResult: { valid: true, violations: [], warnings: [], changedFiles: ["src/Btn.tsx"], changedComponents: [], changedHooks: [], changedImports: [], changedExports: [], changedNetworkOperations: [], additions: 1, deletions: 1, risk: "low" },
        violations: [],
        warnings: [],
        risk: "low",
        validatedAt: new Date().toISOString(),
      },
    };

    const output = formatApprovalDisplay(details);
    expect(output).not.toContain(fakeApiKey);
  });
});
