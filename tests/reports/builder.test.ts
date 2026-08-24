/**
 * Phase 4A: Report Model Builder Tests
 */

import { describe, it, expect } from "vitest";
import { ReportModelBuilder, sanitizeReportText } from "../../src/reports/builder.js";
import type { AnalysisResult } from "../../src/analysis/types.js";
import type { ImproveRunResult, MultiPassImproveResult } from "../../src/agent/improve/types.js";

describe("Phase 4A: ReportModelBuilder", () => {
  it("sanitizes API keys and secrets from report strings", () => {
    const raw = "Error with api_key=AIzaSyA12345678901234567890123456789012 and sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890";
    const sanitized = sanitizeReportText(raw);

    expect(sanitized).not.toContain("AIzaSyA12345678901234567890123456789012");
    expect(sanitized).not.toContain("sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890");
    expect(sanitized).toContain("[REDACTED_SECRET]");
  });

  it("builds ReportModel from Phase 2 Audit result", () => {
    const mockAudit: AnalysisResult = {
      runMetadata: { timestamp: Date.now(), targetUrl: "http://localhost:3000", durationMs: 150 },
      viewportMetadata: ["desktop"],
      deterministicFindings: [],
      heuristicFindings: [],
      normalizedFindings: [],
      deduplicatedFindings: [
        {
          id: "f1",
          category: "accessibility",
          severity: "critical",
          title: "Missing alt text",
          description: "Image has no alt attribute",
          evidence: {},
          viewport: "desktop",
          source: "deterministic",
          deterministic: true,
          confidence: 1.0,
        },
      ],
      prioritizedFindings: [],
      recommendations: [
        {
          id: "rec1",
          problem: "Missing alt text",
          evidence: {},
          affectedSelector: "img.hero",
          affectedViewports: ["desktop"],
          proposedImprovement: "Add descriptive alt attribute",
          rationale: "WCAG A",
          confidence: 0.9,
          estimatedMutationScope: "single-element",
          risk: "low",
          sourceFindingIds: ["f1"],
        },
      ],
      errors: [],
    };

    const model = ReportModelBuilder.fromAudit(mockAudit);

    expect(model.reportType).toBe("audit");
    expect(model.targetUrl).toBe("http://localhost:3000");
    expect(model.findingsBaseline).toHaveLength(1);
    expect(model.executiveSummary.criticalFindingsBefore).toBe(1);
    expect(model.executiveSummary.totalFindingsBefore).toBe(1);
    expect(model.recommendations).toHaveLength(1);
    expect(model.passHistory).toHaveLength(0);
  });

  it("builds ReportModel from Phase 3F Single-Pass Improve result", () => {
    const mockSinglePass: ImproveRunResult = {
      runId: "run-single-123",
      status: "SUCCESS",
      targetUrl: "http://localhost:3000",
      decision: "ACCEPT",
      durationMs: 3200,
      summary: "Mutation verified and accepted",
      recommendation: {
        id: "rec-cta",
        problem: "Low button contrast",
        evidence: {},
        affectedSelector: "button.cta-btn",
        affectedViewports: ["desktop"],
        proposedImprovement: "Update background color",
        rationale: "WCAG AA",
        confidence: 0.95,
        estimatedMutationScope: "single-element",
        risk: "low",
        sourceFindingIds: ["f1"],
      },
      findingsBefore: [
        {
          id: "f1",
          category: "color-contrast",
          severity: "serious",
          title: "Low button contrast",
          description: "Contrast is 3.1:1",
          evidence: {},
          viewport: "desktop",
          source: "deterministic",
          deterministic: true,
          confidence: 1.0,
        },
      ],
      validationResult: {
        valid: true,
        rawPatch: "diff --git a/Button.tsx b/Button.tsx\n+<button className=\"bg-blue-600\">",
        normalizedFiles: ["Button.tsx"],
        parsedDiff: {
          files: [],
          totalAdditions: 1,
          totalDeletions: 0,
          rawDiff: "",
        },
        pathGuardResult: { valid: true, violations: [] },
        scopeResult: { valid: true, violations: [] },
        astResult: { valid: true, violations: [] },
        violations: [],
      },
      verificationResult: {
        transactionId: "tx-1",
        decision: "ACCEPT",
        decisionRationale: ["Targeted issue improved"],
        durationMs: 2000,
        errors: [],
        comparison: {
          transactionId: "tx-1",
          recommendationId: "rec-cta",
          findingsBefore: [],
          findingsAfter: [],
          hardGates: [{ name: "TypeScript", passed: true, output: "OK", durationMs: 40, mandatory: true }],
          browserResult: { success: true, viewportsCaptured: 3, screenshotPaths: [], errors: [], durationMs: 100 },
          regression: {
            hardGatesPassed: true,
            targetedIssueImproved: true,
            targetedIssueDegraded: false,
            newCriticalFindings: 0,
            newSeriousFindings: 0,
            newAccessibilityFindings: 0,
            newOverflowFindings: 0,
            newBrokenImageFindings: 0,
            newTouchTargetFindings: 0,
            newRuntimeFailures: false,
            visualRegressionDetected: false,
            anyHardRegression: false,
          },
        },
      },
    };

    const model = ReportModelBuilder.fromSinglePass(mockSinglePass);

    expect(model.reportType).toBe("single-pass");
    expect(model.executiveSummary.status).toBe("SUCCESS");
    expect(model.executiveSummary.passesAccepted).toBe(1);
    expect(model.passHistory).toHaveLength(1);
    expect(model.passHistory[0].recommendationId).toBe("rec-cta");
    expect(model.passHistory[0].additions).toBe(1);
  });

  it("builds ReportModel from Phase 3G Multi-Pass Improve result", () => {
    const mockMultiPass: MultiPassImproveResult = {
      runId: "run-multi-456",
      targetUrl: "http://localhost:3000",
      maxPasses: 3,
      passesExecuted: 2,
      passesAccepted: 2,
      passesRolledBack: 0,
      recommendationsConsidered: 2,
      recommendationsSkipped: 0,
      stoppingReason: "NO_ACTIONABLE_IMPROVEMENTS",
      baselineFindings: [
        {
          id: "f1",
          category: "accessibility",
          severity: "serious",
          title: "Low contrast",
          description: "Contrast is 3.1:1",
          evidence: {},
          viewport: "desktop",
          source: "deterministic",
          deterministic: true,
          confidence: 1.0,
        },
      ],
      finalFindings: [],
      passResults: [
        {
          passNumber: 1,
          runId: "run-multi-p1",
          recommendation: {
            id: "rec1",
            problem: "Low contrast",
            evidence: {},
            affectedSelector: "button.cta",
            affectedViewports: ["desktop"],
            proposedImprovement: "Improve contrast",
            rationale: "WCAG",
            confidence: 0.95,
            estimatedMutationScope: "single-element",
            risk: "low",
            sourceFindingIds: ["f1"],
          },
          status: "SUCCESS",
          decision: "ACCEPT",
          targetedImprovement: true,
          newRegressions: 0,
          durationMs: 2000,
          summary: "Pass 1 accepted",
        },
      ],
      recommendationHistory: [],
      finalStatus: "SUCCESS",
      durationMs: 5000,
      summary: "Multi-pass complete",
    };

    const model = ReportModelBuilder.fromMultiPass(mockMultiPass);

    expect(model.reportType).toBe("multi-pass");
    expect(model.executiveSummary.passesExecuted).toBe(2);
    expect(model.executiveSummary.passesAccepted).toBe(2);
    expect(model.executiveSummary.stoppingReason).toBe("NO_ACTIONABLE_IMPROVEMENTS");
    expect(model.passHistory).toHaveLength(1);
  });

  it("parses valid report JSON and rejects malformed JSON", () => {
    const validJson = JSON.stringify({
      reportId: "rep-1",
      reportType: "audit",
      targetUrl: "http://localhost:3000",
      timestamp: new Date().toISOString(),
      durationMs: 100,
      executiveSummary: {
        status: "SUCCESS",
        passesExecuted: 0,
        passesAccepted: 0,
        passesRolledBack: 0,
      },
    });

    const parsed = ReportModelBuilder.fromJson(validJson);
    expect(parsed.reportId).toBe("rep-1");

    expect(() => ReportModelBuilder.fromJson("{}")).toThrowError("Invalid report JSON");
  });
});
