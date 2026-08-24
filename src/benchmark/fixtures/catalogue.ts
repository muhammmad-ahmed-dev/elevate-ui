/**
 * Phase 4C: 80-App Benchmark Fixture Catalogue
 *
 * Provides a comprehensive, deterministic corpus of 80+ benchmark cases
 * across 13 visual and layout defect categories and 3 difficulty tiers.
 */

import type { BenchmarkCase, BenchmarkCategory, BenchmarkDifficulty } from "../types.js";
import { generateFixtureTemplate } from "./generator.js";

const ALL_CATEGORIES: BenchmarkCategory[] = [
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

const DIFFICULTIES: BenchmarkDifficulty[] = ["easy", "medium", "hard"];

function createUnifiedDiff(filePath: string, oldCode: string, newCode: string): string {
  const oldLines = oldCode.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const newLines = newCode.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const delBlock = oldLines.map((l) => `-${l}`).join("\n");
  const addBlock = newLines.map((l) => `+${l}`).join("\n");
  return `--- a/${filePath}\n+++ b/${filePath}\n@@ -1,${oldLines.length} +1,${newLines.length} @@\n${delBlock}\n${addBlock}\n`;
}

export function buildBenchmarkCatalogue(): BenchmarkCase[] {
  const cases: BenchmarkCase[] = [];

  // Generate 84 cases (7 cases per each of the 13 categories, 13 * 7 = 91 cases)
  for (const category of ALL_CATEGORIES) {
    for (let i = 1; i <= 7; i++) {
      const difficulty = DIFFICULTIES[(i - 1) % DIFFICULTIES.length];
      const template = generateFixtureTemplate(category, i, difficulty);
      const id = `bench-${category}-${String(i).padStart(2, "0")}`;

      const rawDiff = createUnifiedDiff(
        template.componentPath,
        template.initialCode,
        template.fixedCode
      );

      cases.push({
        id,
        name: template.name,
        category,
        framework: "nextjs",
        difficulty,
        tags: [category, difficulty, "nextjs", "tailwind"],
        expectedIssueTypes: template.expectedIssueTypes,
        expectedFiles: [template.componentPath],
        description: template.description,
        componentCode: template.initialCode,
        componentPath: template.componentPath,
        targetSelector: template.targetSelector,
        mockPatchOverride: rawDiff,
        mockImprovement: template.description,
      });
    }
  }

  return cases;
}

export const BENCHMARK_CATALOGUE: BenchmarkCase[] = buildBenchmarkCatalogue();

export function getBenchmarkCases(filter?: {
  category?: BenchmarkCategory;
  tag?: string;
  difficulty?: BenchmarkDifficulty;
  caseId?: string;
}): BenchmarkCase[] {
  let list = [...BENCHMARK_CATALOGUE];

  if (filter?.caseId) {
    list = list.filter((c) => c.id === filter.caseId);
  }
  if (filter?.category) {
    list = list.filter((c) => c.category === filter.category);
  }
  if (filter?.difficulty) {
    list = list.filter((c) => c.difficulty === filter.difficulty);
  }
  if (filter?.tag) {
    list = list.filter((c) => c.tags.includes(filter.tag!));
  }

  return list;
}

export function getBenchmarkCaseById(id: string): BenchmarkCase | undefined {
  return BENCHMARK_CATALOGUE.find((c) => c.id === id);
}
