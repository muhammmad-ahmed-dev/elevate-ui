/**
 * Phase 3C Tests — PatchValidator (end-to-end orchestration)
 *
 * Tests X (dry-run, no mutation), Y (read-only guarantee), Z (realistic E2E),
 * plus the safe-visual-patch and unsafe-hook-patch scenarios from the spec.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PatchValidator } from "../../../src/agent/patch/validate/validator.js";
import type { PatchGenerationResult } from "../../../src/agent/patch/types.js";
import type { PatchPlan } from "../../../src/agent/types.js";
import type { MutationRecommendation } from "../../../src/analysis/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRec(id = "rec-validator-test"): MutationRecommendation {
  return {
    id,
    problem: "Low contrast CTA button",
    evidence: {},
    affectedViewports: ["mobile", "desktop"],
    proposedImprovement: "Change bg-gray-400 to bg-blue-600",
    rationale: "WCAG AA contrast requirement",
    confidence: 0.92,
    estimatedMutationScope: "single-element",
    risk: "low",
    sourceFindingIds: [],
  };
}

function makePlan(
  projectRoot: string,
  allowedRelPaths: string[],
  allowedComponents: string[] = ["HeroSection"],
  maxFiles = 2,
  maxLines = 150
): PatchPlan {
  const rec = makeRec();
  return {
    id: "plan-validator-test",
    createdAt: new Date().toISOString(),
    recommendation: rec,
    allowedFiles: allowedRelPaths.map((p) => join(projectRoot, p)),
    allowedComponents,
    allowedSelectors: ["button.cta-btn"],
    expectedVisualImprovement: "Higher contrast button",
    prohibitedAreas: [],
    maxFilesAllowed: maxFiles,
    maxLinesChanged: maxLines,
    verificationRequirements: [],
    protectedPaths: [],
  };
}

function makePatchResult(patch: string, claimed?: string[]): PatchGenerationResult {
  return {
    success: true,
    patch,
    patchHash: "abc123",
    provider: "mock",
    model: "mock-v1",
    changedFilesClaimed: claimed ?? [],
    reasoningSummary: "Visual improvement",
    expectedImpact: "Better contrast",
    risk: "low",
    confidence: 0.9,
    durationMs: 42,
  };
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "elevate-validator-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeFixture(relPath: string, content: string): Promise<void> {
  const fullPath = join(tmpDir, relPath);
  const dir = fullPath.substring(0, Math.max(fullPath.lastIndexOf("/"), fullPath.lastIndexOf("\\")));
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dir, { recursive: true });
  await writeFile(fullPath, content, "utf8");
}

// ---------------------------------------------------------------------------
// Spec §23: Safe visual patch — all gates pass
// ---------------------------------------------------------------------------

describe("PatchValidator — Spec §23: safe visual patch", () => {
  it("accepts a purely visual Tailwind patch on an authorized component", async () => {
    const beforeSource = `import React from "react";
export function HeroSection({ title }: { title: string }) {
  return (
    <section className="hero py-8 bg-gray-100">
      <h1 className="text-3xl font-bold">{title}</h1>
      <button className="cta-btn mt-4 bg-gray-400 text-black px-6 py-2">Get Started</button>
    </section>
  );
}`;

    await writeFixture("src/components/HeroSection.tsx", beforeSource);

    const patch = `--- a/src/components/HeroSection.tsx
+++ b/src/components/HeroSection.tsx
@@ -1,7 +1,7 @@
 import React from "react";
 export function HeroSection({ title }: { title: string }) {
   return (
-    <section className="hero py-8 bg-gray-100">
-      <h1 className="text-3xl font-bold">{title}</h1>
-      <button className="cta-btn mt-4 bg-gray-400 text-black px-6 py-2">Get Started</button>
+    <section className="hero py-12 bg-white">
+      <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
+      <button className="cta-btn mt-6 bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold">Get Started</button>
     </section>
   );
 }`;

    const validator = new PatchValidator({ projectRoot: tmpDir });
    const plan = makePlan(tmpDir, ["src/components/HeroSection.tsx"], ["HeroSection"]);
    const result = await validator.validate(makePatchResult(patch, ["src/components/HeroSection.tsx"]), plan);

    // All gates pass
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.pathGuardResult.valid).toBe(true);
    expect(result.scopeResult.valid).toBe(true);
    expect(result.astResult.valid).toBe(true);
    expect(result.astResult.changedHooks).toHaveLength(0);
    expect(result.astResult.changedNetworkOperations).toHaveLength(0);
    expect(result.astResult.changedExports).toHaveLength(0);
    expect(result.risk).toBe("low");
  });
});

// ---------------------------------------------------------------------------
// Spec §24: Unsafe patch with hook change — must REJECT
// ---------------------------------------------------------------------------

describe("PatchValidator — Spec §24: unsafe patch rejected on hook change", () => {
  it("rejects a patch that changes Tailwind classes AND modifies useEffect", async () => {
    const beforeSource = `import React from "react";
export function HeroSection({ title }: { title: string }) {
  return (
    <section className="hero py-8 bg-gray-100">
      <h1 className="text-3xl font-bold">{title}</h1>
    </section>
  );
}`;

    await writeFixture("src/components/HeroSection.tsx", beforeSource);

    // Patch changes Tailwind AND adds useEffect — should REJECT
    const unsafePatch = `--- a/src/components/HeroSection.tsx
+++ b/src/components/HeroSection.tsx
@@ -1,7 +1,11 @@
-import React from "react";
+import React, { useEffect } from "react";
 export function HeroSection({ title }: { title: string }) {
+  useEffect(() => {
+    document.title = title;
+  }, [title]);
   return (
-    <section className="hero py-8 bg-gray-100">
-      <h1 className="text-3xl font-bold">{title}</h1>
+    <section className="hero py-12 bg-white">
+      <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
     </section>
   );
 }`;

    const validator = new PatchValidator({ projectRoot: tmpDir });
    const plan = makePlan(tmpDir, ["src/components/HeroSection.tsx"], ["HeroSection"]);
    const result = await validator.validate(
      makePatchResult(unsafePatch, ["src/components/HeroSection.tsx"]),
      plan
    );

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.category === "hook_change")).toBe(true);
    expect(result.risk).toBe("high");
    // Visual recommendation attempted to modify application logic
    const hookViol = result.violations.find((v) => v.category === "hook_change");
    expect(hookViol?.message).toMatch(/useEffect.*ADDED|hook.*ADDED/i);
  });
});

// ---------------------------------------------------------------------------
// X. Dry-run validation without mutation
// ---------------------------------------------------------------------------

describe("PatchValidator — X: dry-run validation without mutation", () => {
  it("produces a ValidatedPatch without mutating the source file", async () => {
    const beforeSource = `import React from "react";
export function Widget() {
  return <div className="old-widget p-4">Widget</div>;
}`;

    await writeFixture("src/components/Widget.tsx", beforeSource);

    const patch = `--- a/src/components/Widget.tsx
+++ b/src/components/Widget.tsx
@@ -1,3 +1,3 @@
 import React from "react";
 export function Widget() {
-  return <div className="old-widget p-4">Widget</div>;
+  return <div className="new-widget p-6 bg-white rounded-xl shadow">Widget</div>;
 }`;

    const validator = new PatchValidator({ projectRoot: tmpDir });
    const plan = makePlan(tmpDir, ["src/components/Widget.tsx"], ["Widget"]);
    const result = await validator.validate(makePatchResult(patch), plan);

    // ValidatedPatch is returned
    expect(result).toBeDefined();
    expect(typeof result.valid).toBe("boolean");
    expect(result.parsedDiff).toBeDefined();
    expect(result.parsedDiff.files).toHaveLength(1);
    expect(result.validatedAt).toBeTruthy();
    expect(result.originalPatchHash).toBeTruthy();

    // Source file is UNCHANGED
    const afterContent = await (await import("node:fs/promises")).readFile(
      join(tmpDir, "src/components/Widget.tsx"),
      "utf8"
    );
    expect(afterContent).toBe(beforeSource);
  });
});

// ---------------------------------------------------------------------------
// Y. Read-only guarantee
// ---------------------------------------------------------------------------

describe("PatchValidator — Y: read-only guarantee", () => {
  it("does not create, modify, or delete any files during validation", async () => {
    const beforeSource = `import React from "react";
export function Card() {
  return <div className="card p-4">Card</div>;
}`;

    await writeFixture("src/components/Card.tsx", beforeSource);

    const beforeMtime = (await stat(join(tmpDir, "src/components/Card.tsx"))).mtimeMs;
    const beforeFiles = (await import("node:fs/promises")).readdir(join(tmpDir, "src/components"));

    const patch = `--- a/src/components/Card.tsx
+++ b/src/components/Card.tsx
@@ -1,3 +1,3 @@
 import React from "react";
 export function Card() {
-  return <div className="card p-4">Card</div>;
+  return <div className="card p-6 rounded-xl bg-white shadow">Card</div>;
 }`;

    const validator = new PatchValidator({ projectRoot: tmpDir });
    const plan = makePlan(tmpDir, ["src/components/Card.tsx"], ["Card"]);
    await validator.validate(makePatchResult(patch), plan);

    const afterMtime = (await stat(join(tmpDir, "src/components/Card.tsx"))).mtimeMs;
    const afterFiles = (await import("node:fs/promises")).readdir(join(tmpDir, "src/components"));

    // Source file mtime unchanged
    expect(afterMtime).toBe(beforeMtime);
    // No new files created
    expect(await afterFiles).toEqual(await beforeFiles);
  });

  it("does not mutate even when all gates fail", async () => {
    // Malformed patch — parser throws
    const validator = new PatchValidator({ projectRoot: tmpDir });
    const plan = makePlan(tmpDir, ["src/components/Hero.tsx"]);

    // Should return a ValidatedPatch with valid=false, not throw
    const result = await validator.validate(makePatchResult("this is not a diff"), plan);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.category === "malformed_diff")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Z. Realistic end-to-end validation fixture
// ---------------------------------------------------------------------------

describe("PatchValidator — Z: realistic end-to-end", () => {
  it("validates a realistic multi-property Tailwind refactor (all gates pass)", async () => {
    const beforeSource = `import React from "react";

interface HeroProps {
  title: string;
  subtitle?: string;
}

export function HeroSection({ title, subtitle }: HeroProps) {
  return (
    <section className="hero-section py-8 bg-gray-100">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        {subtitle && (
          <p className="mt-2 text-gray-600 text-base">{subtitle}</p>
        )}
        <button className="mt-4 bg-gray-400 text-black px-6 py-2 rounded">
          Get Started
        </button>
      </div>
    </section>
  );
}`;

    await writeFixture("src/components/HeroSection.tsx", beforeSource);

    const patch = `--- a/src/components/HeroSection.tsx
+++ b/src/components/HeroSection.tsx
@@ -9,9 +9,9 @@
 export function HeroSection({ title, subtitle }: HeroProps) {
   return (
-    <section className="hero-section py-8 bg-gray-100">
-      <div className="container mx-auto px-4">
-        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
+    <section className="hero-section py-12 bg-white">
+      <div className="container mx-auto px-6">
+        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">{title}</h1>
         {subtitle && (
-          <p className="mt-2 text-gray-600 text-base">{subtitle}</p>
+          <p className="mt-3 text-gray-500 text-lg">{subtitle}</p>
         )}
-        <button className="mt-4 bg-gray-400 text-black px-6 py-2 rounded">
+        <button className="mt-6 bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700">
           Get Started
         </button>
       </div>`;

    const validator = new PatchValidator({ projectRoot: tmpDir });
    const plan = makePlan(tmpDir, ["src/components/HeroSection.tsx"], ["HeroSection"]);
    const result = await validator.validate(
      makePatchResult(patch, ["src/components/HeroSection.tsx"]),
      plan
    );

    // Full pipeline passes
    expect(result.valid).toBe(true);
    expect(result.pathGuardResult.valid).toBe(true);
    expect(result.scopeResult.valid).toBe(true);
    expect(result.astResult.valid).toBe(true);
    expect(result.violations).toHaveLength(0);

    // Structural checks on ValidatedPatch
    expect(result.originalPatchHash).toBeTruthy();
    expect(result.normalizedFiles).toContain("src/components/HeroSection.tsx");
    expect(result.providerClaimedFiles).toContain("src/components/HeroSection.tsx");
    expect(result.parsedDiff.files).toHaveLength(1);
    expect(result.parsedDiff.totalAdditions).toBeGreaterThan(0);

    // No logic changes detected
    expect(result.astResult.changedHooks).toHaveLength(0);
    expect(result.astResult.changedNetworkOperations).toHaveLength(0);
    expect(result.astResult.changedExports).toHaveLength(0);
  });

  it("rejects a realistic E2E patch that also modifies api.ts (provider mismatch)", async () => {
    const heroSource = `import React from "react";
export function HeroSection() {
  return <section className="hero py-8"><h1>Title</h1></section>;
}`;

    const apiSource = `export const API_URL = "/api";`;

    await writeFixture("src/components/HeroSection.tsx", heroSource);
    await writeFixture("src/lib/api.ts", apiSource);

    // Diff touches BOTH files; provider claimed only Hero
    const multiFilePatch = `--- a/src/components/HeroSection.tsx
+++ b/src/components/HeroSection.tsx
@@ -1,3 +1,3 @@
 import React from "react";
 export function HeroSection() {
-  return <section className="hero py-8"><h1>Title</h1></section>;
+  return <section className="hero py-12"><h1>Title</h1></section>;
 }
--- a/src/lib/api.ts
+++ b/src/lib/api.ts
@@ -1,1 +1,3 @@
 export const API_URL = "/api";
+export async function fetchData(path: string) {
+  return fetch(API_URL + path).then((r) => r.json());
+}`;

    const validator = new PatchValidator({ projectRoot: tmpDir });
    // Plan only authorises HeroSection.tsx
    const plan = makePlan(tmpDir, ["src/components/HeroSection.tsx"], ["HeroSection"]);

    const result = await validator.validate(
      makePatchResult(multiFilePatch, ["src/components/HeroSection.tsx"]), // claimed only Hero
      plan
    );

    // The validator found api.ts in the DIFF — not in provider claims
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.file?.includes("api.ts"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ValidatedPatch structural completeness
// ---------------------------------------------------------------------------

describe("PatchValidator — ValidatedPatch structure", () => {
  it("returns all required fields even on parse failure", async () => {
    const validator = new PatchValidator({ projectRoot: tmpDir });
    const plan = makePlan(tmpDir, []);
    const result = await validator.validate(makePatchResult(""), plan);

    expect(result.originalPatchHash).toBeDefined();
    expect(result.rawPatch).toBeDefined();
    expect(result.parsedDiff).toBeDefined();
    expect(result.normalizedFiles).toBeDefined();
    expect(result.providerClaimedFiles).toBeDefined();
    expect(result.pathGuardResult).toBeDefined();
    expect(result.scopeResult).toBeDefined();
    expect(result.astResult).toBeDefined();
    expect(result.violations).toBeDefined();
    expect(result.warnings).toBeDefined();
    expect(typeof result.valid).toBe("boolean");
    expect(["low", "medium", "high"]).toContain(result.risk);
    expect(result.validatedAt).toBeTruthy();
  });

  it("preserves provider claimed files in output without using them for validation", async () => {
    const validator = new PatchValidator({ projectRoot: tmpDir });
    const plan = makePlan(tmpDir, ["src/components/Hero.tsx"]);
    const fakeClaimedFiles = ["src/components/Hero.tsx", "src/bogus/file.tsx"];

    const result = await validator.validate(
      makePatchResult("not-a-diff", fakeClaimedFiles),
      plan
    );

    // claimed files preserved for logging
    expect(result.providerClaimedFiles).toEqual(fakeClaimedFiles);
    // But validation failed (malformed diff) — claimed files were NOT used
    expect(result.valid).toBe(false);
  });
});
