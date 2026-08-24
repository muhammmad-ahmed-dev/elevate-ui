/**
 * Phase 4A: Reporting Subsystem — Public API Entrypoint
 */

import { writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { ReportModelBuilder } from "./builder.js";
import { renderHtmlReport, renderJsonReport } from "./renderer.js";
import { processReportScreenshots } from "./assets.js";
import type {
  ReportModel,
  ReportGeneratorOptions,
  GeneratedReportOutput,
} from "./types.js";
import type { AnalysisResult } from "../analysis/types.js";
import type { ImproveRunResult, MultiPassImproveResult } from "../agent/improve/types.js";
import { logger } from "../utils/logger.js";

export * from "./types.js";
export * from "./builder.js";
export * from "./renderer.js";
export * from "./assets.js";

export type ReportInputData =
  | AnalysisResult
  | ImproveRunResult
  | MultiPassImproveResult
  | ReportModel;

/**
 * Builds a ReportModel from any supported Elevate run output.
 */
export function buildReportModel(
  data: ReportInputData
): ReportModel {
  if ("reportType" in data && "executiveSummary" in data) {
    return data as ReportModel;
  }
  if ("passesExecuted" in data && "stoppingReason" in data) {
    return ReportModelBuilder.fromMultiPass(data as MultiPassImproveResult);
  }
  if ("runId" in data && "status" in data) {
    return ReportModelBuilder.fromSinglePass(data as ImproveRunResult);
  }
  if ("deduplicatedFindings" in data && "runMetadata" in data) {
    return ReportModelBuilder.fromAudit(data as AnalysisResult);
  }
  throw new Error("Unrecognized report input data structure.");
}

/**
 * Generates both summary.html and report.json in the specified output directory.
 *
 * @param data  Run result (Audit, Single-Pass, Multi-Pass, or existing ReportModel).
 * @param options Generator options (outputDir, embedImages, title, theme).
 * @returns Object with paths to created HTML and JSON report artifacts.
 */
export async function generateReport(
  data: ReportInputData,
  options: ReportGeneratorOptions = {}
): Promise<GeneratedReportOutput> {
  const outputDir = resolve(options.outputDir || "./elevate-report");
  const assetsDir = join(outputDir, "assets");
  await mkdir(outputDir, { recursive: true });

  const rawModel = buildReportModel(data);

  // Process and copy screenshot assets
  const processedViewports = await processReportScreenshots(
    rawModel.viewports,
    outputDir,
    options.embedImages
  );

  const finalModel: ReportModel = {
    ...rawModel,
    viewports: processedViewports,
  };

  const htmlContent = renderHtmlReport(finalModel, options);
  const jsonContent = renderJsonReport(finalModel);

  const htmlPath = join(outputDir, "summary.html");
  const jsonPath = join(outputDir, "report.json");

  await writeFile(htmlPath, htmlContent, "utf8");
  await writeFile(jsonPath, jsonContent, "utf8");

  logger.success(`Report generated: ${htmlPath}`);
  logger.info(`Report JSON:      ${jsonPath}`);

  return {
    htmlPath,
    jsonPath,
    assetsDir,
    reportModel: finalModel,
  };
}
