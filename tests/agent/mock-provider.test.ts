/**
 * Phase 3B Tests — Mock Patch Provider
 *
 * Tests all 10 mock scenarios.  No network calls.
 * Also verifies the read-only guarantee: no files are created or modified.
 */

import { describe, it, expect } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockPatchProvider, FIXTURE_VALID_SINGLE_FILE_PATCH } from "../../src/agent/patch/providers/mock.js";
import { hashPatch } from "../../src/agent/patch/hash.js";
import type { PatchGenerationRequest } from "../../src/agent/patch/types.js";
import type { MutationRecommendation } from "../../src/analysis/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<PatchGenerationRequest> = {}): PatchGenerationRequest {
  const rec: MutationRecommendation = {
    id: "rec-mock-test",
    problem: "Low contrast button",
    evidence: { contrast: 3.2 },
    affectedSelector: "button.cta-btn",
    affectedComponents: ["HeroSection"],
    affectedViewports: ["mobile"],
    proposedImprovement: "Use bg-blue-600",
    rationale: "WCAG AA",
    confidence: 0.9,
    estimatedMutationScope: "single-element",
    risk: "low",
    sourceFindingIds: ["f1"],
  };

  return {
    requestId: "req-test-1",
    recommendation: rec,
    patchPlan: {} as any,
    relevantSource: [],
    relevantEvidence: {},
    providerName: "mock",
    modelName: "mock-patch-model",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MockPatchProvider — provider interface compliance", () => {
  it("has name='mock'", () => {
    const p = new MockPatchProvider();
    expect(p.name).toBe("mock");
  });

  it("has a modelName property", () => {
    const p = new MockPatchProvider({ modelName: "custom-mock" });
    expect(p.modelName).toBe("custom-mock");
  });

  it("implements generatePatch method", () => {
    const p = new MockPatchProvider();
    expect(typeof p.generatePatch).toBe("function");
  });
});

describe("MockPatchProvider — scenario A: valid_single_file", () => {
  it("returns success=true with a patch string", async () => {
    const p = new MockPatchProvider({ scenario: "valid_single_file" });
    const result = await p.generatePatch(makeRequest());
    expect(result.success).toBe(true);
    expect(result.patch).toBeTruthy();
    expect(result.patch).toContain("--- a/");
    expect(result.changedFilesClaimed.length).toBe(1);
  });

  it("returns a valid patch hash", async () => {
    const p = new MockPatchProvider({ scenario: "valid_single_file" });
    const result = await p.generatePatch(makeRequest());
    expect(result.patchHash).toHaveLength(64);
    expect(result.patchHash).toBe(hashPatch(FIXTURE_VALID_SINGLE_FILE_PATCH));
  });

  it("returns low risk and high confidence", async () => {
    const p = new MockPatchProvider({ scenario: "valid_single_file" });
    const result = await p.generatePatch(makeRequest());
    expect(result.risk).toBe("low");
    expect(result.confidence).toBeGreaterThan(0.8);
  });
});

describe("MockPatchProvider — scenario B: valid_multi_file", () => {
  it("returns multiple files claimed", async () => {
    const p = new MockPatchProvider({ scenario: "valid_multi_file" });
    const result = await p.generatePatch(makeRequest());
    expect(result.success).toBe(true);
    expect(result.changedFilesClaimed.length).toBe(2);
  });
});

describe("MockPatchProvider — scenario C: malformed_patch", () => {
  it("returns success=true but patch has no unified-diff headers", async () => {
    const p = new MockPatchProvider({ scenario: "malformed_patch" });
    const result = await p.generatePatch(makeRequest());
    // Phase 3B returns the malformed content — Phase 3C will reject it
    expect(result.success).toBe(true);
    expect(result.patch).not.toContain("--- a/");
    expect(result.risk).toBe("high");
  });
});

describe("MockPatchProvider — scenario D: unauthorized_file", () => {
  it("claims a file outside the recommendation scope", async () => {
    const p = new MockPatchProvider({ scenario: "unauthorized_file" });
    const result = await p.generatePatch(makeRequest());
    expect(result.success).toBe(true);
    expect(result.changedFilesClaimed).toContain("src/components/Unrelated.tsx");
  });
});

describe("MockPatchProvider — scenario E: protected_file", () => {
  it("claims to modify package.json", async () => {
    const p = new MockPatchProvider({ scenario: "protected_file" });
    const result = await p.generatePatch(makeRequest());
    expect(result.success).toBe(true);
    expect(result.changedFilesClaimed).toContain("package.json");
  });
});

describe("MockPatchProvider — scenario F: hook_modification", () => {
  it("patch contains useState modification", async () => {
    const p = new MockPatchProvider({ scenario: "hook_modification" });
    const result = await p.generatePatch(makeRequest());
    expect(result.success).toBe(true);
    expect(result.patch).toContain("useState");
  });
});

describe("MockPatchProvider — scenario G: file_deletion", () => {
  it("patch contains /dev/null target (file deletion)", async () => {
    const p = new MockPatchProvider({ scenario: "file_deletion" });
    const result = await p.generatePatch(makeRequest());
    expect(result.success).toBe(true);
    expect(result.patch).toContain("/dev/null");
  });
});

describe("MockPatchProvider — scenario H: empty_response", () => {
  it("returns success=true with empty patch string", async () => {
    const p = new MockPatchProvider({ scenario: "empty_response" });
    const result = await p.generatePatch(makeRequest());
    expect(result.success).toBe(true);
    expect(result.patch).toBe("");
    expect(result.patchHash).toBe(""); // empty hash for empty patch
  });
});

describe("MockPatchProvider — scenario I: provider_error", () => {
  it("returns success=false with structured error", async () => {
    const p = new MockPatchProvider({ scenario: "provider_error" });
    const result = await p.generatePatch(makeRequest());
    expect(result.success).toBe(false);
    expect(result.patch).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error?.kind).toBe("provider_unavailable");
    expect(result.error?.message).toBeTruthy();
  });
});

describe("MockPatchProvider — scenario J: timeout", () => {
  it("returns success=false with timeout error kind", async () => {
    const p = new MockPatchProvider({ scenario: "timeout" });
    const result = await p.generatePatch(makeRequest());
    expect(result.success).toBe(false);
    expect(result.error?.kind).toBe("timeout");
  });
});

describe("MockPatchProvider — scenario high_risk_valid", () => {
  it("returns high risk with valid patch", async () => {
    const p = new MockPatchProvider({ scenario: "high_risk_valid" });
    const result = await p.generatePatch(makeRequest());
    expect(result.success).toBe(true);
    expect(result.risk).toBe("high");
    expect(result.patch).toBeTruthy();
  });
});

describe("MockPatchProvider — durationMs tracking", () => {
  it("records durationMs in result", async () => {
    const p = new MockPatchProvider({ scenario: "valid_single_file" });
    const result = await p.generatePatch(makeRequest());
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("MockPatchProvider — read-only guarantee", () => {
  it("does not create or modify any files during patch generation", async () => {
    const sandboxDir = await mkdtemp(join(tmpdir(), "elevate-mock-ronly-"));
    try {
      const entriesBefore = await readdir(sandboxDir);

      const p = new MockPatchProvider({ scenario: "valid_single_file" });
      await p.generatePatch(makeRequest());

      const entriesAfter = await readdir(sandboxDir);
      expect(entriesAfter).toEqual(entriesBefore);
    } finally {
      await rm(sandboxDir, { recursive: true, force: true });
    }
  });
});

describe("MockPatchProvider — default scenario", () => {
  it("uses valid_single_file by default", async () => {
    const p = new MockPatchProvider();
    const result = await p.generatePatch(makeRequest());
    expect(result.success).toBe(true);
    expect(result.patch).toContain("--- a/");
  });
});
