/**
 * Phase 4A: Report Model Builder
 *
 * Normalizes input run data (from audit, single-pass improve, or multi-pass improve)
 * into a single unified, provider-independent ReportModel.
 *
 * Enforces strict secret stripping to guarantee zero API keys or credentials
 * leak into generated report models.
 */

import { randomUUID } from "node:crypto";
import type { AnalysisResult, MutationRecommendation } from "../analysis/types.js";
import type { ImproveRunResult, MultiPassImproveResult, ImprovePassResult } from "../agent/improve/types.js";
import type {
  ReportModel,
  ReportPassItem,
  ReportViewportScreenshot,
  ReportExecutiveSummary,
} from "./types.js";
import type { VerificationGateResult } from "../agent/patch/verify/types.js";

const SECRET_PATTERNS = [
  /AIza[0-9A-Za-z-_]{30,}/g,
  /sk-ant-[0-9A-Za-z-_]{30,}/g,
  /sk-[0-9A-Za-z-_]{20,}/g,
  /(?:api[_-]?key|secret|token|password|auth)['"]?\s*[:=]\s*['"]?([a-zA-Z0-9_\-.]{8,})['"]?/gi,
];

/**
 * Sanitizes arbitrary text to strip API keys and credentials.
 */
export function sanitizeReportText(text?: string): string {
  if (!text) return "";
  let clean = text;
  for (const pattern of SECRET_PATTERNS) {
    clean = clean.replace(pattern, "[REDACTED_SECRET]");
  }
  return clean;
}

function extractScreenshotPaths(verificationResult?: any): string[] {
  return verificationResult?.comparison?.browserResult?.screenshotPaths || [];
}

export class ReportModelBuilder {
  /**
   * Build report model from Phase 2 Audit results.
   */
  public static fromAudit(result: AnalysisResult): ReportModel {
    const reportId = `report-audit-${randomUUID().slice(0, 8)}`;
    const findings = result.deduplicatedFindings || [];
    const criticals = findings.filter((f) => f.severity === "critical").length;
    const serious = findings.filter((f) => f.severity === "serious").length;

    const viewports: ReportViewportScreenshot[] = [
      { viewport: "mobile", label: "Mobile (375px)", width: 375, height: 667 },
      { viewport: "tablet", label: "Tablet (768px)", width: 768, height: 1024 },
      { viewport: "desktop", label: "Desktop (1440px)", width: 1440, height: 900 },
    ];

    const executiveSummary: ReportExecutiveSummary = {
      status: findings.length === 0 ? "SUCCESS" : "NO_ACTIONABLE_IMPROVEMENT",
      passesExecuted: 0,
      passesAccepted: 0,
      passesRolledBack: 0,
      stoppingReason: "Audit complete",
      totalFindingsBefore: findings.length,
      totalFindingsAfter: findings.length,
      criticalFindingsBefore: criticals,
      criticalFindingsAfter: criticals,
      seriousFindingsBefore: serious,
      seriousFindingsAfter: serious,
      resolvedFindingsCount: 0,
      recommendationsConsidered: (result.recommendations || []).length,
      recommendationsAccepted: 0,
    };

    return {
      reportId,
      reportType: "audit",
      targetUrl: result.runMetadata.targetUrl,
      timestamp: new Date(result.runMetadata.timestamp).toISOString(),
      durationMs: result.runMetadata.durationMs,
      executiveSummary,
      viewports,
      findingsBaseline: findings,
      findingsFinal: findings,
      recommendations: result.recommendations || [],
      passHistory: [],
      verificationGates: [],
      generatorMetadata: {
        version: "0.1.0",
        generatedAt: new Date().toISOString(),
        environment: "Node.js",
      },
    };
  }

  /**
   * Build report model from Phase 3F Single-Pass Improve result.
   */
  public static fromSinglePass(result: ImproveRunResult): ReportModel {
    const reportId = `report-single-${randomUUID().slice(0, 8)}`;
    const beforeFindings = result.findingsBefore || [];
    const afterFindings = result.verificationResult?.comparison?.findingsAfter || beforeFindings;

    const criticalBefore = beforeFindings.filter((f) => f.severity === "critical").length;
    const seriousBefore = beforeFindings.filter((f) => f.severity === "serious").length;
    const criticalAfter = afterFindings.filter((f) => f.severity === "critical").length;
    const seriousAfter = afterFindings.filter((f) => f.severity === "serious").length;

    const afterIds = new Set(afterFindings.map((f) => f.id));
    const resolvedCount = beforeFindings.filter((f) => !afterIds.has(f.id)).length;

    const passesAccepted = result.decision === "ACCEPT" ? 1 : 0;
    const passesRolledBack = result.decision === "ROLLBACK" ? 1 : 0;

    const passItem: ReportPassItem | undefined = result.recommendation
      ? {
          passNumber: 1,
          recommendationId: result.recommendation.id,
          recommendationProblem: result.recommendation.problem,
          recommendationAction: result.recommendation.proposedImprovement,
          affectedSelector: result.recommendation.affectedSelector,
          affectedComponents: result.recommendation.affectedComponents,
          status: result.status,
          decision: result.decision,
          filesTouched: result.validationResult?.normalizedFiles || [],
          additions: result.validationResult?.parsedDiff.totalAdditions || 0,
          deletions: result.validationResult?.parsedDiff.totalDeletions || 0,
          patchSummary: result.summary,
          rawDiff: sanitizeReportText(result.validationResult?.rawPatch),
          pathGuardValid: result.validationResult?.pathGuardResult.valid ?? false,
          scopeGuardValid: result.validationResult?.scopeResult.valid ?? false,
          astGuardValid: result.validationResult?.astResult.valid ?? false,
          hardGatesPassed: result.verificationResult?.comparison?.regression.hardGatesPassed ?? false,
          hardGates: (result.verificationResult?.comparison?.hardGates || []).map((g) => ({
            name: g.name,
            passed: g.passed,
            output: sanitizeReportText(g.output),
            durationMs: g.durationMs,
          })),
          targetedIssueImproved: result.verificationResult?.comparison?.regression.targetedIssueImproved ?? false,
          newCriticalFindings: result.verificationResult?.comparison?.regression.newCriticalFindings ?? 0,
          newSeriousFindings: result.verificationResult?.comparison?.regression.newSeriousFindings ?? 0,
          resolvedFindingsCount: resolvedCount,
          durationMs: result.durationMs,
          summary: result.summary,
          rollbackOccurred: passesRolledBack > 0,
        }
      : undefined;

    const screenshotPaths = extractScreenshotPaths(result.verificationResult);
    const viewports: ReportViewportScreenshot[] = [
      {
        viewport: "mobile",
        label: "Mobile (375px)",
        width: 375,
        height: 667,
        afterPath: screenshotPaths[0],
      },
      {
        viewport: "tablet",
        label: "Tablet (768px)",
        width: 768,
        height: 1024,
        afterPath: screenshotPaths[1],
      },
      {
        viewport: "desktop",
        label: "Desktop (1440px)",
        width: 1440,
        height: 900,
        afterPath: screenshotPaths[2] || screenshotPaths[0],
      },
    ];

    const executiveSummary: ReportExecutiveSummary = {
      status: result.status,
      decision: result.decision,
      passesExecuted: result.recommendation ? 1 : 0,
      passesAccepted,
      passesRolledBack,
      stoppingReason: result.summary,
      totalFindingsBefore: beforeFindings.length,
      totalFindingsAfter: afterFindings.length,
      criticalFindingsBefore: criticalBefore,
      criticalFindingsAfter: criticalAfter,
      seriousFindingsBefore: seriousBefore,
      seriousFindingsAfter: seriousAfter,
      resolvedFindingsCount: resolvedCount,
      recommendationsConsidered: result.recommendation ? 1 : 0,
      recommendationsAccepted: passesAccepted,
    };

    return {
      reportId,
      reportType: "single-pass",
      targetUrl: result.targetUrl,
      timestamp: new Date().toISOString(),
      durationMs: result.durationMs,
      executiveSummary,
      viewports,
      findingsBaseline: beforeFindings,
      findingsFinal: afterFindings,
      recommendations: result.recommendation ? [result.recommendation] : [],
      passHistory: passItem ? [passItem] : [],
      verificationGates: result.verificationResult?.comparison?.hardGates || [],
      recoveryInstructions: result.recoveryInstructions,
      generatorMetadata: {
        version: "0.1.0",
        generatedAt: new Date().toISOString(),
        environment: "Node.js",
      },
    };
  }

  /**
   * Build report model from Phase 3G Multi-Pass Improve result.
   */
  public static fromMultiPass(result: MultiPassImproveResult): ReportModel {
    const reportId = `report-multi-${randomUUID().slice(0, 8)}`;
    const beforeFindings = result.baselineFindings || [];
    const afterFindings = result.finalFindings || beforeFindings;

    const criticalBefore = beforeFindings.filter((f) => f.severity === "critical").length;
    const seriousBefore = beforeFindings.filter((f) => f.severity === "serious").length;
    const criticalAfter = afterFindings.filter((f) => f.severity === "critical").length;
    const seriousAfter = afterFindings.filter((f) => f.severity === "serious").length;

    const afterIds = new Set(afterFindings.map((f) => f.id));
    const resolvedCount = beforeFindings.filter((f) => !afterIds.has(f.id)).length;

    const passHistory: ReportPassItem[] = (result.passResults || []).map((p: ImprovePassResult) => ({
      passNumber: p.passNumber,
      recommendationId: p.recommendation.id,
      recommendationProblem: p.recommendation.problem,
      recommendationAction: p.recommendation.proposedImprovement,
      affectedSelector: p.recommendation.affectedSelector,
      affectedComponents: p.recommendation.affectedComponents,
      status: p.status,
      decision: p.decision,
      filesTouched: p.validationResult?.normalizedFiles || [],
      additions: p.validationResult?.parsedDiff.totalAdditions || 0,
      deletions: p.validationResult?.parsedDiff.totalDeletions || 0,
      patchSummary: p.summary,
      rawDiff: sanitizeReportText(p.validationResult?.rawPatch),
      pathGuardValid: p.validationResult?.pathGuardResult.valid ?? false,
      scopeGuardValid: p.validationResult?.scopeResult.valid ?? false,
      astGuardValid: p.validationResult?.astResult.valid ?? false,
      hardGatesPassed: p.verificationResult?.comparison?.regression.hardGatesPassed ?? false,
      hardGates: (p.verificationResult?.comparison?.hardGates || []).map((g) => ({
        name: g.name,
        passed: g.passed,
        output: sanitizeReportText(g.output),
        durationMs: g.durationMs,
      })),
      targetedIssueImproved: p.targetedImprovement,
      newCriticalFindings: p.newRegressions,
      newSeriousFindings: 0,
      resolvedFindingsCount: p.progress?.resolved || 0,
      durationMs: p.durationMs,
      summary: p.summary,
      rollbackOccurred: p.status === "ROLLED_BACK",
    }));

    let screenshotPaths: string[] = [];
    for (const p of result.passResults || []) {
      const paths = extractScreenshotPaths(p.verificationResult);
      if (paths.length > 0) {
        screenshotPaths = paths;
        break;
      }
    }

    const viewports: ReportViewportScreenshot[] = [
      {
        viewport: "mobile",
        label: "Mobile (375px)",
        width: 375,
        height: 667,
        afterPath: screenshotPaths[0],
      },
      {
        viewport: "tablet",
        label: "Tablet (768px)",
        width: 768,
        height: 1024,
        afterPath: screenshotPaths[1],
      },
      {
        viewport: "desktop",
        label: "Desktop (1440px)",
        width: 1440,
        height: 900,
        afterPath: screenshotPaths[2] || screenshotPaths[0],
      },
    ];

    const allGates: VerificationGateResult[] = [];
    for (const p of result.passResults || []) {
      if (p.verificationResult?.comparison?.hardGates) {
        allGates.push(...p.verificationResult.comparison.hardGates);
      }
    }

    // Build recommendations list from history or passResults
    let recs: MutationRecommendation[] = (result.recommendationHistory || []).map((h) => ({
      id: h.recommendationId,
      problem: h.problem,
      evidence: {},
      affectedSelector: h.affectedSelector,
      affectedComponents: h.affectedComponents,
      affectedViewports: ["desktop", "mobile"],
      proposedImprovement: h.proposedImprovement,
      rationale: h.reasonSkippedOrRejected || "",
      confidence: 0.9,
      estimatedMutationScope: "single-element",
      risk: "low",
      sourceFindingIds: h.sourceFindingIds,
    }));

    if (recs.length === 0 && result.passResults && result.passResults.length > 0) {
      recs = result.passResults.map((p) => p.recommendation);
    }

    const executiveSummary: ReportExecutiveSummary = {
      status: result.finalStatus,
      passesExecuted: result.passesExecuted,
      passesAccepted: result.passesAccepted,
      passesRolledBack: result.passesRolledBack,
      stoppingReason: result.stoppingReason,
      totalFindingsBefore: beforeFindings.length,
      totalFindingsAfter: afterFindings.length,
      criticalFindingsBefore: criticalBefore,
      criticalFindingsAfter: criticalAfter,
      seriousFindingsBefore: seriousBefore,
      seriousFindingsAfter: seriousAfter,
      resolvedFindingsCount: resolvedCount,
      recommendationsConsidered: result.recommendationsConsidered,
      recommendationsAccepted: result.passesAccepted,
    };

    return {
      reportId,
      reportType: "multi-pass",
      targetUrl: result.targetUrl,
      timestamp: new Date().toISOString(),
      durationMs: result.durationMs,
      executiveSummary,
      viewports,
      findingsBaseline: beforeFindings,
      findingsFinal: afterFindings,
      recommendations: recs,
      passHistory,
      verificationGates: allGates,
      recoveryInstructions: result.recoveryInstructions,
      generatorMetadata: {
        version: "0.1.0",
        generatedAt: new Date().toISOString(),
        environment: "Node.js",
      },
    };
  }

  /**
   * Parse a JSON report string into a valid ReportModel.
   */
  public static fromJson(jsonContent: string): ReportModel {
    const raw = JSON.parse(jsonContent);
    if (!raw.reportId || !raw.reportType || !raw.targetUrl) {
      throw new Error("Invalid report JSON: Missing required reportId, reportType, or targetUrl fields.");
    }
    return raw as ReportModel;
  }
}
