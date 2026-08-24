/**
 * Phase 3B Tests — Patch Response Validation
 *
 * Tests validatePatchResponse for all valid and invalid scenarios.
 * No network calls.
 */

import { describe, it, expect } from "vitest";
import { validatePatchResponse } from "../../src/agent/patch/validation.js";

const VALID_RESPONSE = JSON.stringify({
  patch: "--- a/Hero.tsx\n+++ b/Hero.tsx\n@@ -1 +1 @@\n-old\n+new",
  files: ["src/components/Hero.tsx"],
  summary: "Improved button contrast",
  expectedImpact: "Button will pass WCAG AA",
  risk: "low",
  confidence: 0.9,
});

describe("validatePatchResponse — valid response", () => {
  it("accepts a valid well-formed JSON response", () => {
    const result = validatePatchResponse(VALID_RESPONSE);
    expect(result.valid).toBe(true);
    expect(result.response).toBeDefined();
    expect(result.response!.patch).toContain("--- a/Hero.tsx");
    expect(result.response!.files).toEqual(["src/components/Hero.tsx"]);
    expect(result.response!.risk).toBe("low");
    expect(result.response!.confidence).toBe(0.9);
  });

  it("accepts a response wrapped in a markdown ```json fence", () => {
    const fenced = "```json\n" + VALID_RESPONSE + "\n```";
    const result = validatePatchResponse(fenced);
    expect(result.valid).toBe(true);
  });

  it("accepts a response wrapped in a plain ``` fence", () => {
    const fenced = "```\n" + VALID_RESPONSE + "\n```";
    const result = validatePatchResponse(fenced);
    expect(result.valid).toBe(true);
  });

  it("accepts an empty patch with a non-empty summary (provider signals no-op)", () => {
    const noOp = JSON.stringify({
      patch: "",
      files: [],
      summary: "No change required — design is already acceptable",
      expectedImpact: "No visual change",
      risk: "low",
      confidence: 1.0,
    });
    const result = validatePatchResponse(noOp);
    expect(result.valid).toBe(true);
    expect(result.response!.patch).toBe("");
  });

  it("accepts all three risk values", () => {
    for (const risk of ["low", "medium", "high"]) {
      const r = validatePatchResponse(
        JSON.stringify({ ...JSON.parse(VALID_RESPONSE), risk })
      );
      expect(r.valid).toBe(true);
    }
  });

  it("accepts confidence boundaries 0.0 and 1.0", () => {
    for (const confidence of [0.0, 1.0]) {
      const r = validatePatchResponse(
        JSON.stringify({ ...JSON.parse(VALID_RESPONSE), confidence })
      );
      expect(r.valid).toBe(true);
    }
  });
});

describe("validatePatchResponse — rejection cases", () => {
  it("rejects empty string", () => {
    const result = validatePatchResponse("");
    expect(result.valid).toBe(false);
    expect(result.error?.kind).toBe("empty_patch");
  });

  it("rejects whitespace-only string", () => {
    const result = validatePatchResponse("   \n  ");
    expect(result.valid).toBe(false);
    expect(result.error?.kind).toBe("empty_patch");
  });

  it("rejects non-JSON prose text", () => {
    const result = validatePatchResponse("Sure, here is the diff:\n--- a/foo.tsx");
    expect(result.valid).toBe(false);
    expect(result.error?.kind).toBe("malformed_response");
  });

  it("rejects JSON array at root", () => {
    const result = validatePatchResponse("[]");
    expect(result.valid).toBe(false);
    expect(result.error?.kind).toBe("invalid_schema");
  });

  it("rejects missing patch field", () => {
    const obj = JSON.parse(VALID_RESPONSE);
    delete obj.patch;
    const result = validatePatchResponse(JSON.stringify(obj));
    expect(result.valid).toBe(false);
    expect(result.error?.message).toMatch(/patch/i);
  });

  it("rejects non-string patch field", () => {
    const obj = JSON.parse(VALID_RESPONSE);
    obj.patch = 123;
    const result = validatePatchResponse(JSON.stringify(obj));
    expect(result.valid).toBe(false);
  });

  it("rejects missing files field", () => {
    const obj = JSON.parse(VALID_RESPONSE);
    delete obj.files;
    const result = validatePatchResponse(JSON.stringify(obj));
    expect(result.valid).toBe(false);
    expect(result.error?.message).toMatch(/files/i);
  });

  it("rejects non-array files field", () => {
    const obj = JSON.parse(VALID_RESPONSE);
    obj.files = "src/Hero.tsx";
    const result = validatePatchResponse(JSON.stringify(obj));
    expect(result.valid).toBe(false);
  });

  it("rejects files array containing non-string entries", () => {
    const obj = JSON.parse(VALID_RESPONSE);
    obj.files = [42];
    const result = validatePatchResponse(JSON.stringify(obj));
    expect(result.valid).toBe(false);
  });

  it("rejects invalid risk value", () => {
    const obj = JSON.parse(VALID_RESPONSE);
    obj.risk = "critical";
    const result = validatePatchResponse(JSON.stringify(obj));
    expect(result.valid).toBe(false);
    expect(result.error?.message).toMatch(/risk/i);
  });

  it("rejects missing risk field", () => {
    const obj = JSON.parse(VALID_RESPONSE);
    delete obj.risk;
    const result = validatePatchResponse(JSON.stringify(obj));
    expect(result.valid).toBe(false);
  });

  it("rejects confidence below 0", () => {
    const obj = JSON.parse(VALID_RESPONSE);
    obj.confidence = -0.1;
    const result = validatePatchResponse(JSON.stringify(obj));
    expect(result.valid).toBe(false);
    expect(result.error?.message).toMatch(/confidence/i);
  });

  it("rejects confidence above 1", () => {
    const obj = JSON.parse(VALID_RESPONSE);
    obj.confidence = 1.5;
    const result = validatePatchResponse(JSON.stringify(obj));
    expect(result.valid).toBe(false);
  });

  it("rejects non-number confidence", () => {
    const obj = JSON.parse(VALID_RESPONSE);
    obj.confidence = "high";
    const result = validatePatchResponse(JSON.stringify(obj));
    expect(result.valid).toBe(false);
  });

  it("rejects missing summary field", () => {
    const obj = JSON.parse(VALID_RESPONSE);
    delete obj.summary;
    const result = validatePatchResponse(JSON.stringify(obj));
    expect(result.valid).toBe(false);
  });

  it("rejects missing expectedImpact field", () => {
    const obj = JSON.parse(VALID_RESPONSE);
    delete obj.expectedImpact;
    const result = validatePatchResponse(JSON.stringify(obj));
    expect(result.valid).toBe(false);
  });

  it("rejects empty patch AND empty summary (provider gave up silently)", () => {
    const obj = JSON.parse(VALID_RESPONSE);
    obj.patch = "";
    obj.summary = "";
    const result = validatePatchResponse(JSON.stringify(obj));
    expect(result.valid).toBe(false);
    expect(result.error?.kind).toBe("empty_patch");
  });
});
