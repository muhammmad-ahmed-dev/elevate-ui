/**
 * Phase 4A: Report Renderer Tests
 */

import { describe, it, expect } from "vitest";
import { renderHtmlReport, renderJsonReport, escapeHtml, renderDiffHtml } from "../../src/reports/renderer.js";
import type { ReportModel } from "../../src/reports/types.js";

const sampleModel: ReportModel = {
  reportId: "rep-test-001",
  reportType: "multi-pass",
  targetUrl: "http://localhost:3000",
  timestamp: "2026-08-24T12:00:00.000Z",
  durationMs: 4500,
  executiveSummary: {
    status: "SUCCESS",
    decision: "ACCEPT",
    passesExecuted: 2,
    passesAccepted: 2,
    passesRolledBack: 0,
    stoppingReason: "MAX_PASSES_REACHED",
    totalFindingsBefore: 3,
    totalFindingsAfter: 1,
    criticalFindingsBefore: 1,
    criticalFindingsAfter: 0,
    seriousFindingsBefore: 2,
    seriousFindingsAfter: 1,
    resolvedFindingsCount: 2,
    recommendationsConsidered: 2,
    recommendationsAccepted: 2,
  },
  viewports: [
    { viewport: "desktop", label: "Desktop (1440px)", width: 1440, height: 900 },
  ],
  findingsBaseline: [
    {
      id: "f1",
      category: "color-contrast",
      severity: "critical",
      title: "Contrast failure",
      description: "Text is unreadable",
      evidence: {},
      selector: "button.primary",
      viewport: "desktop",
      source: "deterministic",
      deterministic: true,
      confidence: 1.0,
    },
  ],
  findingsFinal: [
    {
      id: "f2",
      category: "typography",
      severity: "minor",
      title: "Line length too wide",
      description: "Consider max-w-prose",
      evidence: {},
      selector: "p.intro",
      viewport: "desktop",
      source: "heuristic",
      deterministic: false,
      confidence: 0.8,
    },
  ],
  recommendations: [
    {
      id: "rec1",
      problem: "Contrast failure",
      evidence: {},
      affectedSelector: "button.primary",
      affectedViewports: ["desktop"],
      proposedImprovement: "Update text color to white",
      rationale: "Fix WCAG AA",
      confidence: 0.95,
      estimatedMutationScope: "single-element",
      risk: "low",
      sourceFindingIds: ["f1"],
    },
  ],
  passHistory: [
    {
      passNumber: 1,
      recommendationId: "rec1",
      recommendationProblem: "Contrast failure",
      recommendationAction: "Update text color to white",
      affectedSelector: "button.primary",
      status: "SUCCESS",
      decision: "ACCEPT",
      filesTouched: ["src/Button.tsx"],
      additions: 2,
      deletions: 1,
      rawDiff: "diff --git a/src/Button.tsx b/src/Button.tsx\n-text-gray-300\n+text-white font-bold",
      pathGuardValid: true,
      scopeGuardValid: true,
      astGuardValid: true,
      hardGatesPassed: true,
      hardGates: [{ name: "TypeScript", passed: true, output: "OK", durationMs: 50 }],
      targetedIssueImproved: true,
      newCriticalFindings: 0,
      newSeriousFindings: 0,
      resolvedFindingsCount: 1,
      durationMs: 2200,
      summary: "Pass 1 accepted",
      rollbackOccurred: false,
    },
  ],
  verificationGates: [{ name: "TypeScript", passed: true, output: "OK", durationMs: 50, mandatory: true }],
  generatorMetadata: {
    version: "0.1.0",
    generatedAt: "2026-08-24T12:00:00.000Z",
    environment: "Node.js",
  },
};

describe("Phase 4A: Report Renderer", () => {
  it("escapes HTML characters to prevent XSS", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe("&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;");
  });

  it("colorizes unified diff lines", () => {
    const rawDiff = "@@ -1,3 +1,3 @@\n-old line\n+new line\n context line";
    const rendered = renderDiffHtml(rawDiff);

    expect(rendered).toContain("diff-hunk");
    expect(rendered).toContain("diff-del");
    expect(rendered).toContain("diff-add");
    expect(rendered).toContain("diff-ctx");
  });

  it("renders valid HTML report with all required sections", () => {
    const html = renderHtmlReport(sampleModel);

    // Basic structure
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html lang=\"en\">");
    expect(html).toContain("Elevate Visual Refinement Report");
    expect(html).toContain("http://localhost:3000");

    // Executive Summary
    expect(html).toContain("Run Outcome");
    expect(html).toContain("Passes Executed");
    expect(html).toContain("Findings Resolved");

    // Visual Comparison
    expect(html).toContain("Visual Comparison Across Viewports");
    expect(html).toContain("Desktop (1440px)");

    // Findings
    expect(html).toContain("Audit Findings (1)");
    expect(html).toContain("Line length too wide");

    // Recommendations
    expect(html).toContain("Synthesized Recommendations (1)");
    expect(html).toContain("rec1");

    // Mutation Pass History
    expect(html).toContain("Mutation Pass History (1)");
    expect(html).toContain("Pass 1: rec1");
    expect(html).toContain("diff-add");
  });

  it("renders valid JSON report", () => {
    const json = renderJsonReport(sampleModel);
    const parsed = JSON.parse(json);

    expect(parsed.reportId).toBe("rep-test-001");
    expect(parsed.executiveSummary.passesAccepted).toBe(2);
    expect(parsed.findingsFinal).toHaveLength(1);
  });
});
