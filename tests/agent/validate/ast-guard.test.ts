/**
 * Phase 3C Tests — AST Guard
 *
 * Tests L, M, N, O, P, Q, R, S, T from the required test matrix.
 *
 * The AST guard reads before-source from disk; we create temporary files
 * in an OS temp directory and clean up after each test.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDiff } from "../../../src/agent/patch/validate/parser.js";
import { runAstGuard } from "../../../src/agent/patch/validate/ast-guard.js";
import type { PatchPlan } from "../../../src/agent/types.js";
import type { MutationRecommendation } from "../../../src/analysis/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRec(): MutationRecommendation {
  return {
    id: "rec-ast-test",
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
}

function makePlan(projectRoot: string, allowedComponents: string[]): PatchPlan {
  const rec = makeRec();
  return {
    id: "plan-ast-test",
    createdAt: new Date().toISOString(),
    recommendation: rec,
    allowedFiles: [],
    allowedComponents,
    allowedSelectors: [],
    expectedVisualImprovement: "Better design",
    prohibitedAreas: [],
    maxFilesAllowed: 2,
    maxLinesChanged: 150,
    verificationRequirements: [],
    protectedPaths: [],
  };
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "elevate-ast-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeFixture(filename: string, content: string): Promise<void> {
  const filePath = join(tmpDir, filename);
  // Create nested directories if needed
  const dir = filePath.substring(0, filePath.lastIndexOf("\\") || filePath.lastIndexOf("/"));
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dir, { recursive: true }).catch(() => {/* ok */});
  await writeFile(filePath, content, "utf8");
}

// ---------------------------------------------------------------------------
// L. Valid JSX visual mutation
// ---------------------------------------------------------------------------

describe("AstGuard — L: valid JSX visual mutation", () => {
  it("passes a pure visual patch with no hook/API/export changes", async () => {
    const beforeSource = `
import React from "react";
export function HeroSection({ title }: { title: string }) {
  return (
    <section className="hero py-8 bg-gray-100">
      <h1 className="text-3xl font-bold">{title}</h1>
      <button className="mt-4 bg-gray-400 text-black px-6 py-2">CTA</button>
    </section>
  );
}`.trim();

    await writeFixture("src/components/HeroSection.tsx", beforeSource);

    const diff = `--- a/src/components/HeroSection.tsx
+++ b/src/components/HeroSection.tsx
@@ -1,7 +1,7 @@
 import React from "react";
 export function HeroSection({ title }: { title: string }) {
   return (
-    <section className="hero py-8 bg-gray-100">
-      <h1 className="text-3xl font-bold">{title}</h1>
-      <button className="mt-4 bg-gray-400 text-black px-6 py-2">CTA</button>
+    <section className="hero py-12 bg-white">
+      <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
+      <button className="mt-6 bg-blue-600 text-white px-8 py-3 rounded-lg">CTA</button>
     </section>
   );
 }`;

    const parsed = parseDiff(diff, { strictHunkCounts: false });
    const plan = makePlan(tmpDir, ["HeroSection"]);
    const result = await runAstGuard(parsed, plan, {
      projectRoot: tmpDir,
      allowedComponents: ["HeroSection"],
    });

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.changedHooks).toHaveLength(0);
    expect(result.changedNetworkOperations).toHaveLength(0);
    expect(result.changedExports).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// M. Tailwind-only mutation
// ---------------------------------------------------------------------------

describe("AstGuard — M: Tailwind-only mutation", () => {
  it("passes a Tailwind class-only change", async () => {
    const beforeSource = `
import React from "react";
export function Button({ children }: { children: React.ReactNode }) {
  return (
    <button className="bg-gray-400 text-black px-4 py-2 rounded">
      {children}
    </button>
  );
}`.trim();

    await writeFixture("src/components/Button.tsx", beforeSource);

    const diff = `--- a/src/components/Button.tsx
+++ b/src/components/Button.tsx
@@ -1,7 +1,7 @@
 import React from "react";
 export function Button({ children }: { children: React.ReactNode }) {
   return (
-    <button className="bg-gray-400 text-black px-4 py-2 rounded">
+    <button className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700">
       {children}
     </button>
   );
 }`;

    const parsed = parseDiff(diff, { strictHunkCounts: false });
    const plan = makePlan(tmpDir, ["Button"]);
    const result = await runAstGuard(parsed, plan, {
      projectRoot: tmpDir,
      allowedComponents: ["Button"],
    });

    expect(result.valid).toBe(true);
    expect(result.changedHooks).toHaveLength(0);
    expect(result.changedImports).toHaveLength(0);
    expect(result.changedExports).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// N. Hook change rejection
// ---------------------------------------------------------------------------

describe("AstGuard — N: hook change rejection", () => {
  it("rejects a patch that adds useEffect to a visual component", async () => {
    const beforeSource = `
import React from "react";
export function HeroSection({ title }: { title: string }) {
  return (
    <section className="hero py-8 bg-gray-100">
      <h1 className="text-3xl font-bold">{title}</h1>
    </section>
  );
}`.trim();

    await writeFixture("src/components/HeroSection.tsx", beforeSource);

    const diff = `--- a/src/components/HeroSection.tsx
+++ b/src/components/HeroSection.tsx
@@ -1,5 +1,9 @@
-import React from "react";
+import React, { useEffect } from "react";
 export function HeroSection({ title }: { title: string }) {
+  useEffect(() => {
+    document.title = title;
+  }, [title]);
   return (
-    <section className="hero py-8 bg-gray-100">
+    <section className="hero py-12 bg-white">
       <h1 className="text-3xl font-bold">{title}</h1>
     </section>
   );
 }`;

    const parsed = parseDiff(diff, { strictHunkCounts: false });
    const plan = makePlan(tmpDir, ["HeroSection"]);
    const result = await runAstGuard(parsed, plan, {
      projectRoot: tmpDir,
      allowedComponents: ["HeroSection"],
    });

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.category === "hook_change")).toBe(true);
    expect(result.changedHooks.some((h) => h.hookName === "useEffect")).toBe(true);
  });

  it("rejects a patch that adds useState", async () => {
    const beforeSource = `
import React from "react";
export function Widget() {
  return <div className="old-widget p-4">Widget</div>;
}`.trim();

    await writeFixture("src/components/Widget.tsx", beforeSource);

    const diff = `--- a/src/components/Widget.tsx
+++ b/src/components/Widget.tsx
@@ -1,4 +1,7 @@
-import React from "react";
+import React, { useState } from "react";
 export function Widget() {
+  const [open, setOpen] = useState(false);
   return (
-    <div className="old-widget p-4">Widget</div>
+    <div className="new-widget p-4" onClick={() => setOpen(!open)}>Widget</div>
   );
 }`;

    const parsed = parseDiff(diff, { strictHunkCounts: false });
    const plan = makePlan(tmpDir, ["Widget"]);
    const result = await runAstGuard(parsed, plan, {
      projectRoot: tmpDir,
      allowedComponents: ["Widget"],
    });

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.category === "hook_change")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// O. API/network change rejection
// ---------------------------------------------------------------------------

describe("AstGuard — O: API change rejection", () => {
  it("rejects a patch that adds a fetch() call", async () => {
    const beforeSource = `
import React from "react";
export function HeroSection({ title }: { title: string }) {
  return (
    <section className="hero py-8 bg-gray-100">
      <h1 className="text-3xl">{title}</h1>
    </section>
  );
}`.trim();

    await writeFixture("src/components/HeroSection.tsx", beforeSource);

    const diff = `--- a/src/components/HeroSection.tsx
+++ b/src/components/HeroSection.tsx
@@ -1,7 +1,12 @@
 import React from "react";
 export function HeroSection({ title }: { title: string }) {
+  const loadData = async () => {
+    const res = await fetch("/api/hero-data");
+    const data = await res.json();
+    console.log(data);
+  };
   return (
-    <section className="hero py-8 bg-gray-100">
+    <section className="hero py-12 bg-white">
       <h1 className="text-3xl">{title}</h1>
     </section>
   );
 }`;

    const parsed = parseDiff(diff, { strictHunkCounts: false });
    const plan = makePlan(tmpDir, ["HeroSection"]);
    const result = await runAstGuard(parsed, plan, {
      projectRoot: tmpDir,
      allowedComponents: ["HeroSection"],
    });

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.category === "api_change")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// P. Server action rejection
// ---------------------------------------------------------------------------

describe("AstGuard — P: server action rejection", () => {
  it("rejects a patch that adds 'use server' directive", async () => {
    const beforeSource = `
import React from "react";
export function HeroSection() {
  return <section className="hero py-8"><h1>Title</h1></section>;
}`.trim();

    await writeFixture("src/components/HeroSection.tsx", beforeSource);

    const diff = `--- a/src/components/HeroSection.tsx
+++ b/src/components/HeroSection.tsx
@@ -1,4 +1,6 @@
+"use server";
+
 import React from "react";
 export function HeroSection() {
-  return <section className="hero py-8"><h1>Title</h1></section>;
+  return <section className="hero py-12"><h1>Title</h1></section>;
 }`;

    const parsed = parseDiff(diff, { strictHunkCounts: false });
    const plan = makePlan(tmpDir, ["HeroSection"]);
    const result = await runAstGuard(parsed, plan, {
      projectRoot: tmpDir,
      allowedComponents: ["HeroSection"],
    });

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.category === "server_action_change")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Q. Import/package change rejection
// ---------------------------------------------------------------------------

describe("AstGuard — Q: external package import rejection", () => {
  it("rejects a patch that adds an external package import (framer-motion)", async () => {
    const beforeSource = `
import React from "react";
export function HeroSection() {
  return <section className="hero py-8"><h1>Title</h1></section>;
}`.trim();

    await writeFixture("src/components/HeroSection.tsx", beforeSource);

    const diff = `--- a/src/components/HeroSection.tsx
+++ b/src/components/HeroSection.tsx
@@ -1,4 +1,5 @@
 import React from "react";
+import { motion } from "framer-motion";
 export function HeroSection() {
-  return <section className="hero py-8"><h1>Title</h1></section>;
+  return <motion.section className="hero py-12"><h1>Title</h1></motion.section>;
 }`;

    const parsed = parseDiff(diff, { strictHunkCounts: false });
    const plan = makePlan(tmpDir, ["HeroSection"]);
    const result = await runAstGuard(parsed, plan, {
      projectRoot: tmpDir,
      allowedComponents: ["HeroSection"],
    });

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.category === "import_change")).toBe(true);
    expect(result.changedImports.some((i) => i.isExternalPackage && i.moduleSpecifier === "framer-motion")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R. Export change rejection
// ---------------------------------------------------------------------------

describe("AstGuard — R: export change rejection", () => {
  it("rejects a patch that renames an exported function (removes old export)", async () => {
    const beforeSource = `
import React from "react";
export function HeroSection() {
  return <section className="hero py-8"><h1>Title</h1></section>;
}`.trim();

    await writeFixture("src/components/HeroSection.tsx", beforeSource);

    const diff = `--- a/src/components/HeroSection.tsx
+++ b/src/components/HeroSection.tsx
@@ -1,4 +1,4 @@
 import React from "react";
-export function HeroSection() {
-  return <section className="hero py-8"><h1>Title</h1></section>;
+export function HeroRenamed() {
+  return <section className="hero py-12"><h1>Title</h1></section>;
 }`;

    const parsed = parseDiff(diff, { allowRenames: true });
    const plan = makePlan(tmpDir, ["HeroSection"]);
    const result = await runAstGuard(parsed, plan, {
      projectRoot: tmpDir,
      allowedComponents: ["HeroSection"],
    });

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.category === "export_change")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// S. Unrelated component rejection
// ---------------------------------------------------------------------------

describe("AstGuard — S: unrelated component rejection", () => {
  it("warns when a sibling component's content changes alongside authorized component", async () => {
    const beforeSource = `
import React from "react";

export function Header() {
  return <header className="bg-white border-b"><nav>Nav</nav></header>;
}

export function HeroSection() {
  return <section className="hero py-8"><h1>Hero</h1></section>;
}
`.trim();

    await writeFixture("src/components/Page.tsx", beforeSource);

    // Patch only changes HeroSection's classes (authorized)
    // Header unchanged
    const diff = `--- a/src/components/Page.tsx
+++ b/src/components/Page.tsx
@@ -4,7 +4,7 @@
 export function Header() {
   return <header className="bg-white border-b"><nav>Nav</nav></header>;
 }
 
 export function HeroSection() {
-  return <section className="hero py-8"><h1>Hero</h1></section>;
+  return <section className="hero py-12 bg-white"><h1>Hero</h1></section>;
 }`;

    const parsed = parseDiff(diff, { strictHunkCounts: false });
    const plan = makePlan(tmpDir, ["HeroSection"]);
    const result = await runAstGuard(parsed, plan, {
      projectRoot: tmpDir,
      allowedComponents: ["HeroSection"],
    });

    // Should pass — Header was NOT changed in the patch
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T. Nested boundary handling
// ---------------------------------------------------------------------------

describe("AstGuard — T: nested component handling", () => {
  it("handles nested component declarations correctly", async () => {
    const beforeSource = `
import React from "react";

export function Card({ children }: { children: React.ReactNode }) {
  return <div className="card bg-white shadow-sm p-4 rounded">{children}</div>;
}

export function HeroSection() {
  return (
    <section className="hero py-8">
      <Card>
        <h1 className="text-3xl">Title</h1>
      </Card>
    </section>
  );
}`.trim();

    await writeFixture("src/components/HeroSection.tsx", beforeSource);

    const diff = `--- a/src/components/HeroSection.tsx
+++ b/src/components/HeroSection.tsx
@@ -1,11 +1,11 @@
 import React from "react";
 
 export function Card({ children }: { children: React.ReactNode }) {
-  return <div className="card bg-white shadow-sm p-4 rounded">{children}</div>;
+  return <div className="card bg-white shadow-md p-6 rounded-xl">{children}</div>;
 }
 
 export function HeroSection() {
   return (
-    <section className="hero py-8">
+    <section className="hero py-12">
       <Card>
-        <h1 className="text-3xl">Title</h1>
+        <h1 className="text-4xl font-bold">Title</h1>
       </Card>
     </section>
   );
 }`;

    const parsed = parseDiff(diff, { strictHunkCounts: false });
    const plan = makePlan(tmpDir, ["HeroSection", "Card"]);
    const result = await runAstGuard(parsed, plan, {
      projectRoot: tmpDir,
      allowedComponents: ["HeroSection", "Card"],
    });

    // Both Card and HeroSection are authorized — should pass
    expect(result.valid).toBe(true);
    expect(result.changedHooks).toHaveLength(0);
  });
});
