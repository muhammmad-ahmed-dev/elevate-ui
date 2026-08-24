/**
 * Phase 4A: CLI Report Command
 *
 * Generates or regenerates an HTML report from an existing report.json file.
 */

import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pc from "picocolors";
import { logger } from "../../utils/logger.js";
import { generateReport } from "../../reports/index.js";
import { ReportModelBuilder } from "../../reports/builder.js";

export function createReportCommand(): Command {
  return new Command("report")
    .description("Generates or regenerates an interactive visual HTML report from report.json")
    .argument("[jsonPath]", "Path to report.json file", "./elevate-report/report.json")
    .option("-o, --output-dir <dir>", "Output directory for HTML report", "./elevate-report")
    .option("--embed-images", "Embed screenshots directly as base64 in HTML", false)
    .action(async (jsonPath: string, options: { outputDir?: string; embedImages?: boolean }) => {
      logger.title("ELEVATE: REPORT GENERATOR");

      try {
        const resolvedPath = resolve(jsonPath);
        logger.info(`Loading report JSON from: ${resolvedPath}`);

        const content = await readFile(resolvedPath, "utf8");
        const model = ReportModelBuilder.fromJson(content);

        const result = await generateReport(model, {
          outputDir: options.outputDir,
          embedImages: Boolean(options.embedImages),
        });

        console.log(`\n${pc.green("✔")} HTML report successfully generated: ${pc.bold(result.htmlPath)}`);
        console.log(`  Target:  ${result.reportModel.targetUrl}`);
        console.log(`  Type:    ${result.reportModel.reportType}`);
        console.log(`  Status:  ${result.reportModel.executiveSummary.status}`);
      } catch (err: any) {
        logger.error(`Failed to generate report: ${err.message}`);
        process.exitCode = 1;
      }
    });
}
