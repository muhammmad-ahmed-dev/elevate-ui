import { Command } from "commander";
import { resolve } from "node:path";
import pc from "picocolors";
import { DEFAULT_CONFIG } from "../../utils/config.js";
import { logger } from "../../utils/logger.js";
import { runImprovePass } from "../../agent/improve/engine.js";
import type { ImproveRunOptions } from "../../agent/improve/types.js";

export interface ImproveCliOptions {
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
  serverAlreadyRunning?: boolean;
}

export function createImproveCommand(): Command {
  return new Command("improve")
    .description("Performs single-pass closed-loop visual feedback and code elevation")
    .argument("[url]", "Target local dev server URL", DEFAULT_CONFIG.targetUrl)
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
    .action(async (url: string, options: ImproveCliOptions) => {
      const projectRoot = process.cwd();

      const improveOptions: ImproveRunOptions = {
        targetUrl: url,
        projectRoot: resolve(projectRoot),
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
        onProgress: (step, total, message) => {
          console.log(`\n${pc.bold(pc.cyan(`[${step}/${total}]`))} ${pc.bold(message)}`);
        },
      };

      try {
        const result = await runImprovePass(improveOptions);

        logger.title("IMPROVE PASS SUMMARY");
        console.log(`Run ID:   ${result.runId}`);
        console.log(`Target:   ${result.targetUrl}`);
        console.log(`Status:   ${result.status === "SUCCESS" ? pc.green(result.status) : pc.yellow(result.status)}`);
        console.log(`Duration: ${result.durationMs}ms`);
        console.log(`Summary:  ${result.summary}`);

        if (result.recommendation) {
          console.log(`\nRecommendation: ${result.recommendation.id}`);
          console.log(`Problem:        ${result.recommendation.problem}`);
        }

        if (result.validationResult) {
          console.log(`\nValidation:     ${result.validationResult.valid ? pc.green("PASSED") : pc.red("FAILED")}`);
          console.log(`Diff:           +${result.validationResult.parsedDiff.totalAdditions} / -${result.validationResult.parsedDiff.totalDeletions} lines`);
        }

        if (result.decision) {
          console.log(`Decision Gate:  ${result.decision === "ACCEPT" ? pc.green(result.decision) : pc.red(result.decision)}`);
        }

        if (result.recoveryInstructions && result.recoveryInstructions.length > 0) {
          console.log("\n" + pc.red(pc.bold("CRITICAL RECOVERY INSTRUCTIONS:")));
          for (const line of result.recoveryInstructions) {
            console.log(`  ${line}`);
          }
        }

        if (result.status !== "SUCCESS" && result.status !== "DRY_RUN") {
          process.exitCode = 1;
        }
      } catch (err: any) {
        logger.error(`Improve pass encountered fatal failure: ${err.message}`);
        process.exitCode = 1;
      }
    });
}
