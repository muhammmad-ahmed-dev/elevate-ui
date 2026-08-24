import { Command } from "commander";
import { DEFAULT_CONFIG } from "../../utils/config.js";
import { logger } from "../../utils/logger.js";

export function createImproveCommand(): Command {
  return new Command("improve")
    .description("Executes closed-loop visual feedback and multi-pass code elevation")
    .argument("[url]", "Target local dev server URL", DEFAULT_CONFIG.targetUrl)
    .option("-m, --max-passes <number>", "Maximum improvement passes", String(DEFAULT_CONFIG.maxPasses))
    .action(async (_url: string, _options: { maxPasses: string }) => {
      logger.title("ELEVATE: IMPROVE LOOP");
      logger.info("Multi-pass Improve Engine is scheduled for Phase 3.");
      logger.info("For Phase 1 foundation, run 'elevate audit' or 'elevate verify'.");
    });
}
