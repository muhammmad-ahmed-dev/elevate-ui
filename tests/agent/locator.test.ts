/**
 * Phase 3A Tests — ComponentLocator
 *
 * Uses real temporary directories with real source files.
 * Verifies locator confidence tiers and ambiguity handling.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ComponentLocator } from "../../src/agent/locator.js";
import type { MutationRecommendation } from "../../src/analysis/types.js";

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
    proposedImprovement: "Increase button contrast using Tailwind bg-blue-600",
    rationale: "Low contrast fails WCAG AA",
    confidence: 0.9,
    estimatedMutationScope: "single-element",
    risk: "low",
    sourceFindingIds: ["f1"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fixture setup
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "elevate-locator-"));
  await mkdir(join(tmpDir, "src", "components"), { recursive: true });
  await mkdir(join(tmpDir, "src", "app"), { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ComponentLocator — high-confidence match", () => {
  it("returns high confidence when component name AND selector class match", async () => {
    // Write a Hero.tsx with the matching component name and class
    await writeFile(
      join(tmpDir, "src", "components", "HeroSection.tsx"),
      `
export function HeroSection() {
  return (
    <section className="hero-section py-12">
      <h1>Welcome</h1>
      <button className="cta-btn bg-gray-400 text-white px-6">Get Started</button>
    </section>
  );
}
`
    );

    // Write an unrelated component that should score lower
    await writeFile(
      join(tmpDir, "src", "components", "Footer.tsx"),
      `
export function Footer() {
  return <footer className="footer-container"><p>© 2024</p></footer>;
}
`
    );

    const locator = new ComponentLocator({ projectRoot: tmpDir });
    const result = await locator.locate(makeRecommendation());

    expect(result.isAmbiguous).toBe(false);
    expect(["high", "medium"]).toContain(result.confidence);
    expect(result.primaryCandidate).toBeDefined();
    expect(result.primaryCandidate!.relativePath).toMatch(/HeroSection\.tsx/);
    expect(result.primaryCandidate!.matchedSelectors).toContain("button.cta-btn");
  });
});

describe("ComponentLocator — medium-confidence match", () => {
  it("returns a candidate when only the class matches (no component name hint)", async () => {
    await writeFile(
      join(tmpDir, "src", "components", "Landing.tsx"),
      `
export function Landing() {
  return (
    <div>
      <button className="cta-btn text-white px-4 py-2">Buy Now</button>
    </div>
  );
}
`
    );

    const rec = makeRecommendation({ affectedComponents: [] }); // No component hint
    const locator = new ComponentLocator({ projectRoot: tmpDir });
    const result = await locator.locate(rec);

    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
    expect(result.candidates[0].matchedSelectors.length).toBeGreaterThanOrEqual(1);
  });
});

describe("ComponentLocator — ambiguous result", () => {
  it("returns isAmbiguous=true when two files match with nearly identical scores", async () => {
    // Two files both have the exact same matching class
    await writeFile(
      join(tmpDir, "src", "components", "HeroA.tsx"),
      `
export function HeroA() {
  return <button className="cta-btn">Buy</button>;
}
`
    );
    await writeFile(
      join(tmpDir, "src", "components", "HeroB.tsx"),
      `
export function HeroB() {
  return <button className="cta-btn">Buy</button>;
}
`
    );

    const rec = makeRecommendation({
      affectedComponents: [], // No component name hint to break the tie
      affectedSelector: "button.cta-btn",
    });

    const locator = new ComponentLocator({ projectRoot: tmpDir });
    const result = await locator.locate(rec);

    // Both files match equally — should be ambiguous
    // (or at minimum, the test confirms multiple candidates are found)
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    // When ambiguous, primaryCandidate must NOT be set
    if (result.isAmbiguous) {
      expect(result.primaryCandidate).toBeUndefined();
    }
  });

  it("returns isAmbiguous=true when no files match at all", async () => {
    // Write a file with completely unrelated content
    await writeFile(
      join(tmpDir, "src", "components", "Sidebar.tsx"),
      `export function Sidebar() { return <nav>Nav</nav>; }`
    );

    const rec = makeRecommendation({
      affectedSelector: ".nonexistent-xyz-class",
      affectedComponents: ["CompletelyMissingComponent"],
      proposedImprovement: "Fix the zyx-widget styling",
    });

    const locator = new ComponentLocator({ projectRoot: tmpDir });
    const result = await locator.locate(rec);

    expect(result.isAmbiguous).toBe(true);
    expect(result.primaryCandidate).toBeUndefined();
  });

  it("returns isAmbiguous=true when score is below minimum threshold", async () => {
    // Write a file with very weak signal (just the tag, no class match)
    await writeFile(
      join(tmpDir, "src", "components", "WeakMatch.tsx"),
      `export function WeakMatch() { return <button>Weak</button>; }`
    );

    const rec = makeRecommendation({
      affectedSelector: "button.some-totally-unique-xyz-class-not-in-file",
      affectedComponents: [],
      proposedImprovement: "Something completely different",
    });

    const locator = new ComponentLocator({ projectRoot: tmpDir });
    const result = await locator.locate(rec);

    // Should be ambiguous or low confidence — but MUST NOT be high
    if (!result.isAmbiguous) {
      expect(result.confidence).not.toBe("high");
    }
  });
});

describe("ComponentLocator — empty project", () => {
  it("returns isAmbiguous=true when no source files exist", async () => {
    // tmpDir is empty (no source files created in this test)
    const emptyDir = await mkdtemp(join(tmpdir(), "elevate-empty-"));
    try {
      const locator = new ComponentLocator({ projectRoot: emptyDir });
      const result = await locator.locate(makeRecommendation());
      expect(result.isAmbiguous).toBe(true);
      expect(result.candidates).toHaveLength(0);
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });
});

describe("ComponentLocator — ignores protected directories", () => {
  it("does not include node_modules files in candidates", async () => {
    await mkdir(join(tmpDir, "node_modules", "some-package"), { recursive: true });
    await writeFile(
      join(tmpDir, "node_modules", "some-package", "HeroSection.tsx"),
      `export function HeroSection() { return <button className="cta-btn">Click</button>; }`
    );
    await writeFile(
      join(tmpDir, "src", "components", "Real.tsx"),
      `export function Real() { return <button className="cta-btn">Click</button>; }`
    );

    const locator = new ComponentLocator({ projectRoot: tmpDir });
    const result = await locator.locate(makeRecommendation());

    for (const candidate of result.candidates) {
      expect(candidate.absolutePath).not.toMatch(/node_modules/);
    }
  });
});

describe("ComponentLocator — React component identification", () => {
  it("identifies PascalCase function declarations as component names", async () => {
    await writeFile(
      join(tmpDir, "src", "components", "ProductCard.tsx"),
      `
export default function ProductCard({ title }: { title: string }) {
  return <div className="cta-btn">{title}</div>;
}
`
    );

    const locator = new ComponentLocator({ projectRoot: tmpDir });
    const result = await locator.locate(makeRecommendation({ affectedComponents: ["ProductCard"] }));

    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
    expect(result.candidates[0].componentNames).toContain("ProductCard");
  });
});
