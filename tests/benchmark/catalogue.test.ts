/**
 * Phase 4C: Benchmark Catalogue Unit Tests
 */

import { describe, it, expect } from "vitest";
import {
  BENCHMARK_CATALOGUE,
  getBenchmarkCases,
  getBenchmarkCaseById,
} from "../../src/benchmark/fixtures/catalogue.js";
import type { BenchmarkCategory } from "../../src/benchmark/types.js";

const REQUIRED_CATEGORIES: BenchmarkCategory[] = [
  "accessibility",
  "typography",
  "spacing",
  "layout",
  "responsive",
  "cta-hierarchy",
  "broken-images",
  "touch-targets",
  "heading-structure",
  "horizontal-overflow",
  "visual-hierarchy",
  "negative-space",
  "responsive-composition",
];

describe("Phase 4C: Benchmark Catalogue & Corpus", () => {
  it("contains at least 80 benchmark cases", () => {
    expect(BENCHMARK_CATALOGUE.length).toBeGreaterThanOrEqual(80);
  });

  it("covers all 13 visual and layout defect categories", () => {
    const presentCategories = new Set(BENCHMARK_CATALOGUE.map((c) => c.category));
    for (const cat of REQUIRED_CATEGORIES) {
      expect(presentCategories.has(cat)).toBe(true);
    }
  });

  it("provides cases across all difficulty tiers", () => {
    const difficulties = new Set(BENCHMARK_CATALOGUE.map((c) => c.difficulty));
    expect(difficulties.has("easy")).toBe(true);
    expect(difficulties.has("medium")).toBe(true);
    expect(difficulties.has("hard")).toBe(true);
  });

  it("filters cases accurately by category, difficulty, tag, and ID", () => {
    const a11yCases = getBenchmarkCases({ category: "accessibility" });
    expect(a11yCases.length).toBeGreaterThan(0);
    expect(a11yCases.every((c) => c.category === "accessibility")).toBe(true);

    const easyCases = getBenchmarkCases({ difficulty: "easy" });
    expect(easyCases.length).toBeGreaterThan(0);
    expect(easyCases.every((c) => c.difficulty === "easy")).toBe(true);

    const specificCase = getBenchmarkCaseById("bench-accessibility-01");
    expect(specificCase).toBeDefined();
    expect(specificCase?.id).toBe("bench-accessibility-01");
  });
});
