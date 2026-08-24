/**
 * Phase 3B Tests — Full Pipeline Integration (Mock Provider)
 *
 * Tests the complete Phase 3B pipeline:
 *   PatchPlan → SourceContextBuilder → buildPatchPrompt → MockPatchProvider → PatchGenerationResult
 *
 * Uses real temporary directories.
 * No network calls.
 * Verifies the read-only guarantee end-to-end.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockPatchProvider } from "../../src/agent/patch/providers/mock.js";
import { SourceContextBuilder } from "../../src/agent/patch/context.js";
import { buildPatchPrompt } from "../../src/agent/patch/prompt.js";
import type { PatchGenerationRequest } from "../../src/agent/patch/types.js";
import type { PatchPlan } from "../../src/agent/types.js";
import type { MutationRecommendation } from "../../src/analysis/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRec(): MutationRecommendation {
  return {
    id: "rec-integration",
    problem: "CTA button insufficient contrast",
    evidence: { contrast: 3.2, required: 4.5 },
    affectedSelector: "button.cta-btn",
    affectedComponents: ["HeroSection"],
    affectedViewports: ["mobile", "desktop"],
    proposedImprovement: "Use bg-blue-600 text-white for WCAG AA",
    rationale: "Contrast 3.2 fails WCAG AA 4.5:1",
    confidence: 0.9,
    estimatedMutationScope: "single-element",
    risk: "low",
    sourceFindingIds: ["f1"],
  };
}

function makePlan(projectRoot: string, heroFile: string): PatchPlan {
  return {
    id: "plan-int-test",
    createdAt: new Date().toISOString(),
    recommendation: makeRec(),
    allowedFiles: [heroFile],
    allowedComponents: ["HeroSection"],
    allowedSelectors: ["button.cta-btn"],
    expectedVisualImprovement: "bg-blue-600 text-white",
    prohibitedAreas: [
      { description: "Server-side API routes" },
      { description: "Authentication modules" },
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let tmpDir: string;
let heroFile: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "elevate-pipe-"));
  await mkdir(join(tmpDir, "src", "components"), { recursive: true });

  heroFile = join(tmpDir, "src", "components", "HeroSection.tsx");
  await writeFile(
    heroFile,
    `export function HeroSection() {
  return (
    <section className="hero-section py-12">
      <h1 className="text-4xl font-bold">Welcome</h1>
      <button className="cta-btn bg-gray-400 text-black px-6 py-2">
        Get Started
      </button>
    </section>
  );
}`
  );
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Phase 3B Pipeline — context builder → prompt → mock provider", () => {
  it("full pipeline produces a successful patch result", async () => {
    const rec = makeRec();
    const plan = makePlan(tmpDir, heroFile);

    // 1. Build source context
    const builder = new SourceContextBuilder({ projectRoot: tmpDir });
    const { files, errors } = await builder.buildContext(plan);
    expect(errors).toHaveLength(0);
    expect(files.length).toBe(1);
    expect(files[0].content).toContain("cta-btn");

    // 2. Build prompt
    const request: PatchGenerationRequest = {
      requestId: "req-pipe-1",
      recommendation: rec,
      patchPlan: plan,
      relevantSource: files,
      relevantEvidence: rec.evidence,
      providerName: "mock",
      modelName: "mock-patch-model",
    };

    const promptText = buildPatchPrompt(request);
    expect(promptText).toContain("ELEVATE MUTATION CONSTRAINTS");
    expect(promptText).toContain("src/components/HeroSection.tsx");
    expect(promptText).not.toContain(heroFile); // absolute path must NOT appear

    // 3. Generate patch via mock provider
    const provider = new MockPatchProvider({ scenario: "valid_single_file" });
    const result = await provider.generatePatch(request);

    expect(result.success).toBe(true);
    expect(result.patch).toBeTruthy();
    expect(result.patchHash).toHaveLength(64);
    expect(result.provider).toBe("mock");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("pipeline works with empty_response scenario (provider signals no-op)", async () => {
    const rec = makeRec();
    const plan = makePlan(tmpDir, heroFile);
    const builder = new SourceContextBuilder({ projectRoot: tmpDir });
    const { files } = await builder.buildContext(plan);

    const request: PatchGenerationRequest = {
      requestId: "req-pipe-noop",
      recommendation: rec,
      patchPlan: plan,
      relevantSource: files,
      relevantEvidence: {},
      providerName: "mock",
      modelName: "mock-patch-model",
    };

    const provider = new MockPatchProvider({ scenario: "empty_response" });
    const result = await provider.generatePatch(request);

    expect(result.success).toBe(true);
    expect(result.patch).toBe("");
    expect(result.patchHash).toBe("");
    expect(result.changedFilesClaimed).toHaveLength(0);
  });

  it("pipeline returns structured error for provider_error scenario", async () => {
    const rec = makeRec();
    const plan = makePlan(tmpDir, heroFile);

    const request: PatchGenerationRequest = {
      requestId: "req-pipe-err",
      recommendation: rec,
      patchPlan: plan,
      relevantSource: [],
      relevantEvidence: {},
      providerName: "mock",
      modelName: "mock-patch-model",
    };

    const provider = new MockPatchProvider({ scenario: "provider_error" });
    const result = await provider.generatePatch(request);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.patch).toBeUndefined();
  });

  it("pipeline hash is consistent across calls with same scenario", async () => {
    const request: PatchGenerationRequest = {
      requestId: "req-hash-test",
      recommendation: makeRec(),
      patchPlan: makePlan(tmpDir, heroFile),
      relevantSource: [],
      relevantEvidence: {},
      providerName: "mock",
      modelName: "mock-patch-model",
    };

    const provider = new MockPatchProvider({ scenario: "valid_single_file" });
    const r1 = await provider.generatePatch(request);
    const r2 = await provider.generatePatch(request);

    expect(r1.patchHash).toBe(r2.patchHash);
  });
});

describe("Phase 3B Pipeline — read-only guarantee", () => {
  it("no files are created or modified in tmpDir after full pipeline run", async () => {
    const rec = makeRec();
    const plan = makePlan(tmpDir, heroFile);

    const builder = new SourceContextBuilder({ projectRoot: tmpDir });
    const { files } = await builder.buildContext(plan);

    const request: PatchGenerationRequest = {
      requestId: "req-ronly",
      recommendation: rec,
      patchPlan: plan,
      relevantSource: files,
      relevantEvidence: rec.evidence,
      providerName: "mock",
      modelName: "mock-patch-model",
    };

    // Record mtime before
    const statBefore = await stat(heroFile);

    const provider = new MockPatchProvider({ scenario: "valid_single_file" });
    await provider.generatePatch(request);

    // Record mtime after — must be identical
    const statAfter = await stat(heroFile);
    expect(statAfter.mtimeMs).toBe(statBefore.mtimeMs);
  });

  it("Phase 3A PatchPlan.allowedFiles is respected by the context builder", async () => {
    // Create an extra file that is NOT in allowedFiles
    const extraFile = join(tmpDir, "src", "components", "Unrelated.tsx");
    await writeFile(extraFile, `export function Unrelated() { return <div/>; }`);

    const plan = makePlan(tmpDir, heroFile); // Only heroFile is allowed
    const builder = new SourceContextBuilder({ projectRoot: tmpDir });
    const { files } = await builder.buildContext(plan);

    // Unrelated.tsx must not appear in context
    const paths = files.map((f) => f.absolutePath);
    expect(paths).not.toContain(extraFile);
    expect(paths).toContain(heroFile);
  });
});
