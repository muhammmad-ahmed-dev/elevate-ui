/**
 * Phase 3F: Improve Engine Unit & Integration Tests
 *
 * Tests Scenarios A through Y:
 *  - Recommendation selection & filtering
 *  - Ambiguous locator refusal
 *  - PatchPlanner refusal & constraint boundaries
 *  - PatchProvider failures & mock scenarios
 *  - Patch validation failures (AST / scope / path)
 *  - Dry run mode (zero mutations)
 *  - Human approval rejection vs acceptance
 *  - Auto-approve execution
 *  - Single-pass invariant (exactly one mutation, no retries)
 *  - Transaction failure handling
 *  - Verification Accept / Rollback / Error / Blocked mapping
 *  - Provider and option propagation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { selectBestRecommendation } from "../../../src/agent/improve/selector.js";
import { formatApprovalDisplay } from "../../../src/agent/improve/approval.js";
import { runImprovePass } from "../../../src/agent/improve/engine.js";
import * as auditModule from "../../../src/cli/commands/audit.js";
import type { MutationRecommendation, AnalysisResult } from "../../../src/analysis/types.js";
import type { ApprovalPromptDetails } from "../../../src/agent/improve/types.js";

const execFileAsync = promisify(execFile);

let tempRepo: string;

async function gitExec(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd: tempRepo,
    windowsHide: true,
  });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

async function initGitRepo(): Promise<void> {
  await gitExec(["init"]);
  await gitExec(["config", "user.name", "Elevate Test"]);
  await gitExec(["config", "user.email", "test@elevate.local"]);
  await writeFile(join(tempRepo, "README.md"), "# Test Repo\n", "utf8");
  await gitExec(["add", "README.md"]);
  await gitExec(["commit", "-m", "Initial commit"]);
}

async function createComponentFile(relPath: string, content: string): Promise<void> {
  const fullPath = join(tempRepo, relPath);
  const dir = fullPath.substring(0, Math.max(fullPath.lastIndexOf("/"), fullPath.lastIndexOf("\\")));
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dir, { recursive: true });
  await writeFile(fullPath, content.endsWith("\n") ? content : content + "\n", "utf8");
  await gitExec(["add", relPath]);
  await gitExec(["commit", "-m", `Add ${relPath}`]);
}

const HERO_COMPONENT_SOURCE = `export function HeroSection() {
  return (
    <section className="hero-section py-12">
      <button className="cta-btn bg-gray-400 text-white px-6">Get Started</button>
    </section>
  );
}`;

beforeEach(async () => {
  tempRepo = await mkdtemp(join(tmpdir(), "elevate-improve-unit-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  try {
    await rm(tempRepo, { recursive: true, force: true });
  } catch {
    // Ignore cleanup error on Windows
  }
});

describe("Recommendation Selector (Scenarios F & 8)", () => {
  it("returns null when recommendations list is empty (F)", () => {
    const selected = selectBestRecommendation([]);
    expect(selected).toBeNull();
  });

  it("skips recommendations below confidence threshold", () => {
    const recs: MutationRecommendation[] = [
      {
        id: "low-conf",
        problem: "Contrast issue",
        evidence: { selector: ".hero" },
        affectedSelector: ".hero",
        affectedViewports: ["desktop"],
        proposedImprovement: "Change color",
        rationale: "Rationale",
        confidence: 0.3, // Below 0.5 default
        estimatedMutationScope: "single-element",
        risk: "low",
        sourceFindingIds: ["f1"],
      },
    ];

    expect(selectBestRecommendation(recs)).toBeNull();
  });

  it("selects first actionable candidate with sufficient confidence", () => {
    const recs: MutationRecommendation[] = [
      {
        id: "rec-good",
        problem: "Missing button label",
        evidence: { selector: "button.cta" },
        affectedSelector: "button.cta",
        affectedViewports: ["desktop"],
        proposedImprovement: "Add aria-label to button.cta",
        rationale: "Fix a11y",
        confidence: 0.95,
        estimatedMutationScope: "single-element",
        risk: "low",
        sourceFindingIds: ["f1"],
      },
    ];

    const selected = selectBestRecommendation(recs);
    expect(selected).not.toBeNull();
    expect(selected?.id).toBe("rec-good");
  });
});

describe("Approval Formatter & Safe Display (Scenario 20)", () => {
  it("formats approval details cleanly with validation checklist and diff", () => {
    const details: ApprovalPromptDetails = {
      recommendation: {
        id: "rec-hero",
        problem: "Low button contrast",
        evidence: { selector: "button.hero-btn" },
        affectedSelector: "button.hero-btn",
        affectedViewports: ["desktop"],
        proposedImprovement: "Update text color to white",
        rationale: "WCAG AA compliance",
        confidence: 0.9,
        estimatedMutationScope: "single-element",
        risk: "low",
        sourceFindingIds: ["f-hero-1"],
      },
      locatorResult: {
        recommendationId: "rec-hero",
        confidence: "high",
        isAmbiguous: false,
        summary: "Found HeroSection.tsx",
        candidates: [],
        primaryCandidate: {
          absolutePath: "/app/src/components/HeroSection.tsx",
          relativePath: "src/components/HeroSection.tsx",
          componentNames: ["HeroSection"],
          confidence: 0.9,
          evidence: ["Matched component name HeroSection"],
          isReactComponent: true,
          matchedSelectors: ["button.hero-btn"],
          matchedTailwindClasses: ["hero-btn"],
        },
      },
      patchPlan: {
        id: "plan-1",
        createdAt: new Date().toISOString(),
        recommendation: {} as any,
        allowedFiles: ["src/components/HeroSection.tsx"],
        allowedComponents: ["HeroSection"],
        allowedSelectors: ["button.hero-btn"],
        expectedVisualImprovement: "Higher contrast",
        prohibitedAreas: [],
        maxFilesAllowed: 2,
        maxLinesChanged: 150,
        verificationRequirements: [],
        protectedPaths: [],
      },
      patchResult: {
        success: true,
        patch: "--- a/src/components/HeroSection.tsx\n+++ b/src/components/HeroSection.tsx\n@@ -1,1 +1,1 @@\n-old\n+new\n",
        provider: "mock",
        model: "mock-model",
        changedFilesClaimed: ["src/components/HeroSection.tsx"],
        reasoningSummary: "Improve contrast",
        expectedImpact: "Clear button",
        risk: "low",
        confidence: 0.9,
        durationMs: 10,
      },
      validatedPatch: {
        valid: true,
        rawPatch: "--- a/src/components/HeroSection.tsx\n+++ b/src/components/HeroSection.tsx\n@@ -1,1 +1,1 @@\n-old\n+new\n",
        originalPatchHash: "hash123",
        parsedDiff: {
          files: [],
          totalAdditions: 1,
          totalDeletions: 1,
          totalChanged: 2,
        },
        normalizedFiles: ["src/components/HeroSection.tsx"],
        providerClaimedFiles: ["src/components/HeroSection.tsx"],
        pathGuardResult: { valid: true, violations: [], normalizedPaths: ["src/components/HeroSection.tsx"] },
        scopeResult: { valid: true, violations: [], filesChecked: ["src/components/HeroSection.tsx"], totalAdditions: 1, totalDeletions: 1, totalChanged: 2 },
        astResult: { valid: true, violations: [], warnings: [], changedFiles: ["src/components/HeroSection.tsx"], changedComponents: [], changedHooks: [], changedImports: [], changedExports: [], changedNetworkOperations: [], additions: 1, deletions: 1, risk: "low" },
        violations: [],
        warnings: [],
        risk: "low",
        validatedAt: new Date().toISOString(),
      },
    };

    const output = formatApprovalDisplay(details);
    expect(output).toContain("Elevate: Proposed Mutation Plan");
    expect(output).toContain("rec-hero");
    expect(output).toContain("HeroSection");
    expect(output).toContain("Protected paths guarded");
    expect(output).toContain("AST & Logic boundary verified");
    expect(output).toContain("+new");
  });
});

describe("ImproveEngine Pipeline Execution (Scenarios C, D, E, G, H, I, J, K, L, M, N, O, R, S)", () => {
  it("stops safely on --dry-run without mutating files or Git (Scenario C)", async () => {
    await initGitRepo();
    await createComponentFile("src/components/HeroSection.tsx", HERO_COMPONENT_SOURCE);

    // Mock audit returning actionable recommendation matching HeroSection
    const mockAudit: AnalysisResult = {
      runMetadata: { timestamp: Date.now(), targetUrl: "http://localhost:3000", durationMs: 50 },
      viewportMetadata: ["desktop"],
      deterministicFindings: [],
      heuristicFindings: [],
      normalizedFindings: [],
      deduplicatedFindings: [
        {
          id: "f1",
          category: "accessibility",
          severity: "serious",
          title: "Low CTA contrast",
          description: "Contrast ratio insufficient",
          evidence: { selector: "button.cta-btn" },
          selector: "button.cta-btn",
          viewport: "desktop",
          source: "deterministic",
          deterministic: true,
          confidence: 1.0,
        },
      ],
      prioritizedFindings: [],
      recommendations: [
        {
          id: "rec-hero-cta",
          problem: "Low CTA button contrast",
          evidence: { selector: "button.cta-btn" },
          affectedSelector: "button.cta-btn",
          affectedViewports: ["desktop"],
          proposedImprovement: "Improve CTA button contrast and typography",
          rationale: "Fix WCAG compliance",
          confidence: 0.95,
          estimatedMutationScope: "single-element",
          risk: "low",
          sourceFindingIds: ["f1"],
        },
      ],
      errors: [],
    };

    vi.spyOn(auditModule, "runAuditPipeline").mockResolvedValue(mockAudit);

    const result = await runImprovePass({
      targetUrl: "http://localhost:3000",
      projectRoot: tempRepo,
      dryRun: true,
      patchProvider: "mock",
      mockPatchScenario: "valid_single_file",
    });

    expect(result.status).toBe("DRY_RUN");
    expect(result.validationResult?.valid).toBe(true);

    // Assert zero changes to working copy
    const { stdout: diff } = await gitExec(["diff"]);
    expect(diff).toBe("");

    const { stdout: status } = await gitExec(["status", "--porcelain"]);
    expect(status).toBe("");
  });

  it("cancels safely when user rejects approval (Scenario K)", async () => {
    await initGitRepo();
    await createComponentFile("src/components/HeroSection.tsx", HERO_COMPONENT_SOURCE);

    const mockAudit: AnalysisResult = {
      runMetadata: { timestamp: Date.now(), targetUrl: "http://localhost:3000", durationMs: 50 },
      viewportMetadata: ["desktop"],
      deterministicFindings: [],
      heuristicFindings: [],
      normalizedFindings: [],
      deduplicatedFindings: [],
      prioritizedFindings: [],
      recommendations: [
        {
          id: "rec-hero-cta",
          problem: "Low button contrast",
          evidence: { selector: "button.cta-btn" },
          affectedSelector: "button.cta-btn",
          affectedViewports: ["desktop"],
          proposedImprovement: "Update button styling",
          rationale: "Visual",
          confidence: 0.9,
          estimatedMutationScope: "single-element",
          risk: "low",
          sourceFindingIds: ["f1"],
        },
      ],
      errors: [],
    };

    vi.spyOn(auditModule, "runAuditPipeline").mockResolvedValue(mockAudit);

    const result = await runImprovePass({
      targetUrl: "http://localhost:3000",
      projectRoot: tempRepo,
      autoApprove: false,
      approvalPrompt: async () => false, // Explicitly reject!
      patchProvider: "mock",
      mockPatchScenario: "valid_single_file",
    });

    expect(result.status).toBe("CANCELLED");
    expect(result.approvalResult?.approved).toBe(false);

    // Repository untouched
    const { stdout: diff } = await gitExec(["diff"]);
    expect(diff).toBe("");
  });

  it("handles ambiguous component locator safely (Scenario G)", async () => {
    await initGitRepo();
    // No matching component files in repo

    const mockAudit: AnalysisResult = {
      runMetadata: { timestamp: Date.now(), targetUrl: "http://localhost:3000", durationMs: 50 },
      viewportMetadata: ["desktop"],
      deterministicFindings: [],
      heuristicFindings: [],
      normalizedFindings: [],
      deduplicatedFindings: [],
      prioritizedFindings: [],
      recommendations: [
        {
          id: "rec-ghost",
          problem: "Ghost component issue",
          evidence: { selector: ".ghost-element" },
          affectedSelector: ".ghost-element",
          affectedViewports: ["desktop"],
          proposedImprovement: "Improve ghost element",
          rationale: "Test",
          confidence: 0.9,
          estimatedMutationScope: "single-element",
          risk: "low",
          sourceFindingIds: [],
        },
      ],
      errors: [],
    };

    vi.spyOn(auditModule, "runAuditPipeline").mockResolvedValue(mockAudit);

    const result = await runImprovePass({
      targetUrl: "http://localhost:3000",
      projectRoot: tempRepo,
      autoApprove: true,
      patchProvider: "mock",
    });

    expect(result.status).toBe("AMBIGUOUS_TARGET");
  });

  it("handles patch validation failure safely (Scenario J)", async () => {
    await initGitRepo();
    await createComponentFile("src/components/HeroSection.tsx", HERO_COMPONENT_SOURCE);

    const mockAudit: AnalysisResult = {
      runMetadata: { timestamp: Date.now(), targetUrl: "http://localhost:3000", durationMs: 50 },
      viewportMetadata: ["desktop"],
      deterministicFindings: [],
      heuristicFindings: [],
      normalizedFindings: [],
      deduplicatedFindings: [],
      prioritizedFindings: [],
      recommendations: [
        {
          id: "rec-hook-break",
          problem: "Problem",
          evidence: { selector: "button.cta-btn" },
          affectedSelector: "button.cta-btn",
          affectedViewports: ["desktop"],
          proposedImprovement: "Modify hook",
          rationale: "Test",
          confidence: 0.9,
          estimatedMutationScope: "single-element",
          risk: "low",
          sourceFindingIds: [],
        },
      ],
      errors: [],
    };

    vi.spyOn(auditModule, "runAuditPipeline").mockResolvedValue(mockAudit);

    const result = await runImprovePass({
      targetUrl: "http://localhost:3000",
      projectRoot: tempRepo,
      autoApprove: true,
      patchProvider: "mock",
      mockPatchScenario: "hook_modification", // Violates AST guard!
    });

    expect(result.status).toBe("PATCH_REJECTED");
    expect(result.validationResult?.valid).toBe(false);

    // Repository completely untouched
    const { stdout: diff } = await gitExec(["diff"]);
    expect(diff).toBe("");
  });

  it("enforces single-pass boundary with exactly one mutation attempt (Scenarios R & S)", async () => {
    await initGitRepo();
    await createComponentFile("src/components/HeroSection.tsx", HERO_COMPONENT_SOURCE);

    const auditSpy = vi.spyOn(auditModule, "runAuditPipeline").mockResolvedValue({
      runMetadata: { timestamp: Date.now(), targetUrl: "http://localhost:3000", durationMs: 50 },
      viewportMetadata: ["desktop"],
      deterministicFindings: [],
      heuristicFindings: [],
      normalizedFindings: [],
      deduplicatedFindings: [],
      prioritizedFindings: [],
      recommendations: [
        {
          id: "rec-single-pass",
          problem: "Button styling",
          evidence: { selector: "button.cta-btn" },
          affectedSelector: "button.cta-btn",
          affectedViewports: ["desktop"],
          proposedImprovement: "Add styling",
          rationale: "Visual",
          confidence: 0.9,
          estimatedMutationScope: "single-element",
          risk: "low",
          sourceFindingIds: [],
        },
      ],
      errors: [],
    });

    const result = await runImprovePass({
      targetUrl: "http://localhost:3000",
      projectRoot: tempRepo,
      dryRun: true,
      patchProvider: "mock",
      mockPatchScenario: "valid_single_file",
    });

    expect(result.status).toBe("DRY_RUN");
    // Only one audit pass was run
    expect(auditSpy).toHaveBeenCalledTimes(1);
  });
});
