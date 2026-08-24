/**
 * Phase 3G: Bounded Multi-Pass Improve Loop Unit & Convergence Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMultiPassImproveLoop } from "../../../src/agent/improve/loop.js";
import { computeRecommendationFingerprint, RecommendationHistoryTracker } from "../../../src/agent/improve/history.js";
import { ProgressEvaluator } from "../../../src/agent/improve/progress.js";
import * as auditModule from "../../../src/cli/commands/audit.js";
import type { AnalysisResult, MutationRecommendation, Finding } from "../../../src/analysis/types.js";

let testProjectRoot: string;

const HERO_COMPONENT_SOURCE = `export function HeroSection() {
  return (
    <section className="hero-section py-12">
      <button className="cta-btn bg-gray-400 text-white px-6">Get Started</button>
    </section>
  );
}`;

async function setupHeroComponent(root: string) {
  const compDir = join(root, "src", "components");
  await mkdir(compDir, { recursive: true });
  await writeFile(join(compDir, "HeroSection.tsx"), HERO_COMPONENT_SOURCE, "utf8");
}

beforeEach(async () => {
  testProjectRoot = await mkdtemp(join(tmpdir(), "elevate-loop-test-"));
  await setupHeroComponent(testProjectRoot);
});

afterEach(async () => {
  vi.restoreAllMocks();
  try {
    await rm(testProjectRoot, { recursive: true, force: true });
  } catch {
    // Ignore cleanup error
  }
});

const sampleRec1: MutationRecommendation = {
  id: "rec-btn-1",
  problem: "Low button contrast",
  evidence: { selector: "button.cta-btn" },
  affectedSelector: "button.cta-btn",
  affectedViewports: ["desktop"],
  proposedImprovement: "Increase button contrast",
  rationale: "WCAG AA",
  confidence: 0.9,
  estimatedMutationScope: "single-element",
  risk: "low",
  sourceFindingIds: ["f1"],
};

const sampleRec2: MutationRecommendation = {
  id: "rec-card-2",
  problem: "Card overflow on mobile",
  evidence: { selector: ".feature-card" },
  affectedSelector: ".feature-card",
  affectedViewports: ["mobile"],
  proposedImprovement: "Wrap card contents responsively",
  rationale: "Responsive integrity",
  confidence: 0.85,
  estimatedMutationScope: "component",
  risk: "low",
  sourceFindingIds: ["f2"],
};

describe("Phase 3G: Recommendation Fingerprinting & History Tracker", () => {
  it("computes deterministic fingerprints for recommendations", () => {
    const fp1 = computeRecommendationFingerprint(sampleRec1);
    const fp2 = computeRecommendationFingerprint(sampleRec1);
    expect(fp1).toBe(fp2);
    expect(typeof fp1).toBe("string");
    expect(fp1.length).toBe(16);

    const fpCard = computeRecommendationFingerprint(sampleRec2);
    expect(fpCard).not.toBe(fp1);
  });

  it("excludes already attempted recommendations", () => {
    const tracker = new RecommendationHistoryTracker();
    expect(tracker.isAttempted(sampleRec1)).toBe(false);

    tracker.recordAttempt(sampleRec1, 1);
    expect(tracker.isAttempted(sampleRec1)).toBe(true);

    const filtered = tracker.filterCandidates([sampleRec1, sampleRec2]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("rec-card-2");
  });

  it("detects repeated recommendations with different IDs but identical fingerprints", () => {
    const tracker = new RecommendationHistoryTracker();
    tracker.recordAttempt(sampleRec1, 1);

    const cloneWithNewId: MutationRecommendation = {
      ...sampleRec1,
      id: "rec-btn-1-clone",
    };

    expect(tracker.isRepeated(cloneWithNewId)).toBe(true);
  });
});

describe("Phase 3G: Progress Evaluator", () => {
  it("detects measurable improvement when finding counts reduce and no regressions exist", () => {
    const before: Finding[] = [
      {
        id: "f1",
        category: "color-contrast",
        severity: "serious",
        title: "Low contrast",
        description: "Contrast insufficient",
        evidence: {},
        viewport: "desktop",
        source: "deterministic",
        deterministic: true,
        confidence: 1.0,
      },
    ];
    const after: Finding[] = [];

    const result = ProgressEvaluator.evaluate(sampleRec1, before, after);
    expect(result.improved).toBe(true);
    expect(result.regressions).toBe(0);
    expect(result.resolved).toBe(1);
  });

  it("flags failure when regressions are detected", () => {
    const before: Finding[] = [];
    const after: Finding[] = [];

    const mockVerifyResult: any = {
      comparison: {
        regression: {
          newCriticalFindings: 1,
          newSeriousFindings: 0,
          targetedIssueImproved: true,
        },
      },
    };

    const result = ProgressEvaluator.evaluate(sampleRec1, before, after, mockVerifyResult);
    expect(result.improved).toBe(false);
    expect(result.regressions).toBe(1);
  });
});

describe("Phase 3G: MultiPassImproveEngine Parameter & Boundary Validation", () => {
  it("rejects max-passes = 0 with descriptive error (Scenario D)", async () => {
    const result = await runMultiPassImproveLoop({
      targetUrl: "http://localhost:3000",
      projectRoot: testProjectRoot,
      maxPasses: 0,
    });

    expect(result.finalStatus).toBe("ERROR");
    expect(result.stoppingReason).toBe("SAFETY_ERROR");
    expect(result.summary).toContain("max-passes must be an integer >= 1");
  });

  it("rejects negative max-passes (Scenario E)", async () => {
    const result = await runMultiPassImproveLoop({
      targetUrl: "http://localhost:3000",
      projectRoot: testProjectRoot,
      maxPasses: -3,
    });

    expect(result.finalStatus).toBe("ERROR");
    expect(result.stoppingReason).toBe("SAFETY_ERROR");
  });

  it("rejects max-passes above safety ceiling (Scenario C)", async () => {
    const result = await runMultiPassImproveLoop({
      targetUrl: "http://localhost:3000",
      projectRoot: testProjectRoot,
      maxPasses: 25,
      maxAllowedPasses: 10,
    });

    expect(result.finalStatus).toBe("ERROR");
    expect(result.stoppingReason).toBe("SAFETY_ERROR");
    expect(result.summary).toContain("exceeds maximum safety ceiling");
  });

  it("stops immediately when baseline has no actionable recommendations (Scenario F)", async () => {
    const mockAudit: AnalysisResult = {
      runMetadata: { timestamp: Date.now(), targetUrl: "http://localhost:3000", durationMs: 50 },
      viewportMetadata: ["desktop"],
      deterministicFindings: [],
      heuristicFindings: [],
      normalizedFindings: [],
      deduplicatedFindings: [],
      prioritizedFindings: [],
      recommendations: [],
      errors: [],
    };
    vi.spyOn(auditModule, "runAuditPipeline").mockResolvedValue(mockAudit);

    const result = await runMultiPassImproveLoop({
      targetUrl: "http://localhost:3000",
      projectRoot: testProjectRoot,
      maxPasses: 3,
    });

    expect(result.stoppingReason).toBe("NO_ACTIONABLE_IMPROVEMENTS");
    expect(result.passesExecuted).toBe(0);
    expect(result.finalStatus).toBe("NO_ACTIONABLE_IMPROVEMENT");
  });

  it("handles dry-run mode safely across passes without disk mutation (Scenario U)", async () => {
    const mockAudit: AnalysisResult = {
      runMetadata: { timestamp: Date.now(), targetUrl: "http://localhost:3000", durationMs: 50 },
      viewportMetadata: ["desktop"],
      deterministicFindings: [],
      heuristicFindings: [],
      normalizedFindings: [],
      deduplicatedFindings: [],
      prioritizedFindings: [],
      recommendations: [sampleRec1],
      errors: [],
    };
    vi.spyOn(auditModule, "runAuditPipeline").mockResolvedValue(mockAudit);

    const result = await runMultiPassImproveLoop({
      targetUrl: "http://localhost:3000",
      projectRoot: testProjectRoot,
      maxPasses: 2,
      dryRun: true,
      patchProvider: "mock",
      mockPatchScenario: "valid_single_file",
    });

    expect(result.finalStatus).toBe("DRY_RUN");
    expect(result.stoppingReason).toBe("DRY_RUN_COMPLETED");
    expect(result.passesExecuted).toBe(1);
    expect(result.passesAccepted).toBe(1); // Conceptually validated
  });

  it("terminates with USER_CANCELLED when user denies interactive approval (Scenario T)", async () => {
    const mockAudit: AnalysisResult = {
      runMetadata: { timestamp: Date.now(), targetUrl: "http://localhost:3000", durationMs: 50 },
      viewportMetadata: ["desktop"],
      deterministicFindings: [],
      heuristicFindings: [],
      normalizedFindings: [],
      deduplicatedFindings: [],
      prioritizedFindings: [],
      recommendations: [sampleRec1],
      errors: [],
    };
    vi.spyOn(auditModule, "runAuditPipeline").mockResolvedValue(mockAudit);

    const result = await runMultiPassImproveLoop({
      targetUrl: "http://localhost:3000",
      projectRoot: testProjectRoot,
      maxPasses: 2,
      autoApprove: false,
      approvalPrompt: async () => false, // User denies approval
      patchProvider: "mock",
      mockPatchScenario: "valid_single_file",
    });

    expect(result.finalStatus).toBe("CANCELLED");
    expect(result.stoppingReason).toBe("USER_CANCELLED");
    expect(result.passesExecuted).toBe(1);
    expect(result.passesAccepted).toBe(0);
  });
});
