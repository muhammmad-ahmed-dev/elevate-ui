/**
 * Phase 4B: MCP Tools Implementation
 *
 * Exposes Elevate capabilities to MCP clients strictly through
 * delegation to existing public Elevate APIs.
 */

import type { McpServer } from "@modelcontextprotocol/server";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  AuditInputSchema,
  ImproveInputSchema,
  VerifyInputSchema,
  CompareInputSchema,
  ReportInputSchema,
  type AuditInput,
  type ImproveInput,
  type VerifyInput,
  type CompareInput,
  type ReportInput,
} from "./schemas.js";
import { formatMcpSuccess, formatMcpError } from "./errors.js";
import { assertWithinAllowedDirectory } from "./security.js";
import type { McpRunStore } from "./store.js";
import { runAuditPipeline } from "../cli/commands/audit.js";
import { runMultiPassImproveLoop } from "../agent/improve/loop.js";
import { generateReport, buildReportModel, ReportModelBuilder } from "../reports/index.js";
import type { MultiPassImproveOptions } from "../agent/improve/types.js";
import { DEFAULT_CONFIG } from "../utils/config.js";

export function registerMcpTools(server: McpServer, store: McpRunStore): void {
  // -------------------------------------------------------------------------
  // 1. Tool: audit
  // -------------------------------------------------------------------------
  server.registerTool(
    "audit",
    {
      title: "Audit Web Design & Layout",
      description:
        "Performs multi-viewport perception, deterministic rules, visual heuristic checks, and synthesis without modifying any code.",
      inputSchema: AuditInputSchema,
    },
    async (params: AuditInput) => {
      try {
        const url = params.url || DEFAULT_CONFIG.targetUrl;
        const result = await runAuditPipeline(url, {
          visionProvider: params.visionProvider,
          visionModel: params.visionModel,
          skipVision: params.skipVision,
          screenshotsDir: params.screenshotsDir,
        });

        let reportResult;
        if (params.report) {
          const reportDir = params.reportDir
            ? assertWithinAllowedDirectory(params.reportDir)
            : undefined;
          reportResult = await generateReport(result, { outputDir: reportDir });
        }

        const runId = `audit-${Date.now()}`;
        const reportModel = reportResult?.reportModel || buildReportModel(result);
        store.saveRun({
          type: "audit",
          id: runId,
          timestamp: Date.now(),
          data: result,
          report: reportModel,
        });

        return formatMcpSuccess(
          result.deduplicatedFindings.length === 0 ? "SUCCESS" : "NO_ACTIONABLE_IMPROVEMENT",
          `Audit complete: ${result.deduplicatedFindings.length} findings, ${result.recommendations.length} recommendations synthesized.`,
          {
            runId,
            details: {
              targetUrl: url,
              totalFindings: result.deduplicatedFindings.length,
              findings: result.deduplicatedFindings.map((f) => ({
                id: f.id,
                severity: f.severity,
                category: f.category,
                title: f.title,
                selector: f.selector,
                viewport: f.viewport,
              })),
              recommendations: result.recommendations.map((r) => ({
                id: r.id,
                problem: r.problem,
                proposedImprovement: r.proposedImprovement,
                risk: r.risk,
                affectedSelector: r.affectedSelector,
                confidence: r.confidence,
              })),
              viewports: result.viewportMetadata,
            },
            reportPath: reportResult?.htmlPath,
            jsonPath: reportResult?.jsonPath,
          }
        );
      } catch (err: any) {
        return formatMcpError(err);
      }
    }
  );

  // -------------------------------------------------------------------------
  // 2. Tool: improve
  // -------------------------------------------------------------------------
  server.registerTool(
    "improve",
    {
      title: "Improve Web Design & Fix Layout Defects",
      description:
        "Executes bounded closed-loop visual refinement with AST safety, Git transactions, automated verification gates, and rollback guarantees.",
      inputSchema: ImproveInputSchema,
    },
    async (params: ImproveInput) => {
      try {
        const url = params.url || DEFAULT_CONFIG.targetUrl;
        const projectRoot = process.cwd();

        // APPROVAL SAFETY GATE:
        // If neither dryRun nor autoApprove is set, execute a dry-run pass first
        // and return APPROVAL_REQUIRED with the proposed patch.
        if (!params.dryRun && !params.autoApprove) {
          const dryRunOptions: MultiPassImproveOptions = {
            targetUrl: url,
            projectRoot: resolve(projectRoot),
            maxPasses: 1,
            dryRun: true,
            autoApprove: false,
            visionProvider: params.visionProvider,
            visionModel: params.visionModel,
            skipVision: params.skipVision,
            patchProvider: params.patchProvider,
            patchModel: params.patchModel,
            maxFiles: params.maxFiles,
            maxLines: params.maxLines,
            timeoutMs: params.timeoutMs,
            devServerCmd: params.devServerCmd,
            typecheckCmd: params.typecheckCmd,
            buildCmd: params.buildCmd,
          };

          const dryRunResult = await runMultiPassImproveLoop(dryRunOptions);
          const firstPass = dryRunResult.passResults[0];

          return formatMcpSuccess(
            "APPROVAL_REQUIRED",
            "Mutation proposal generated in dry-run mode. Explicit human approval is required before applying changes to disk.",
            {
              runId: dryRunResult.runId,
              details: {
                targetUrl: url,
                stoppingReason: "APPROVAL_REQUIRED",
                recommendation: firstPass?.recommendation
                  ? {
                      id: firstPass.recommendation.id,
                      problem: firstPass.recommendation.problem,
                      proposedImprovement: firstPass.recommendation.proposedImprovement,
                      affectedSelector: firstPass.recommendation.affectedSelector,
                      risk: firstPass.recommendation.risk,
                    }
                  : undefined,
                filesTouched: firstPass?.validationResult?.normalizedFiles || [],
                additions: firstPass?.validationResult?.parsedDiff.totalAdditions || 0,
                deletions: firstPass?.validationResult?.parsedDiff.totalDeletions || 0,
                rawDiffSnippet: firstPass?.validationResult?.rawPatch?.slice(0, 1000),
                instructions:
                  "To execute this mutation, call improve with `autoApprove: true` or execute interactively via CLI.",
              },
            }
          );
        }

        // Autonomous or Dry-Run Execution
        const improveOptions: MultiPassImproveOptions = {
          targetUrl: url,
          projectRoot: resolve(projectRoot),
          maxPasses: params.maxPasses || 1,
          dryRun: Boolean(params.dryRun),
          autoApprove: Boolean(params.autoApprove),
          visionProvider: params.visionProvider,
          visionModel: params.visionModel,
          skipVision: params.skipVision,
          patchProvider: params.patchProvider,
          patchModel: params.patchModel,
          maxFiles: params.maxFiles,
          maxLines: params.maxLines,
          timeoutMs: params.timeoutMs,
          devServerCmd: params.devServerCmd,
          typecheckCmd: params.typecheckCmd,
          buildCmd: params.buildCmd,
        };

        const result = await runMultiPassImproveLoop(improveOptions);

        let reportResult;
        if (params.report) {
          const reportDir = params.reportDir
            ? assertWithinAllowedDirectory(params.reportDir)
            : undefined;
          reportResult = await generateReport(result, { outputDir: reportDir });
        }

        const reportModel = reportResult?.reportModel || buildReportModel(result);
        store.saveRun({
          type: "multi-pass",
          id: result.runId,
          timestamp: Date.now(),
          data: result,
          report: reportModel,
        });

        const status =
          result.finalStatus === "SUCCESS"
            ? "SUCCESS"
            : result.finalStatus === "DRY_RUN"
            ? "DRY_RUN"
            : result.finalStatus === "ROLLED_BACK"
            ? "ROLLED_BACK"
            : "NO_ACTIONABLE_IMPROVEMENT";

        return formatMcpSuccess(status, result.summary, {
          runId: result.runId,
          stoppingReason: result.stoppingReason,
          details: {
            targetUrl: result.targetUrl,
            passesExecuted: result.passesExecuted,
            passesAccepted: result.passesAccepted,
            passesRolledBack: result.passesRolledBack,
            durationMs: result.durationMs,
            recoveryInstructions: result.recoveryInstructions,
          },
          reportPath: reportResult?.htmlPath,
          jsonPath: reportResult?.jsonPath,
        });
      } catch (err: any) {
        return formatMcpError(err);
      }
    }
  );

  // -------------------------------------------------------------------------
  // 3. Tool: verify
  // -------------------------------------------------------------------------
  server.registerTool(
    "verify",
    {
      title: "Verify Layout Health (Read-Only)",
      description:
        "Runs deterministic accessibility, layout overflow, and visual perception checks on a target URL without modifying code.",
      inputSchema: VerifyInputSchema,
    },
    async (params: VerifyInput) => {
      try {
        const url = params.url || DEFAULT_CONFIG.targetUrl;
        const result = await runAuditPipeline(url, {
          skipVision: false,
        });

        let reportResult;
        if (params.report) {
          const reportDir = params.reportDir
            ? assertWithinAllowedDirectory(params.reportDir)
            : undefined;
          reportResult = await generateReport(result, { outputDir: reportDir });
        }

        const runId = `verify-${Date.now()}`;
        const reportModel = reportResult?.reportModel || buildReportModel(result);
        store.saveRun({
          type: "audit",
          id: runId,
          timestamp: Date.now(),
          data: result,
          report: reportModel,
        });

        const criticals = result.deduplicatedFindings.filter(
          (f) => f.severity === "critical"
        ).length;
        const status =
          criticals === 0 && result.deduplicatedFindings.length === 0
            ? "SUCCESS"
            : "VERIFICATION_FAILED";

        return formatMcpSuccess(
          status,
          `Verification complete: ${result.deduplicatedFindings.length} issues detected (${criticals} critical).`,
          {
            runId,
            details: {
              targetUrl: url,
              findingsCount: result.deduplicatedFindings.length,
              criticalCount: criticals,
              findings: result.deduplicatedFindings,
            },
            reportPath: reportResult?.htmlPath,
            jsonPath: reportResult?.jsonPath,
          }
        );
      } catch (err: any) {
        return formatMcpError(err);
      }
    }
  );

  // -------------------------------------------------------------------------
  // 4. Tool: compare
  // -------------------------------------------------------------------------
  server.registerTool(
    "compare",
    {
      title: "Compare Findings & Visual Health",
      description:
        "Compares before and after findings, regressions, and outcomes from a previous run or report.json.",
      inputSchema: CompareInputSchema,
    },
    async (params: CompareInput) => {
      try {
        let model: any;

        if (params.runId) {
          const stored = store.getRun(params.runId);
          if (!stored) {
            throw new Error(`Run ID '${params.runId}' not found in active session.`);
          }
          model = stored.report || buildReportModel(stored.data as any);
        } else if (params.reportJsonPath) {
          const safePath = assertWithinAllowedDirectory(params.reportJsonPath);
          const raw = await readFile(safePath, "utf8");
          model = ReportModelBuilder.fromJson(raw);
        } else {
          const latest = store.getLatestReport();
          if (latest) {
            model = latest;
          } else {
            const defaultPath = assertWithinAllowedDirectory("./elevate-report/report.json");
            const raw = await readFile(defaultPath, "utf8");
            model = ReportModelBuilder.fromJson(raw);
          }
        }

        return formatMcpSuccess("SUCCESS", `Comparison data retrieved for report: ${model.reportId}`, {
          runId: model.reportId,
          details: {
            reportType: model.reportType,
            targetUrl: model.targetUrl,
            executiveSummary: model.executiveSummary,
            findingsBaselineCount: (model.findingsBaseline || []).length,
            findingsFinalCount: (model.findingsFinal || []).length,
            resolvedFindingsCount: model.executiveSummary.resolvedFindingsCount,
            passesExecuted: model.executiveSummary.passesExecuted,
            passesAccepted: model.executiveSummary.passesAccepted,
          },
        });
      } catch (err: any) {
        return formatMcpError(err);
      }
    }
  );

  // -------------------------------------------------------------------------
  // 5. Tool: report
  // -------------------------------------------------------------------------
  server.registerTool(
    "report",
    {
      title: "Generate Visual Diff HTML & JSON Report",
      description:
        "Renders a self-contained interactive visual diff HTML report and structured JSON report from existing run results.",
      inputSchema: ReportInputSchema,
    },
    async (params: ReportInput) => {
      try {
        const safeJsonPath = assertWithinAllowedDirectory(
          params.reportJsonPath || "./elevate-report/report.json"
        );
        const safeOutputDir = assertWithinAllowedDirectory(
          params.outputDir || "./elevate-report"
        );

        const content = await readFile(safeJsonPath, "utf8");
        const model = ReportModelBuilder.fromJson(content);

        const result = await generateReport(model, {
          outputDir: safeOutputDir,
          embedImages: Boolean(params.embedImages),
        });

        store.saveReport(result.reportModel);

        return formatMcpSuccess("SUCCESS", `Report generated: ${result.htmlPath}`, {
          runId: result.reportModel.reportId,
          reportPath: result.htmlPath,
          jsonPath: result.jsonPath,
          details: {
            assetsDir: result.assetsDir,
            reportType: result.reportModel.reportType,
            targetUrl: result.reportModel.targetUrl,
            status: result.reportModel.executiveSummary.status,
          },
        });
      } catch (err: any) {
        return formatMcpError(err);
      }
    }
  );
}
