/**
 * Phase 3B Tests — Provider Selector
 *
 * Tests configuration precedence and provider instantiation.
 * No network calls.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  resolveProviderName,
  resolveModelName,
  selectPatchProvider,
} from "../../src/agent/patch/selector.js";
import { ClaudePatchProvider } from "../../src/agent/patch/providers/claude.js";
import { GeminiPatchProvider } from "../../src/agent/patch/providers/gemini.js";
import { MockPatchProvider } from "../../src/agent/patch/providers/mock.js";

// ---------------------------------------------------------------------------
// resolveProviderName
// ---------------------------------------------------------------------------

describe("resolveProviderName — precedence", () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env.ELEVATE_PATCH_PROVIDER;
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it("CLI override takes highest precedence", () => {
    process.env.ELEVATE_PATCH_PROVIDER = "gemini";
    expect(resolveProviderName("mock")).toBe("mock");
  });

  it("ELEVATE_PATCH_PROVIDER env is used when no CLI override", () => {
    process.env.ELEVATE_PATCH_PROVIDER = "gemini";
    expect(resolveProviderName(undefined)).toBe("gemini");
  });

  it("defaults to 'claude' when no override and no env var", () => {
    delete process.env.ELEVATE_PATCH_PROVIDER;
    expect(resolveProviderName(undefined)).toBe("claude");
  });

  it("normalises provider name to lowercase", () => {
    expect(resolveProviderName("GEMINI")).toBe("gemini");
    expect(resolveProviderName("Claude")).toBe("claude");
    expect(resolveProviderName("MOCK")).toBe("mock");
  });

  it("falls back to 'claude' for unknown provider names", () => {
    expect(resolveProviderName("openai")).toBe("claude");
    expect(resolveProviderName("gpt4")).toBe("claude");
  });
});

// ---------------------------------------------------------------------------
// resolveModelName
// ---------------------------------------------------------------------------

describe("resolveModelName — precedence", () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env.ELEVATE_PATCH_MODEL;
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it("CLI override takes highest precedence", () => {
    process.env.ELEVATE_PATCH_MODEL = "gemini-1.5-flash";
    expect(resolveModelName("claude-3-opus")).toBe("claude-3-opus");
  });

  it("ELEVATE_PATCH_MODEL env is used when no CLI override", () => {
    process.env.ELEVATE_PATCH_MODEL = "claude-sonnet-4-6";
    expect(resolveModelName(undefined)).toBe("claude-sonnet-4-6");
  });

  it("returns undefined when neither override nor env var is set", () => {
    delete process.env.ELEVATE_PATCH_MODEL;
    expect(resolveModelName(undefined)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// selectPatchProvider
// ---------------------------------------------------------------------------

describe("selectPatchProvider — instantiation", () => {
  it("instantiates ClaudePatchProvider for provider=claude", () => {
    const p = selectPatchProvider({ providerOverride: "claude" });
    expect(p).toBeInstanceOf(ClaudePatchProvider);
    expect(p.name).toBe("claude");
  });

  it("instantiates GeminiPatchProvider for provider=gemini", () => {
    const p = selectPatchProvider({ providerOverride: "gemini" });
    expect(p).toBeInstanceOf(GeminiPatchProvider);
    expect(p.name).toBe("gemini");
  });

  it("instantiates MockPatchProvider for provider=mock", () => {
    const p = selectPatchProvider({ providerOverride: "mock" });
    expect(p).toBeInstanceOf(MockPatchProvider);
    expect(p.name).toBe("mock");
  });

  it("passes modelName through to the provider", () => {
    const p = selectPatchProvider({
      providerOverride: "claude",
      modelOverride: "claude-3-opus-20240229",
    });
    expect(p.modelName).toBe("claude-3-opus-20240229");
  });

  it("mock provider respects mockScenario option", async () => {
    const p = selectPatchProvider({
      providerOverride: "mock",
      mockScenario: "provider_error",
    });

    const result = await p.generatePatch({
      requestId: "test",
      recommendation: {
        id: "rec-1",
        problem: "x",
        evidence: {},
        affectedViewports: ["mobile"],
        proposedImprovement: "y",
        rationale: "z",
        confidence: 0.9,
        estimatedMutationScope: "single-element",
        risk: "low",
        sourceFindingIds: [],
      },
      patchPlan: {} as any,
      relevantSource: [],
      relevantEvidence: {},
      providerName: "mock",
      modelName: "mock-patch-model",
    });

    expect(result.success).toBe(false);
    expect(result.error?.kind).toBe("provider_unavailable");
  });
});
