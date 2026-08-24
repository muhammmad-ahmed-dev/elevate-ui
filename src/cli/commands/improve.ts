import { Command } from "commander";
import { resolve } from "node:path";
import pc from "picocolors";
import { DEFAULT_CONFIG } from "../../utils/config.js";
import { logger } from "../../utils/logger.js";
import { runMultiPassImproveLoop } from "../../agent/improve/loop.js";
import type { MultiPassImproveOptions } from "../../agent/improve/types.js";

export interface ImproveCliOptions {
  maxPasses?: string;
  dryRun?: boolean;
  autoApprove?: boolean;
  visionProvider?: string;
  visionModel?: string;
  skipVision?: boolean;
  patchProvider?: string;
  patchModel?: string;
  maxFiles?: string;
  maxLines?: string;
  timeout?: string;
  devServerCmd?: string;
  typecheckCmd?: string;
  buildCmd?: string;
  screenshotsDir?: string;
  report?: boolean;
  reportDir?: string;
}

export function createImproveCommand(): Command {
  return new Command("improve")
    .description("Performs bounded multi-pass closed-loop visual feedback and code elevation")
    .argument("[url]", "Target local dev server URL", DEFAULT_CONFIG.targetUrl)
    .option("--max-passes <number>", "Maximum number of improvement passes to execute (1-10)", "1")
    .option("--dry-run", "Generate and validate patch without applying mutations to disk", false)
    .option("--auto-approve", "Skip interactive human approval and proceed with mutation automatically", false)
    .option("--vision-provider <provider>", "Vision provider (gemini, claude, mock)")
    .option("--vision-model <model>", "Vision model name")
    .option("--skip-vision", "Skip multimodal visual analysis (deterministic audit only)")
    .option("--patch-provider <provider>", "Patch generation provider (claude, gemini, mock)")
    .option("--patch-model <model>", "Patch generation model name")
    .option("--max-files <number>", "Maximum files allowed to touch in a single patch", "2")
    .option("--max-lines <number>", "Maximum line changes allowed in a single patch", "150")
    .option("--timeout <ms>", "External provider timeout in milliseconds", "60000")
    .option("--dev-server-cmd <cmd>", "Command to start target dev server if needed")
    .option("--typecheck-cmd <cmd>", "Command to run typechecking verification")
    .option("--build-cmd <cmd>", "Command to run build verification")
    .option("-s, --screenshots-dir <dir>", "Directory to save captured screenshots", "./elevate-report/screenshots")
    .option("--report", "Automatically generate HTML and JSON report", false)
    .option("--report-dir <dir>", "Directory for report output", "./elevate-report")
    .action(async (url: string, options: ImproveCliOptions) => {
      const projectRoot = process.cwd();

      // Validate max-passes
      const rawPasses = options.maxPasses ? parseInt(options.maxPasses, 10) : 1;
      if (isNaN(rawPasses) || rawPasses < 1 || rawPasses > 10) {
        logger.error(`Invalid --max-passes argument: '${options.maxPasses}'. Must be an integer between 1 and 10.`);
        process.exitCode = 1;
        return;
      }

      const improveOptions: MultiPassImproveOptions = {
        targetUrl: url,
        projectRoot: resolve(projectRoot),
        maxPasses: rawPasses,
        dryRun: Boolean(options.dryRun),
        autoApprove: Boolean(options.autoApprove),
        visionProvider: options.visionProvider,
        visionModel: options.visionModel,
        skipVision: Boolean(options.skipVision),
        patchProvider: options.patchProvider,
        patchModel: options.patchModel,
        maxFiles: options.maxFiles ? parseInt(options.maxFiles, 10) : 2,
        maxLines: options.maxLines ? parseInt(options.maxLines, 10) : 150,
        timeoutMs: options.timeout ? parseInt(options.timeout, 10) : 60000,
        devServerCmd: options.devServerCmd,
        typecheckCmd: options.typecheckCmd,
        buildCmd: options.buildCmd,
        screenshotDir: options.screenshotsDir,
      };

      try {
        const result = await runMultiPassImproveLoop(improveOptions);

        logger.title("MULTI-PASS IMPROVE SUMMARY");
        console.log(`Run ID:              ${result.runId}`);
        console.log(`Target:              ${result.targetUrl}`);
        console.log(`Passes Executed:     ${result.passesExecuted} / ${result.maxPasses}`);
        console.log(`Passes Accepted:     ${pc.green(String(result.passesAccepted))}`);
        console.log(`Passes Rolled Back:  ${result.passesRolledBack > 0 ? pc.yellow(String(result.passesRolledBack)) : "0"}`);
        console.log(`Stopping Reason:     ${pc.cyan(result.stoppingReason)}`);
        console.log(`Final Status:        ${result.finalStatus === "SUCCESS" ? pc.green(result.finalStatus) : pc.yellow(result.finalStatus)}`);
        console.log(`Total Duration:      ${result.durationMs}ms`);
        console.log(`Summary:             ${result.summary}`);

        if (result.passResults.length > 0) {
          logger.title("PER-PASS BREAKDOWN");
          for (const pass of result.passResults) {
            const statusColor = pass.status === "SUCCESS" ? pc.green : pass.status === "ROLLED_BACK" ? pc.yellow : pc.red;
            console.log(`\n${pc.bold(`Pass ${pass.passNumber}`)} [${statusColor(pass.status)}]:`);
            console.log(`  Recommendation: ${pass.recommendation.id} (${pass.recommendation.problem})`);
            console.log(`  Decision:       ${pass.decision ? (pass.decision === "ACCEPT" ? pc.green(pass.decision) : pc.red(pass.decision)) : "N/A"}`);
            console.log(`  Summary:        ${pass.summary}`);
          }
        }

        if (result.recoveryInstructions && result.recoveryInstructions.length > 0) {
          console.log("\n" + pc.red(pc.bold("CRITICAL RECOVERY INSTRUCTIONS:")));
          for (const line of result.recoveryInstructions) {
            console.log(`  ${line}`);
          }
        }

        if (options.report) {
          const { generateReport } = await import("../../reports/index.js");
          await generateReport(result, { outputDir: options.reportDir });
        }

        if (result.finalStatus !== "SUCCESS" && result.finalStatus !== "DRY_RUN") {
          process.exitCode = 1;
        }
      } catch (err: any) {
        logger.error(`Improve loop encountered fatal failure: ${err.message}`);
        process.exitCode = 1;
      }
    });
}
