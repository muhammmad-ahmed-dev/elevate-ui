/**
 * Phase 3B Tests — Prompt Builder
 *
 * Verifies that the prompt contains all required constraint sections,
 * correct recommendation data, and never contains API keys or raw secrets.
 */

import { describe, it, expect } from "vitest";
import { buildPatchPrompt } from "../../src/agent/patch/prompt.js";
import type { PatchGenerationRequest } from "../../src/agent/patch/types.js";
import type { MutationRecommendation } from "../../src/analysis/types.js";
import type { PatchPlan } from "../../src/agent/types.js";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRec(): MutationRecommendation {
  return {
    id: "rec-prompt-test",
    problem: "CTA button has insufficient contrast",
    evidence: { contrast: 3.2, required: 4.5 },
    affectedSelector: "button.cta-btn",
    affectedComponents: ["HeroSection"],
    affectedViewports: ["mobile", "desktop"],
    proposedImprovement: "Change bg-gray-400 to bg-blue-600 for WCAG AA compliance",
    rationale: "Contrast ratio 3.2 fails WCAG AA minimum of 4.5:1",
    confidence: 0.92,
    estimatedMutationScope: "single-element",
    risk: "low",
    sourceFindingIds: ["f1"],
  };
}

function makePlan(projectRoot = "/project"): PatchPlan {
  return {
    id: "plan-abc",
    createdAt: new Date().toISOString(),
    recommendation: makeRec(),
    allowedFiles: [`${projectRoot}/src/components/HeroSection.tsx`],
    allowedComponents: ["HeroSection"],
    allowedSelectors: ["button.cta-btn"],
    expectedVisualImprovement: "bg-blue-600 for WCAG AA",
    prohibitedAreas: [
      { description: "Server-side API routes" },
      { description: "Authentication modules" },
      { description: "React hooks logic" },
    ],
    maxFilesAllowed: 2,
    maxLinesChanged: 150,
    verificationRequirements: [
      "TypeScript type-check must pass",
      "Framework build must succeed",
    ],
    protectedPaths: [],
  };
}

function makeRequest(
  projectRoot = "/project",
  extraEvidence: Record<string, unknown> = {}
): PatchGenerationRequest {
  return {
    requestId: randomUUID(),
    recommendation: makeRec(),
    patchPlan: makePlan(projectRoot),
    relevantSource: [
      {
        absolutePath: `${projectRoot}/src/components/HeroSection.tsx`,
        relativePath: "src/components/HeroSection.tsx",
        content: `export function HeroSection() {
  return <button className="cta-btn bg-gray-400">CTA</button>;
}`,
        isPrimaryTarget: true,
      },
    ],
    relevantEvidence: { contrast: 3.2, ...extraEvidence },
    providerName: "mock",
    modelName: "mock-patch-model",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildPatchPrompt — constraint block", () => {
  it("contains the mandatory constraint section header", () => {
    const prompt = buildPatchPrompt(makeRequest());
    expect(prompt).toContain("ELEVATE MUTATION CONSTRAINTS");
  });

  it("explicitly forbids modifying files outside authorised list", () => {
    const prompt = buildPatchPrompt(makeRequest());
    expect(prompt).toMatch(/only modify files listed/i);
  });

  it("explicitly forbids hook modification", () => {
    const prompt = buildPatchPrompt(makeRequest());
    expect(prompt).toMatch(/useState|useEffect|useCallback/i);
  });

  it("explicitly forbids state management changes", () => {
    const prompt = buildPatchPrompt(makeRequest());
    expect(prompt).toMatch(/redux|zustand|jotai/i);
  });

  it("explicitly forbids API calls", () => {
    const prompt = buildPatchPrompt(makeRequest());
    expect(prompt).toMatch(/API call|fetch\(\)|network request/i);
  });

  it("explicitly forbids package changes", () => {
    const prompt = buildPatchPrompt(makeRequest());
    expect(prompt).toMatch(/package\.json|dependency/i);
  });

  it("requires minimal unified diff output", () => {
    const prompt = buildPatchPrompt(makeRequest());
    expect(prompt).toMatch(/minimal.*unified diff|unified diff/i);
  });

  it("specifies JSON-only output format", () => {
    const prompt = buildPatchPrompt(makeRequest());
    expect(prompt).toContain('"patch"');
    expect(prompt).toContain('"files"');
    expect(prompt).toContain('"risk"');
    expect(prompt).toContain('"confidence"');
  });
});

describe("buildPatchPrompt — recommendation data", () => {
  it("contains the recommendation ID", () => {
    const prompt = buildPatchPrompt(makeRequest());
    expect(prompt).toContain("rec-prompt-test");
  });

  it("contains the problem description", () => {
    const prompt = buildPatchPrompt(makeRequest());
    expect(prompt).toContain("CTA button has insufficient contrast");
  });

  it("contains the proposed improvement", () => {
    const prompt = buildPatchPrompt(makeRequest());
    expect(prompt).toContain("bg-blue-600");
  });

  it("contains the target selector", () => {
    const prompt = buildPatchPrompt(makeRequest());
    expect(prompt).toContain("button.cta-btn");
  });

  it("contains the affected viewport list", () => {
    const prompt = buildPatchPrompt(makeRequest());
    expect(prompt).toContain("mobile");
    expect(prompt).toContain("desktop");
  });
});

describe("buildPatchPrompt — source context", () => {
  it("includes relative path of the source file (not absolute)", () => {
    const prompt = buildPatchPrompt(makeRequest());
    expect(prompt).toContain("src/components/HeroSection.tsx");
    // Absolute path should NOT appear
    expect(prompt).not.toContain("/project/src/components/HeroSection.tsx");
  });

  it("marks the primary target file", () => {
    const prompt = buildPatchPrompt(makeRequest());
    expect(prompt).toContain("[PRIMARY TARGET]");
  });

  it("includes the source file content", () => {
    const prompt = buildPatchPrompt(makeRequest());
    expect(prompt).toContain("bg-gray-400");
  });
});

describe("buildPatchPrompt — evidence sanitisation", () => {
  it("includes safe evidence fields", () => {
    const prompt = buildPatchPrompt(makeRequest());
    expect(prompt).toContain("contrast");
  });

  it("strips evidence fields named 'apiKey'", () => {
    const prompt = buildPatchPrompt(
      makeRequest("/project", { apiKey: "sk-secret-abc", contrast: 3.2 })
    );
    expect(prompt).not.toContain("sk-secret-abc");
  });

  it("strips evidence fields named 'secret'", () => {
    const prompt = buildPatchPrompt(
      makeRequest("/project", { secret: "my-secret-value" })
    );
    expect(prompt).not.toContain("my-secret-value");
  });

  it("strips evidence fields named 'password'", () => {
    const prompt = buildPatchPrompt(
      makeRequest("/project", { password: "hunter2" })
    );
    expect(prompt).not.toContain("hunter2");
  });

  it("truncates very long evidence strings", () => {
    const longValue = "x".repeat(2000);
    const prompt = buildPatchPrompt(
      makeRequest("/project", { longField: longValue })
    );
    // The raw long value should not appear verbatim
    expect(prompt).not.toContain(longValue);
    // But the truncated version should end with the ellipsis marker
    expect(prompt).toContain("…");
  });
});

describe("buildPatchPrompt — prohibited areas", () => {
  it("lists the prohibited areas from the plan", () => {
    const prompt = buildPatchPrompt(makeRequest());
    expect(prompt).toContain("Server-side API routes");
    expect(prompt).toContain("Authentication modules");
    expect(prompt).toContain("React hooks logic");
  });
});

describe("buildPatchPrompt — verification requirements", () => {
  it("includes the verification requirements", () => {
    const prompt = buildPatchPrompt(makeRequest());
    expect(prompt).toContain("TypeScript type-check must pass");
    expect(prompt).toContain("Framework build must succeed");
  });
});
