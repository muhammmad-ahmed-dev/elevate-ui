import { Command } from "commander";
import { SafetyVerifier } from "../../safety/verifier.js";
import { GitManager } from "../../safety/git.js";
import { logger } from "../../utils/logger.js";

export function createVerifyCommand(): Command {
  return new Command("verify")
    .description("Runs project verification gates (typecheck, build, git safety check)")
    .option("--skip-build", "Skip framework build gate (typecheck only)")
    .option("--typecheck-cmd <cmd>", "Custom typecheck command")
    .option("--build-cmd <cmd>", "Custom build command")
    .action(async (options: { skipBuild?: boolean; typecheckCmd?: string; buildCmd?: string }) => {
      logger.title("ELEVATE: SAFETY VERIFICATION");

      // 1. Check Git
      const git = new GitManager();
      const gitStatus = await git.getStatus();
      if (!gitStatus.isRepo) {
        logger.error("Git Safety Check: Failed (Not a Git repository)");
      } else {
        logger.success(`Git Safety Check: Active (Branch: ${gitStatus.branch}, Clean: ${gitStatus.isClean})`);
      }

      // 2. Run Gates
      const verifier = new SafetyVerifier({
        skipBuild: options.skipBuild,
        typecheckCmd: options.typecheckCmd,
        buildCmd: options.buildCmd,
      });

      const result = await verifier.verify();

      console.log("\n--- Verification Summary ---");
      for (const gate of result.gates) {
        if (gate.passed) {
          logger.success(`${gate.name}: Passed (${gate.durationMs}ms)`);
        } else {
          logger.error(`${gate.name}: Failed (${gate.durationMs}ms)`);
        }
      }

      if (result.passed) {
        logger.success(`\nAll verification gates passed (${result.totalDurationMs}ms).`);
      } else {
        logger.error(`\nVerification failed (${result.totalDurationMs}ms).`);
        process.exitCode = 1;
      }
    });
}
