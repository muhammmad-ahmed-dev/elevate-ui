/**
 * Phase 3C Tests — Path Guard + Scope Guard
 *
 * Tests C, D, E, F, G, H, W from the required test matrix.
 */

import { describe, it, expect } from "vitest";
import { parseDiff } from "../../../src/agent/patch/validate/parser.js";
import { runPathGuard } from "../../../src/agent/patch/validate/path-guard.js";
import { runScopeGuard } from "../../../src/agent/patch/validate/scope-guard.js";
import type { PatchPlan } from "../../../src/agent/types.js";
import type { MutationRecommendation } from "../../../src/analysis/types.js";
import {
  DIFF_TAILWIND_ONLY,
  DIFF_NEW_FILE,
  DIFF_PROVIDER_CLAIM_MISMATCH,
} from "./fixtures.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ROOT = "C:/project";

function makeRec(): MutationRecommendation {
  return {
    id: "rec-test",
    problem: "Low contrast button",
    evidence: {},
    affectedViewports: ["mobile"],
    proposedImprovement: "bg-blue-600",
    rationale: "WCAG",
    confidence: 0.9,
    estimatedMutationScope: "single-element",
    risk: "low",
    sourceFindingIds: [],
  };
}

function makePlan(allowedRelPaths: string[], maxFiles = 2, maxLines = 150): PatchPlan {
  const rec = makeRec();
  return {
    id: "plan-test",
    createdAt: new Date().toISOString(),
    recommendation: rec,
    allowedFiles: allowedRelPaths.map((p) => `${PROJECT_ROOT}/${p}`),
    allowedComponents: ["HeroSection", "Button"],
    allowedSelectors: ["button.cta"],
    expectedVisualImprovement: "Higher contrast",
    prohibitedAreas: [],
    maxFilesAllowed: maxFiles,
    maxLinesChanged: maxLines,
    verificationRequirements: [],
    protectedPaths: [],
  };
}

// ---------------------------------------------------------------------------
// E. Protected path rejection
// ---------------------------------------------------------------------------

describe("PathGuard — E: protected path rejection", () => {
  it("rejects package.json modification", () => {
    const diff = `--- a/package.json
+++ b/package.json
@@ -1,3 +1,4 @@
 {
   "name": "test",
+  "description": "modified"
 }`;

    const parsed = parseDiff(diff);
    const result = runPathGuard(parsed, {
      projectRoot: PROJECT_ROOT,
      allowedFiles: [`${PROJECT_ROOT}/package.json`],
      maxFilesAllowed: 2,
    });

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.category === "protected_path")).toBe(true);
  });

  it("rejects .env file modification", () => {
    const diff = `--- a/.env
+++ b/.env
@@ -1,1 +1,2 @@
 DATABASE_URL=postgres://localhost/db
+SECRET_KEY=hacked`;

    const parsed = parseDiff(diff);
    const result = runPathGuard(parsed, {
      projectRoot: PROJECT_ROOT,
      allowedFiles: [`${PROJECT_ROOT}/.env`],
      maxFilesAllowed: 2,
    });

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.category === "protected_path")).toBe(true);
  });

  it("rejects API route modification", () => {
    const diff = `--- a/src/app/api/users/route.ts
+++ b/src/app/api/users/route.ts
@@ -1,4 +1,5 @@
 import { NextResponse } from "next/server";
 export async function GET() {
   return NextResponse.json({ users: [] });
+  // modified
 }`;

    const parsed = parseDiff(diff);
    const result = runPathGuard(parsed, {
      projectRoot: PROJECT_ROOT,
      allowedFiles: [`${PROJECT_ROOT}/src/app/api/users/route.ts`],
      maxFilesAllowed: 2,
    });

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.category === "protected_path")).toBe(true);
  });

  it("rejects auth module modification", () => {
    const diff = `--- a/src/lib/auth.ts
+++ b/src/lib/auth.ts
@@ -1,3 +1,4 @@
 export function verifyToken(token: string) {
   return token === process.env.SECRET;
+  // modified
 }`;

    const parsed = parseDiff(diff);
    const result = runPathGuard(parsed, {
      projectRoot: PROJECT_ROOT,
      allowedFiles: [`${PROJECT_ROOT}/src/lib/auth.ts`],
      maxFilesAllowed: 2,
    });

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.category === "protected_path")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F. PatchPlan scope rejection
// ---------------------------------------------------------------------------

describe("PathGuard — F: out-of-scope file rejection", () => {
  it("rejects a file not in PatchPlan.allowedFiles", () => {
    const diff = `--- a/src/components/Unrelated.tsx
+++ b/src/components/Unrelated.tsx
@@ -1,2 +1,2 @@
 import React from "react";
-export function Unrelated() { return <div className="old"/>; }
+export function Unrelated() { return <div className="new"/>; }`;

    const parsed = parseDiff(diff);
    // Plan only allows HeroSection, not Unrelated
    const plan = makePlan(["src/components/HeroSection.tsx"]);
    const result = runPathGuard(parsed, {
      projectRoot: PROJECT_ROOT,
      allowedFiles: plan.allowedFiles,
      maxFilesAllowed: plan.maxFilesAllowed,
    });

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.category === "out_of_scope")).toBe(true);
  });

  it("accepts a file that IS in PatchPlan.allowedFiles", () => {
    const parsed = parseDiff(DIFF_TAILWIND_ONLY);
    const result = runPathGuard(parsed, {
      projectRoot: PROJECT_ROOT,
      allowedFiles: [`${PROJECT_ROOT}/src/components/Button.tsx`],
      maxFilesAllowed: 2,
    });

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.normalizedPaths).toContain("src/components/Button.tsx");
  });
});

// ---------------------------------------------------------------------------
// G. File count limit
// ---------------------------------------------------------------------------

describe("PathGuard — G: file count limit", () => {
  it("rejects when diff touches more files than maxFilesAllowed", () => {
    // Multi-file diff
    const diff = `--- a/src/components/A.tsx
+++ b/src/components/A.tsx
@@ -1,2 +1,2 @@
 import React from "react";
-export function A() { return <div className="old-a"/>; }
+export function A() { return <div className="new-a"/>; }
--- a/src/components/B.tsx
+++ b/src/components/B.tsx
@@ -1,2 +1,2 @@
 import React from "react";
-export function B() { return <div className="old-b"/>; }
+export function B() { return <div className="new-b"/>; }
--- a/src/components/C.tsx
+++ b/src/components/C.tsx
@@ -1,2 +1,2 @@
 import React from "react";
-export function C() { return <div className="old-c"/>; }
+export function C() { return <div className="new-c"/>; }`;

    const parsed = parseDiff(diff);
    const result = runPathGuard(parsed, {
      projectRoot: PROJECT_ROOT,
      allowedFiles: [
        `${PROJECT_ROOT}/src/components/A.tsx`,
        `${PROJECT_ROOT}/src/components/B.tsx`,
        `${PROJECT_ROOT}/src/components/C.tsx`,
      ],
      maxFilesAllowed: 2, // Only 2 allowed but diff has 3
    });

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.category === "file_count_exceeded")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// H. Line count limit
// ---------------------------------------------------------------------------

describe("ScopeGuard — H: line count limit", () => {
  it("rejects when total changed lines exceed maxLinesChanged", () => {
    // Generate a large diff
    const addedLines = Array.from({ length: 100 }, (_, i) => `+  // added line ${i}`);
    const removedLines = Array.from({ length: 100 }, (_, i) => `-  // removed line ${i}`);
    const contextLines = Array.from({ length: 3 }, () => " ");

    const diff = `--- a/src/components/Huge.tsx
+++ b/src/components/Huge.tsx
@@ -1,103 +1,103 @@
${contextLines.join("\n")}
${removedLines.join("\n")}
${addedLines.join("\n")}`;

    const parsed = parseDiff(diff, { strictHunkCounts: false });
    const plan = makePlan(["src/components/Huge.tsx"], 2, 50); // limit 50
    const result = runScopeGuard(parsed, plan, { projectRoot: PROJECT_ROOT });

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("exceed"))).toBe(true);
  });

  it("accepts when total changed lines are within limit", () => {
    const parsed = parseDiff(DIFF_TAILWIND_ONLY);
    const plan = makePlan(["src/components/Button.tsx"], 2, 150);
    const result = runScopeGuard(parsed, plan, { projectRoot: PROJECT_ROOT });

    expect(result.valid).toBe(true);
  });

  it("uses conservative default of 150 when maxLinesChanged is 0", () => {
    const parsed = parseDiff(DIFF_TAILWIND_ONLY);
    const plan = makePlan(["src/components/Button.tsx"], 2, 0);
    const result = runScopeGuard(parsed, plan, { projectRoot: PROJECT_ROOT });

    // With 2 changed lines vs 150 default limit — should pass
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// W. Provider claimed-file mismatch
// ---------------------------------------------------------------------------

describe("PathGuard — W: provider claimed-file mismatch", () => {
  it("uses parsed diff files, not provider claims — rejects api.ts not in plan", () => {
    // The diff touches BOTH HeroSection.tsx AND src/lib/api.ts
    // Provider claimed only HeroSection.tsx
    const parsed = parseDiff(DIFF_PROVIDER_CLAIM_MISMATCH);

    expect(parsed.files).toHaveLength(2);

    // Plan only allows HeroSection.tsx
    const result = runPathGuard(parsed, {
      projectRoot: PROJECT_ROOT,
      allowedFiles: [`${PROJECT_ROOT}/src/components/HeroSection.tsx`],
      maxFilesAllowed: 2,
    });

    expect(result.valid).toBe(false);
    // api.ts is out of scope — the validator detected it from the DIFF, not from claims
    expect(result.violations.some((v) => v.file?.includes("api.ts"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// New file accepted if in allowedFiles
// ---------------------------------------------------------------------------

describe("PathGuard — new file creation handling", () => {
  it("accepts a new file when its path is in allowedFiles", () => {
    const parsed = parseDiff(DIFF_NEW_FILE);
    const result = runPathGuard(parsed, {
      projectRoot: PROJECT_ROOT,
      allowedFiles: [`${PROJECT_ROOT}/src/components/NewButton.tsx`],
      maxFilesAllowed: 2,
    });

    expect(result.valid).toBe(true);
    expect(result.normalizedPaths).toContain("src/components/NewButton.tsx");
  });
});
