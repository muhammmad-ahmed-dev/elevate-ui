/**
 * Phase 3A Tests — PatchPlanner
 *
 * Verifies plan creation, scope validation, ambiguity refusal, and
 * protected-file rejection.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PatchPlanner } from "../../src/agent/plan.js";
import type { MutationRecommendation } from "../../src/analysis/types.js";
import type { ComponentLocatorResult, LocatorCandidate } from "../../src/agent/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecommendation(overrides: Partial<MutationRecommendation> = {}): MutationRecommendation {
  return {
    id: "rec-1",
    problem: "Hero CTA button is low-contrast",
    evidence: {},
    affectedSelector: "button.cta-btn",
    affectedComponents: ["HeroSection"],
    affectedViewports: ["mobile", "desktop"],
    proposedImprovement: "Increase button contrast with Tailwind bg-blue-600 text-white",
    rationale: "Low contrast fails WCAG AA",
    confidence: 0.9,
    estimatedMutationScope: "single-element",
    risk: "low",
    sourceFindingIds: ["f1"],
    ...overrides,
  };
}

function makeLocatorResult(
  projectRoot: string,
  absolutePath: string,
  overrides: Partial<ComponentLocatorResult> = {}
): ComponentLocatorResult {
  const candidate: LocatorCandidate = {
    absolutePath,
    relativePath: absolutePath.replace(projectRoot + "/", "").replace(/\\/g, "/"),
    evidence: ["Component name matched", "Class .cta-btn found"],
    confidence: 1.0,
    matchedSelectors: ["button.cta-btn"],
    componentNames: ["HeroSection"],
    matchedTailwindClasses: ["cta-btn"],
    isReactComponent: true,
  };

  return {
    recommendationId: "rec-1",
    confidence: "high",
    candidates: [candidate],
    primaryCandidate: candidate,
    isAmbiguous: false,
    summary: "High-confidence match",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fixture setup
// ---------------------------------------------------------------------------

let tmpDir: string;
let heroFile: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "elevate-planner-"));
  await mkdir(join(tmpDir, "src", "components"), { recursive: true });

  heroFile = join(tmpDir, "src", "components", "HeroSection.tsx");
  await writeFile(
    heroFile,
    `export function HeroSection() { return <button className="cta-btn">CTA</button>; }`
  );
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PatchPlanner — successful plan creation", () => {
  it("creates a valid PatchPlan when locator is confident", () => {
    const planner = new PatchPlanner({ projectRoot: tmpDir });
    const rec = makeRecommendation();
    const locatorResult = makeLocatorResult(tmpDir, heroFile);

    const plan = planner.createPlan(rec, locatorResult);

    expect(plan.id).toMatch(/^plan-/);
    expect(plan.createdAt).toBeTruthy();
    expect(plan.recommendation.id).toBe("rec-1");
    expect(plan.allowedFiles).toContain(heroFile);
    expect(plan.allowedSelectors).toContain("button.cta-btn");
    expect(plan.expectedVisualImprovement).toContain("bg-blue-600");
    expect(plan.prohibitedAreas.length).toBeGreaterThan(0);
    expect(plan.verificationRequirements.length).toBeGreaterThan(0);
    expect(plan.maxFilesAllowed).toBeGreaterThan(0);
  });

  it("includes component names from locator candidates", () => {
    const planner = new PatchPlanner({ projectRoot: tmpDir });
    const plan = planner.createPlan(
      makeRecommendation(),
      makeLocatorResult(tmpDir, heroFile)
    );

    expect(plan.allowedComponents).toContain("HeroSection");
  });

  it("plan includes verification requirements for typecheck and build", () => {
    const planner = new PatchPlanner({ projectRoot: tmpDir });
    const plan = planner.createPlan(
      makeRecommendation(),
      makeLocatorResult(tmpDir, heroFile)
    );

    const reqs = plan.verificationRequirements.join(" ");
    expect(reqs).toMatch(/typecheck|tsc/i);
    expect(reqs).toMatch(/build/i);
  });
});

describe("PatchPlanner — ambiguous locator refusal", () => {
  it("throws when locator result is ambiguous", () => {
    const planner = new PatchPlanner({ projectRoot: tmpDir });
    const ambiguousResult = makeLocatorResult(tmpDir, heroFile, {
      isAmbiguous: true,
      primaryCandidate: undefined,
      confidence: "ambiguous",
      summary: "Two equally likely matches found",
    });

    expect(() => planner.createPlan(makeRecommendation(), ambiguousResult)).toThrow(
      /ambiguous/i
    );
  });

  it("throws when locator has no candidates", () => {
    const planner = new PatchPlanner({ projectRoot: tmpDir });
    const emptyResult: ComponentLocatorResult = {
      recommendationId: "rec-1",
      confidence: "ambiguous",
      candidates: [],
      isAmbiguous: true,
      summary: "No source files found",
    };

    expect(() => planner.createPlan(makeRecommendation(), emptyResult)).toThrow();
  });
});

describe("PatchPlanner — protected-file rejection", () => {
  it("throws when the only candidate is a protected file (package.json)", async () => {
    const pkgFile = join(tmpDir, "package.json");
    await writeFile(pkgFile, '{ "name": "test" }');

    const planner = new PatchPlanner({ projectRoot: tmpDir });
    const locatorResult = makeLocatorResult(tmpDir, pkgFile);

    expect(() => planner.createPlan(makeRecommendation(), locatorResult)).toThrow(
      /protected/i
    );
  });

  it("throws when the only candidate is a .env file", async () => {
    const envFile = join(tmpDir, ".env");
    await writeFile(envFile, "SECRET=abc");

    const planner = new PatchPlanner({ projectRoot: tmpDir });
    const locatorResult = makeLocatorResult(tmpDir, envFile);

    expect(() => planner.createPlan(makeRecommendation(), locatorResult)).toThrow(
      /protected/i
    );
  });

  it("throws when the only candidate is an API route", async () => {
    await mkdir(join(tmpDir, "src", "app", "api", "users"), { recursive: true });
    const apiFile = join(tmpDir, "src", "app", "api", "users", "route.ts");
    await writeFile(apiFile, "export async function GET() { return Response.json({}); }");

    const planner = new PatchPlanner({ projectRoot: tmpDir });
    const locatorResult = makeLocatorResult(tmpDir, apiFile);

    expect(() => planner.createPlan(makeRecommendation(), locatorResult)).toThrow(
      /protected/i
    );
  });
});

describe("PatchPlanner — scope validation", () => {
  it("validatePatchScope passes for files within allowed list", () => {
    const planner = new PatchPlanner({ projectRoot: tmpDir });
    const plan = planner.createPlan(
      makeRecommendation(),
      makeLocatorResult(tmpDir, heroFile)
    );

    const result = planner.validatePatchScope(plan, [heroFile]);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("validatePatchScope rejects files not in the allowed list", () => {
    const planner = new PatchPlanner({ projectRoot: tmpDir });
    const plan = planner.createPlan(
      makeRecommendation(),
      makeLocatorResult(tmpDir, heroFile)
    );

    const outsideFile = join(tmpDir, "src", "components", "Unrelated.tsx");
    const result = planner.validatePatchScope(plan, [outsideFile]);

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("allowedFiles"))).toBe(true);
  });

  it("validatePatchScope rejects protected files even if they were in allowedFiles", async () => {
    const planner = new PatchPlanner({ projectRoot: tmpDir });
    const plan = planner.createPlan(
      makeRecommendation(),
      makeLocatorResult(tmpDir, heroFile)
    );

    // Attempt to validate with a protected file not in the plan
    const pkgFile = join(tmpDir, "package.json");
    const result = planner.validatePatchScope(plan, [pkgFile]);

    expect(result.valid).toBe(false);
  });

  it("validatePatchScope rejects when file count exceeds maxFilesAllowed", () => {
    const planner = new PatchPlanner({ projectRoot: tmpDir, maxFilesAllowed: 1 });
    const plan = planner.createPlan(
      makeRecommendation(),
      makeLocatorResult(tmpDir, heroFile)
    );

    // Provide two files even though max is 1
    const anotherFile = join(tmpDir, "src", "components", "Extra.tsx");
    const result = planner.validatePatchScope(plan, [heroFile, anotherFile]);

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => /maxFilesAllowed|max.*files/i.test(v))).toBe(true);
  });
});

describe("PatchPlanner — prohibited areas documentation", () => {
  it("plan always lists API routes as prohibited", () => {
    const planner = new PatchPlanner({ projectRoot: tmpDir });
    const plan = planner.createPlan(
      makeRecommendation(),
      makeLocatorResult(tmpDir, heroFile)
    );

    const prohibited = plan.prohibitedAreas.map((p) => p.description).join(" ");
    expect(prohibited).toMatch(/api\s*route/i);
  });

  it("plan always lists authentication as prohibited", () => {
    const planner = new PatchPlanner({ projectRoot: tmpDir });
    const plan = planner.createPlan(
      makeRecommendation(),
      makeLocatorResult(tmpDir, heroFile)
    );

    const prohibited = plan.prohibitedAreas.map((p) => p.description).join(" ");
    expect(prohibited).toMatch(/auth/i);
  });

  it("plan always lists hooks as prohibited", () => {
    const planner = new PatchPlanner({ projectRoot: tmpDir });
    const plan = planner.createPlan(
      makeRecommendation(),
      makeLocatorResult(tmpDir, heroFile)
    );

    const prohibited = plan.prohibitedAreas.map((p) => p.description).join(" ");
    expect(prohibited).toMatch(/hook/i);
  });
});
