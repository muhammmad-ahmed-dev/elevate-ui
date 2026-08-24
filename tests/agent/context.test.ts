/**
 * Phase 3B Tests — Source Context Builder
 *
 * Uses real temporary directories and real files.
 * Verifies exclusion of .env, secrets, protected paths, and non-absolute paths.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SourceContextBuilder,
  checkContextExclusion,
  isContextExcluded,
} from "../../src/agent/patch/context.js";
import type { PatchPlan } from "../../src/agent/types.js";
import type { MutationRecommendation } from "../../src/analysis/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlan(projectRoot: string, allowedFiles: string[]): PatchPlan {
  const rec: MutationRecommendation = {
    id: "rec-1",
    problem: "Low contrast button",
    evidence: {},
    affectedSelector: "button.cta-btn",
    affectedComponents: ["Hero"],
    affectedViewports: ["mobile"],
    proposedImprovement: "Use bg-blue-600",
    rationale: "WCAG AA",
    confidence: 0.9,
    estimatedMutationScope: "single-element",
    risk: "low",
    sourceFindingIds: ["f1"],
  };

  return {
    id: "plan-test",
    createdAt: new Date().toISOString(),
    recommendation: rec,
    allowedFiles,
    allowedComponents: ["Hero"],
    allowedSelectors: ["button.cta-btn"],
    expectedVisualImprovement: "bg-blue-600",
    prohibitedAreas: [],
    maxFilesAllowed: 2,
    maxLinesChanged: 150,
    verificationRequirements: [],
    protectedPaths: [],
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "elevate-ctx-"));
  await mkdir(join(tmpDir, "src", "components"), { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Context exclusion pattern checks
// ---------------------------------------------------------------------------

describe("isContextExcluded — exclusion patterns", () => {
  it("excludes .env files", () => {
    expect(isContextExcluded(".env")).toBe(true);
    expect(isContextExcluded(".env.local")).toBe(true);
    expect(isContextExcluded(".env.production")).toBe(true);
  });

  it("excludes files with 'secret' in basename", () => {
    expect(isContextExcluded("config/secret.json")).toBe(true);
    expect(isContextExcluded("my-secret.ts")).toBe(true);
  });

  it("excludes files with 'credential' in basename", () => {
    expect(isContextExcluded("credential.json")).toBe(true);
  });

  it("excludes node_modules", () => {
    expect(isContextExcluded("node_modules/react/index.js")).toBe(true);
  });

  it("excludes .next/ build output", () => {
    expect(isContextExcluded(".next/server/app/page.js")).toBe(true);
  });

  it("excludes dist/ output", () => {
    expect(isContextExcluded("dist/index.js")).toBe(true);
  });

  it("excludes binary extensions", () => {
    expect(isContextExcluded("public/logo.png")).toBe(true);
    expect(isContextExcluded("fonts/Inter.woff2")).toBe(true);
    expect(isContextExcluded("hero.jpg")).toBe(true);
  });

  it("excludes lock files by extension (.lock)", () => {
    // yarn.lock extension is .lock — in CONTEXT_EXCLUSION_EXTENSIONS
    expect(isContextExcluded("yarn.lock")).toBe(true);
    // package-lock.json extension is .json — NOT in context exclusion extensions
    // (protected-path registry handles it separately)
    expect(isContextExcluded("package-lock.json")).toBe(false);
  });

  it("does NOT exclude normal component files", () => {
    expect(isContextExcluded("src/components/Hero.tsx")).toBe(false);
    expect(isContextExcluded("src/app/page.tsx")).toBe(false);
    expect(isContextExcluded("src/styles/globals.css")).toBe(false);
  });
});

describe("checkContextExclusion — exported alias", () => {
  it("is the same function as isContextExcluded", () => {
    expect(checkContextExclusion(".env")).toBe(true);
    expect(checkContextExclusion("src/components/Button.tsx")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SourceContextBuilder integration tests
// ---------------------------------------------------------------------------

describe("SourceContextBuilder — includes authorised files", () => {
  it("reads and returns a safe component file", async () => {
    const heroFile = join(tmpDir, "src", "components", "Hero.tsx");
    await writeFile(heroFile, `export function Hero() { return <button className="cta-btn">CTA</button>; }`);

    const builder = new SourceContextBuilder({ projectRoot: tmpDir });
    const plan = makePlan(tmpDir, [heroFile]);
    const { files, errors } = await builder.buildContext(plan);

    expect(files.length).toBe(1);
    expect(files[0].relativePath).toBe("src/components/Hero.tsx");
    expect(files[0].content).toContain("cta-btn");
    expect(files[0].isPrimaryTarget).toBe(true);
    expect(errors.length).toBe(0);
  });

  it("marks only the first file as isPrimaryTarget", async () => {
    const f1 = join(tmpDir, "src", "components", "A.tsx");
    const f2 = join(tmpDir, "src", "components", "B.tsx");
    await writeFile(f1, "export function A() { return <div/>; }");
    await writeFile(f2, "export function B() { return <span/>; }");

    const builder = new SourceContextBuilder({ projectRoot: tmpDir });
    const plan = makePlan(tmpDir, [f1, f2]);
    const { files } = await builder.buildContext(plan);

    expect(files[0].isPrimaryTarget).toBe(true);
    expect(files[1].isPrimaryTarget).toBe(false);
  });
});

describe("SourceContextBuilder — .env exclusion (security-critical)", () => {
  it("excludes .env files even when listed in allowedFiles", async () => {
    const envFile = join(tmpDir, ".env");
    await writeFile(envFile, "SECRET=supersecret\nAPI_KEY=abc123");

    const builder = new SourceContextBuilder({ projectRoot: tmpDir });
    const plan = makePlan(tmpDir, [envFile]);
    const { files, errors } = await builder.buildContext(plan);

    // Must have no files — .env is excluded at context layer
    expect(files.length).toBe(0);
    expect(errors.length).toBeGreaterThan(0);
    // Error message must not contain the secret value
    for (const err of errors) {
      expect(err).not.toContain("supersecret");
      expect(err).not.toContain("abc123");
    }
  });

  it("excludes .env.local", async () => {
    await mkdir(join(tmpDir, "config"), { recursive: true });
    const envLocal = join(tmpDir, ".env.local");
    await writeFile(envLocal, "NEXT_PUBLIC_KEY=value");

    const builder = new SourceContextBuilder({ projectRoot: tmpDir });
    const plan = makePlan(tmpDir, [envLocal]);
    const { files } = await builder.buildContext(plan);
    expect(files.length).toBe(0);
  });
});

describe("SourceContextBuilder — protected path re-check", () => {
  it("excludes package.json even when listed in allowedFiles", async () => {
    const pkgFile = join(tmpDir, "package.json");
    await writeFile(pkgFile, '{"name":"test"}');

    const builder = new SourceContextBuilder({ projectRoot: tmpDir });
    const plan = makePlan(tmpDir, [pkgFile]);
    const { files, errors } = await builder.buildContext(plan);

    expect(files.length).toBe(0);
    expect(errors.some((e) => e.includes("protected"))).toBe(true);
  });
});

describe("SourceContextBuilder — unreadable file handling", () => {
  it("skips files that do not exist and records an error", async () => {
    const nonExistent = join(tmpDir, "src", "components", "Ghost.tsx");

    const builder = new SourceContextBuilder({ projectRoot: tmpDir });
    const plan = makePlan(tmpDir, [nonExistent]);
    const { files, errors } = await builder.buildContext(plan);

    expect(files.length).toBe(0);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/could not read/i);
  });
});

describe("SourceContextBuilder — maxFiles cap", () => {
  it("respects maxFiles option", async () => {
    const files = [];
    for (let i = 1; i <= 5; i++) {
      const f = join(tmpDir, "src", "components", `Comp${i}.tsx`);
      await writeFile(f, `export function Comp${i}() { return <div/> }`);
      files.push(f);
    }

    const builder = new SourceContextBuilder({ projectRoot: tmpDir, maxFiles: 2 });
    const plan = makePlan(tmpDir, files);
    const result = await builder.buildContext(plan);

    expect(result.files.length).toBeLessThanOrEqual(2);
  });
});

describe("SourceContextBuilder.isSafeForContext", () => {
  it("returns safe=true for a normal component file", () => {
    const builder = new SourceContextBuilder({ projectRoot: tmpDir });
    const heroFile = join(tmpDir, "src", "components", "Hero.tsx");
    const result = builder.isSafeForContext(heroFile);
    expect(result.safe).toBe(true);
  });

  it("returns safe=false for a .env file", () => {
    const builder = new SourceContextBuilder({ projectRoot: tmpDir });
    const envFile = join(tmpDir, ".env");
    const result = builder.isSafeForContext(envFile);
    expect(result.safe).toBe(false);
  });

  it("returns safe=false for a non-absolute path", () => {
    const builder = new SourceContextBuilder({ projectRoot: tmpDir });
    const result = builder.isSafeForContext("relative/path.tsx");
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/not an absolute path/i);
  });
});
