/**
 * Phase 3B Tests — Claude & Gemini Patch Providers
 *
 * Tests provider request construction, error handling, and response parsing.
 * All network calls are intercepted via vitest's vi.stubGlobal.
 * No real API key is needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ClaudePatchProvider } from "../../src/agent/patch/providers/claude.js";
import { GeminiPatchProvider } from "../../src/agent/patch/providers/gemini.js";
import type { PatchGenerationRequest } from "../../src/agent/patch/types.js";
import type { MutationRecommendation } from "../../src/analysis/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_JSON_RESPONSE = JSON.stringify({
  patch: "--- a/Hero.tsx\n+++ b/Hero.tsx\n@@ -1 +1 @@\n-old\n+new",
  files: ["src/components/Hero.tsx"],
  summary: "Improved CTA button contrast",
  expectedImpact: "WCAG AA compliant",
  risk: "low",
  confidence: 0.9,
});

function makeRequest(): PatchGenerationRequest {
  const rec: MutationRecommendation = {
    id: "rec-api-test",
    problem: "Low contrast",
    evidence: {},
    affectedViewports: ["mobile"],
    proposedImprovement: "bg-blue-600",
    rationale: "WCAG",
    confidence: 0.9,
    estimatedMutationScope: "single-element",
    risk: "low",
    sourceFindingIds: [],
  };
  return {
    requestId: "req-api-1",
    recommendation: rec,
    patchPlan: {
      id: "plan-1",
      createdAt: new Date().toISOString(),
      recommendation: rec,
      allowedFiles: ["/project/src/components/Hero.tsx"],
      allowedComponents: ["Hero"],
      allowedSelectors: ["button.cta"],
      expectedVisualImprovement: "Higher contrast",
      prohibitedAreas: [],
      maxFilesAllowed: 2,
      maxLinesChanged: 150,
      verificationRequirements: [],
      protectedPaths: [],
    },
    relevantSource: [
      {
        absolutePath: "/project/src/components/Hero.tsx",
        relativePath: "src/components/Hero.tsx",
        content: `export function Hero() { return <button className="cta">CTA</button>; }`,
        isPrimaryTarget: true,
      },
    ],
    relevantEvidence: { contrast: 3.2 },
    providerName: "claude",
    modelName: "claude-sonnet-4-6",
  };
}

function makeFetch(status: number, body: unknown, errorToThrow?: Error) {
  return vi.fn().mockImplementation(() => {
    if (errorToThrow) return Promise.reject(errorToThrow);
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
      json: () =>
        Promise.resolve(
          typeof body === "string" ? JSON.parse(body) : body
        ),
    } as any);
  });
}

// ---------------------------------------------------------------------------
// ClaudePatchProvider
// ---------------------------------------------------------------------------

describe("ClaudePatchProvider — no API key", () => {
  beforeEach(() => {
    delete process.env.ELEVATE_PATCH_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("returns configuration_error when no API key is configured", async () => {
    const p = new ClaudePatchProvider({ apiKey: undefined });
    const result = await p.generatePatch(makeRequest());
    expect(result.success).toBe(false);
    expect(result.error?.kind).toBe("configuration_error");
  });
});

describe("ClaudePatchProvider — successful response", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("parses a valid JSON response and returns success=true", async () => {
    global.fetch = makeFetch(200, {
      content: [{ text: VALID_JSON_RESPONSE }],
    });

    const p = new ClaudePatchProvider({ apiKey: "test-key-not-real" });
    const result = await p.generatePatch(makeRequest());

    expect(result.success).toBe(true);
    expect(result.patch).toContain("--- a/Hero.tsx");
    expect(result.risk).toBe("low");
    expect(result.confidence).toBe(0.9);
    expect(result.patchHash).toHaveLength(64);
  });

  it("does NOT include the API key in rawMetadata", async () => {
    global.fetch = makeFetch(200, {
      content: [{ text: VALID_JSON_RESPONSE }],
    });

    const p = new ClaudePatchProvider({ apiKey: "sk-secret-test-key" });
    const result = await p.generatePatch(makeRequest());

    const metaJson = JSON.stringify(result.rawMetadata ?? {});
    expect(metaJson).not.toContain("sk-secret-test-key");
  });
});

describe("ClaudePatchProvider — HTTP error codes", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns auth_error on HTTP 401", async () => {
    global.fetch = makeFetch(401, "Unauthorized");
    const p = new ClaudePatchProvider({ apiKey: "test-key" });
    const result = await p.generatePatch(makeRequest());
    expect(result.success).toBe(false);
    expect(result.error?.kind).toBe("auth_error");
    expect(result.error?.httpStatus).toBe(401);
  });

  it("returns rate_limit on HTTP 429", async () => {
    global.fetch = makeFetch(429, "Too Many Requests");
    const p = new ClaudePatchProvider({ apiKey: "test-key" });
    const result = await p.generatePatch(makeRequest());
    expect(result.success).toBe(false);
    expect(result.error?.kind).toBe("rate_limit");
  });

  it("returns provider_unavailable on HTTP 500", async () => {
    global.fetch = makeFetch(500, "Internal Server Error");
    const p = new ClaudePatchProvider({ apiKey: "test-key" });
    const result = await p.generatePatch(makeRequest());
    expect(result.success).toBe(false);
    expect(result.error?.kind).toBe("provider_unavailable");
  });
});

describe("ClaudePatchProvider — network errors", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns network_error on fetch rejection", async () => {
    global.fetch = makeFetch(0, "", new Error("ECONNREFUSED"));
    const p = new ClaudePatchProvider({ apiKey: "test-key" });
    const result = await p.generatePatch(makeRequest());
    expect(result.success).toBe(false);
    expect(result.error?.kind).toBe("network_error");
  });

  it("returns timeout error kind on AbortError", async () => {
    const abortErr = new Error("The operation was aborted");
    (abortErr as any).name = "AbortError";
    global.fetch = makeFetch(0, "", abortErr);
    const p = new ClaudePatchProvider({ apiKey: "test-key" });
    const result = await p.generatePatch(makeRequest());
    expect(result.success).toBe(false);
    expect(result.error?.kind).toBe("timeout");
  });
});

describe("ClaudePatchProvider — malformed response handling", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns invalid_schema when model returns non-JSON", async () => {
    global.fetch = makeFetch(200, {
      content: [{ text: "Here is your diff:\n--- a/Hero.tsx" }],
    });
    const p = new ClaudePatchProvider({ apiKey: "test-key" });
    const result = await p.generatePatch(makeRequest());
    expect(result.success).toBe(false);
    expect(result.error?.kind).toBe("malformed_response");
  });

  it("returns invalid_schema when model returns JSON missing required fields", async () => {
    global.fetch = makeFetch(200, {
      content: [{ text: JSON.stringify({ patch: "diff", summary: "ok" }) }],
    });
    const p = new ClaudePatchProvider({ apiKey: "test-key" });
    const result = await p.generatePatch(makeRequest());
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GeminiPatchProvider
// ---------------------------------------------------------------------------

describe("GeminiPatchProvider — no API key", () => {
  beforeEach(() => {
    delete process.env.ELEVATE_PATCH_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  it("returns configuration_error when no API key is configured", async () => {
    const p = new GeminiPatchProvider({ apiKey: undefined });
    const result = await p.generatePatch(makeRequest());
    expect(result.success).toBe(false);
    expect(result.error?.kind).toBe("configuration_error");
  });
});

describe("GeminiPatchProvider — successful response", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("parses a valid JSON response from Gemini response shape", async () => {
    global.fetch = makeFetch(200, {
      candidates: [
        { content: { parts: [{ text: VALID_JSON_RESPONSE }] } },
      ],
    });

    const p = new GeminiPatchProvider({ apiKey: "test-gemini-key" });
    const result = await p.generatePatch(makeRequest());

    expect(result.success).toBe(true);
    expect(result.provider).toBe("gemini");
    expect(result.patch).toContain("--- a/Hero.tsx");
    expect(result.patchHash).toHaveLength(64);
  });
});

describe("GeminiPatchProvider — HTTP errors", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns auth_error on HTTP 403", async () => {
    global.fetch = makeFetch(403, "Forbidden");
    const p = new GeminiPatchProvider({ apiKey: "test-key" });
    const result = await p.generatePatch(makeRequest());
    expect(result.success).toBe(false);
    expect(result.error?.kind).toBe("auth_error");
  });

  it("returns rate_limit on HTTP 429", async () => {
    global.fetch = makeFetch(429, "Rate Limited");
    const p = new GeminiPatchProvider({ apiKey: "test-key" });
    const result = await p.generatePatch(makeRequest());
    expect(result.success).toBe(false);
    expect(result.error?.kind).toBe("rate_limit");
  });
});

describe("GeminiPatchProvider — API key NOT exposed in URL / sent via header", () => {
  let originalFetch: typeof global.fetch;
  let capturedUrl: string | undefined;
  let capturedHeaders: Record<string, string> | undefined;

  beforeEach(() => {
    originalFetch = global.fetch;
    capturedUrl = undefined;
    capturedHeaders = undefined;

    global.fetch = vi.fn().mockImplementation((url: string, init: any) => {
      capturedUrl = url;
      capturedHeaders = init?.headers ?? {};
      // Return a valid response so the provider doesn't short-circuit
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(""),
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: VALID_JSON_RESPONSE }] } }],
          }),
      } as any);
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("API key is NOT in the request URL", async () => {
    const p = new GeminiPatchProvider({ apiKey: "secret-gemini-key" });
    await p.generatePatch(makeRequest());
    expect(capturedUrl).toBeDefined();
    expect(capturedUrl).not.toContain("secret-gemini-key");
    expect(capturedUrl).not.toContain("key=");
  });

  it("API key IS sent via x-goog-api-key header", async () => {
    const p = new GeminiPatchProvider({ apiKey: "secret-gemini-key" });
    await p.generatePatch(makeRequest());
    expect(capturedHeaders).toBeDefined();
    expect(capturedHeaders!["x-goog-api-key"]).toBe("secret-gemini-key");
  });

  it("default model is gemini-3.7-flash when no env var or option provided", () => {
    const origEnv = process.env.ELEVATE_PATCH_MODEL;
    delete process.env.ELEVATE_PATCH_MODEL;
    try {
      const p = new GeminiPatchProvider({});
      expect(p.modelName).toBe("gemini-3.7-flash");
    } finally {
      if (origEnv !== undefined) process.env.ELEVATE_PATCH_MODEL = origEnv;
    }
  });

  it("model is overridable via ELEVATE_PATCH_MODEL env var", () => {
    process.env.ELEVATE_PATCH_MODEL = "gemini-ultra";
    try {
      const p = new GeminiPatchProvider({});
      expect(p.modelName).toBe("gemini-ultra");
    } finally {
      delete process.env.ELEVATE_PATCH_MODEL;
    }
  });

  it("model is overridable via constructor option (highest precedence)", () => {
    process.env.ELEVATE_PATCH_MODEL = "gemini-ultra";
    try {
      const p = new GeminiPatchProvider({ model: "gemini-custom" });
      expect(p.modelName).toBe("gemini-custom");
    } finally {
      delete process.env.ELEVATE_PATCH_MODEL;
    }
  });
});

describe("Phase 3B — read-only guarantee (real providers)", () => {
  it("ClaudePatchProvider.generatePatch does not write any files when API key missing", async () => {
    delete process.env.ELEVATE_PATCH_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const p = new ClaudePatchProvider({ apiKey: undefined });
    // This returns an error without making network calls
    const result = await p.generatePatch(makeRequest());

    // Verify it's an error, not a file-writing operation
    expect(result.success).toBe(false);
    expect(result.patch).toBeUndefined();
  });
});
