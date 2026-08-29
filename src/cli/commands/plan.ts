/**
 * Phase 4D: CLI Command — `elevate plan`
 *
 * Provides a read-only command to analyze user design intent, synthesize references,
 * generate design systems and site plans, and produce token-optimized agent contexts.
 *
 * CRITICAL SAFETY RAIL:
 * This command is strictly READ-ONLY and NEVER modifies source code or workspace files.
 */

import { Command } from "commander";
import { writeFile } from "node:fs/promises";
import pc from "picocolors";
import { AgentDirector } from "../../agent/design/director.js";
import type { UserRequest, InputMode } from "../../agent/design/types.js";
import { logger } from "../../utils/logger.js";

export function createPlanCommand(): Command {
  const command = new Command("plan");

  command
    .description("Plan a structured, token-optimized design blueprint and agent context (Read-Only)")
    .argument("[prompt]", "User request or design description (e.g. 'Make a dark portfolio for a 3D artist')")
    .option("-r, --reference <paths...>", "Path(s) or URL(s) to reference screenshots")
    .option("--url <url>", "Live URL of an existing website to analyze or improve")
    .option("--dir <path>", "Path to an existing repository directory")
    .option("-m, --mode <mode>", "Explicit planning mode (BUILD_FROM_SCRATCH, REFERENCE_DRIVEN, EXISTING_SITE, HYBRID)")
    .option("-o, --output <file>", "Save the generated agent prompt or full blueprint to a file")
    .option("--json", "Output raw JSON representation instead of human-readable summary", false)
    .action(async (promptArg: string | undefined, options: any) => {
      try {
        const prompt = promptArg || "";
        const references = options.reference || [];
        const existingUrl = options.url;
        const existingRepoPath = options.dir;
        let targetMode: InputMode | undefined;
        if (options.mode) {
          const validModes: InputMode[] = ["BUILD_FROM_SCRATCH", "REFERENCE_DRIVEN", "EXISTING_SITE", "HYBRID"];
          const normalizedMode = options.mode.toUpperCase() as InputMode;
          if (!validModes.includes(normalizedMode)) {
            logger.error(`Invalid mode '${options.mode}'. Valid modes: ${validModes.join(", ")}`);
            process.exitCode = 1;
            return;
          }
          targetMode = normalizedMode;
        }

        if (!prompt && references.length === 0 && !existingUrl && !existingRepoPath) {
          logger.error("Please provide a prompt description, reference screenshot (--reference), or existing site (--url / --dir).");
          process.exitCode = 1;
          return;
        }

        const request: UserRequest = {
          prompt,
          references,
          existingUrl,
          existingRepoPath,
          targetMode,
        };

        // Execute deterministic planning pipeline
        const result = AgentDirector.plan(request);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log("\n" + result.humanSummary + "\n");
        }

        if (options.output) {
          const content = options.output.endsWith(".json")
            ? JSON.stringify(result, null, 2)
            : result.agentContext.structuredPrompt;

          await writeFile(options.output, content, "utf8");
          logger.success(`Saved design plan to ${pc.bold(options.output)}`);
        }
      } catch (err: any) {
        logger.error(`Design planning failed: ${err.message}`);
        process.exitCode = 1;
      }
    });

  return command;
}
