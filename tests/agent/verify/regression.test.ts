/**
 * Phase 3E: Deterministic Re-Audit & Regression Analysis Tests
 *
 * Tests Scenarios K through Q and Zero-Issue Case:
 *  K. Deterministic re-audit success
 *  L. Deterministic analyzer partial failure handling
 *  M. New critical finding detected as regression
 *  N. New serious finding detected as regression
 *  O. Targeted issue improved
 *  P. Targeted issue unchanged
 *  Q. Targeted issue worsened
 *  20. Zero-issue case (no findings before/after)
 */

import { describe, it, expect } from "vitest";
import type { Finding, MutationRecommendation } from "../../../src/analysis/types.js";
import type { MultiViewportResult, ViewportExtraction } from "../../../src/browser/types.js";
import {
  runDeterministicReaudit,
  compareDeterministicFindings,
  compareTargetedIssue,
  assembleBeforeAfterComparison,
} from "../../../src/agent/patch/verify/regression.js";
import type {
  BrowserVerificationResult,
  VerificationGateResult,
  VisualReanalysisResult,
} from "../../../src/agent/patch/verify/types.js";

function makeFinding(overrides: Partial<Finding>): Finding {
  return {
    id: `finding-${Date.now()}-${Math.random()}`,
    category: "accessibility",
    severity: "serious",
    title: "Missing button name",
    description: "Button has no accessible text",
    evidence: { selector: "button.submit" },
    selector: "button.submit",
    viewport: "desktop",
    source: "deterministic",
    deterministic: true,
    confidence: 1.0,
    ...overrides,
  };
}

function makeRecommendation(overrides: Partial<MutationRecommendation>): MutationRecommendation {
  return {
    id: "rec-1-accessibility",
    problem: "Missing button label: Button has no accessible text",
    evidence: { selector: "button.submit" },
    affectedSelector: "button.submit",
    affectedViewports: ["desktop"],
    proposedImprovement: "Add aria-label or text content to button.submit",
    rationale: "Improves WCAG compliance",
    confidence: 1.0,
    estimatedMutationScope: "single-element",
    risk: "low",
    sourceFindingIds: ["finding-btn-1"],
    ...overrides,
  };
}

describe("Deterministic Re-Audit (Scenarios K & L)", () => {
  it("runs deterministic re-audit against multi-viewport data (K)", async () => {
    const dummyExtraction: ViewportExtraction = {
      viewport: { name: "desktop", width: 1440, height: 900, label: "Desktop (1440px)" },
      screenshotBuffer: Buffer.from("fake-png"),
      screenshotBase64: "ZmFrZS1wbmc=",
      domHtml: "<html><body><button>Submit</button></body></html>",
      elements: [],
      overflowIssues: [],
      title: "Test Page",
      url: "http://localhost:3000",
    };

    const mockCapture: MultiViewportResult = {
      targetUrl: "http://localhost:3000",
      timestamp: Date.now(),
      captures: { desktop: dummyExtraction } as any,
      durationMs: 100,
    };

    const result = await runDeterministicReaudit(mockCapture);
    expect(result.errors).toHaveLength(0);
    expect(Array.isArray(result.findings)).toBe(true);
  });

  it("handles analyzer failure gracefully and returns empty findings with error (L)", async () => {
    const brokenCapture: any = {
      targetUrl: "http://localhost:3000",
      timestamp: Date.now(),
      captures: null, // Causes evaluator to throw
      durationMs: 0,
    };

    const result = await runDeterministicReaudit(brokenCapture);
    expect(result.findings).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("Deterministic Comparison (Scenarios M & N)", () => {
  it("detects new critical findings as regression (M)", () => {
    const before: Finding[] = [
      makeFinding({ id: "f1", category: "spacing", severity: "minor", title: "Tight padding" }),
    ];

    const after: Finding[] = [
      makeFinding({ id: "f1", category: "spacing", severity: "minor", title: "Tight padding" }),
      makeFinding({ id: "f2", category: "accessibility", severity: "critical", title: "Missing form label" }),
    ];

    const comp = compareDeterministicFindings(before, after);
    expect(comp.newFindings).toHaveLength(1);
    expect(comp.newCriticalCount).toBe(1);
    expect(comp.resolvedFindings).toHaveLength(0);
    expect(comp.unchangedFindings).toHaveLength(1);
  });

  it("detects new serious findings as regression (N)", () => {
    const before: Finding[] = [];
    const after: Finding[] = [
      makeFinding({ id: "f-overflow", category: "overflow", severity: "serious", title: "Horizontal overflow" }),
    ];

    const comp = compareDeterministicFindings(before, after);
    expect(comp.newSeriousCount).toBe(1);
    expect(comp.newOverflowCount).toBe(1);
  });

  it("detects resolved findings accurately", () => {
    const before: Finding[] = [
      makeFinding({ id: "f-btn", category: "accessibility", title: "Missing button name" }),
    ];
    const after: Finding[] = [];

    const comp = compareDeterministicFindings(before, after);
    expect(comp.resolvedFindings).toHaveLength(1);
    expect(comp.newFindings).toHaveLength(0);
  });
});

describe("Targeted Issue Comparison (Scenarios O, P, Q)", () => {
  it("determines targeted issue improved when finding is gone (O)", () => {
    const rec = makeRecommendation({ affectedSelector: "button.submit" });

    const before: Finding[] = [
      makeFinding({ id: "f1", selector: "button.submit", severity: "serious", title: "Missing button name" }),
    ];
    const after: Finding[] = []; // Resolved!

    const targeted = compareTargetedIssue(before, after, rec);
    expect(targeted.targetedIssueImproved).toBe(true);
    expect(targeted.targetedIssueDegraded).toBe(false);
    expect(targeted.rationale).toContain("fully resolved");
  });

  it("determines targeted issue improved when severity dropped (O)", () => {
    const rec = makeRecommendation({ affectedSelector: "button.submit" });

    const before: Finding[] = [
      makeFinding({ id: "f1", selector: "button.submit", severity: "critical", title: "Button defect" }),
    ];
    const after: Finding[] = [
      makeFinding({ id: "f1", selector: "button.submit", severity: "minor", title: "Button defect" }),
    ];

    const targeted = compareTargetedIssue(before, after, rec);
    expect(targeted.targetedIssueImproved).toBe(true);
    expect(targeted.targetedIssueDegraded).toBe(false);
  });

  it("determines targeted issue unchanged when same finding remains (P)", () => {
    const rec = makeRecommendation({ affectedSelector: "button.submit" });

    const before: Finding[] = [
      makeFinding({ id: "f1", selector: "button.submit", severity: "serious", title: "Missing label" }),
    ];
    const after: Finding[] = [
      makeFinding({ id: "f1", selector: "button.submit", severity: "serious", title: "Missing label" }),
    ];

    const targeted = compareTargetedIssue(before, after, rec);
    expect(targeted.targetedIssueImproved).toBe(false);
    expect(targeted.targetedIssueDegraded).toBe(false);
    expect(targeted.rationale).toContain("unchanged");
  });

  it("determines targeted issue worsened when severity increased (Q)", () => {
    const rec = makeRecommendation({ affectedSelector: "button.submit" });

    const before: Finding[] = [
      makeFinding({ id: "f1", selector: "button.submit", severity: "minor", title: "Minor issue" }),
    ];
    const after: Finding[] = [
      makeFinding({ id: "f1", selector: "button.submit", severity: "critical", title: "Minor issue" }),
    ];

    const targeted = compareTargetedIssue(before, after, rec);
    expect(targeted.targetedIssueImproved).toBe(false);
    expect(targeted.targetedIssueDegraded).toBe(true);
    expect(targeted.rationale).toContain("worsened");
  });
});

describe("Zero-Issue Case (Requirement 20)", () => {
  it("does not hallucinate improvement when there were 0 issues before and 0 after", () => {
    const rec = makeRecommendation({ id: "rec-clean" });
    const before: Finding[] = [];
    const after: Finding[] = [];

    const targeted = compareTargetedIssue(before, after, rec);
    expect(targeted.targetedIssueImproved).toBe(false);
    expect(targeted.targetedIssueDegraded).toBe(false);
    expect(targeted.rationale).toContain("neutral result");

    const deterministic = compareDeterministicFindings(before, after);
    expect(deterministic.newFindings).toHaveLength(0);
    expect(deterministic.resolvedFindings).toHaveLength(0);
  });
});

describe("Full Regression Summary & Before/After Assembly", () => {
  it("assembles complete comparison model accurately", () => {
    const rec = makeRecommendation({ affectedSelector: "div.hero" });
    const f1 = makeFinding({ id: "f1", selector: "div.hero", severity: "serious", title: "Low contrast" });

    const hardGates: VerificationGateResult[] = [
      { name: "TypeScript", passed: true, output: "ok", durationMs: 100, mandatory: true },
      { name: "Framework Build", passed: true, output: "ok", durationMs: 200, mandatory: true },
    ];

    const browserCheck: BrowserVerificationResult = {
      success: true,
      viewportsCaptured: 3,
      screenshotPaths: ["s1.png", "s2.png", "s3.png"],
      errors: [],
      durationMs: 500,
    };

    const visualResult: VisualReanalysisResult = {
      available: false,
      findings: [],
      errors: [],
      durationMs: 0,
    };

    const comparison = assembleBeforeAfterComparison(
      "tx-123",
      rec,
      [f1],
      [], // f1 resolved
      hardGates,
      browserCheck,
      visualResult
    );

    expect(comparison.transactionId).toBe("tx-123");
    expect(comparison.regression.targetedIssueImproved).toBe(true);
    expect(comparison.regression.hardGatesPassed).toBe(true);
    expect(comparison.regression.newCriticalFindings).toBe(0);
    expect(comparison.regression.anyHardRegression).toBe(false);
  });
});
