/**
 * Phase 3B Tests — Patch Hash
 */

import { describe, it, expect } from "vitest";
import { hashPatch } from "../../src/agent/patch/hash.js";

describe("hashPatch", () => {
  it("returns a 64-char hex string for a non-empty patch", () => {
    const hash = hashPatch("--- a/foo.tsx\n+++ b/foo.tsx\n@@ -1 +1 @@\n-old\n+new");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns an empty string for an empty patch", () => {
    expect(hashPatch("")).toBe("");
    expect(hashPatch("   ")).toBe("");
    expect(hashPatch(undefined)).toBe("");
  });

  it("is deterministic — same input yields same hash", () => {
    const patch = "--- a/Hero.tsx\n+++ b/Hero.tsx\n@@ -1 +1 @@\n-foo\n+bar";
    expect(hashPatch(patch)).toBe(hashPatch(patch));
  });

  it("is sensitive to content changes", () => {
    const h1 = hashPatch("patch version 1");
    const h2 = hashPatch("patch version 2");
    expect(h1).not.toBe(h2);
  });
});
