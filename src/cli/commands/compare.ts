import { Command } from "commander";
import { logger } from "../../utils/logger.js";

export function createCompareCommand(): Command {
  return new Command("compare")
    .description("Compares before and after visual diffs across viewports")
    .argument("<before>", "Path to baseline screenshot or report")
    .argument("<after>", "Path to target screenshot or report")
    .action(async (_before: string, _after: string) => {
      logger.title("ELEVATE: VISUAL COMPARE");
      logger.info("Visual diff comparison reporting is scheduled for Phase 4.");
    });
}
