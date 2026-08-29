/**
 * Phase 4E: CLI Command — `elevate build`
 *
 * Directs external coding agents (Antigravity CLI, Mock) to build or refine
 * web applications based on natural language prompts, screenshots, and repositories.
 */

import { Command } from "commander";
import { writeFile } from "node:fs/promises";
import pc from "picocolors";
import { WorkflowEngine } from "../../agent/workflow/engine.js";
import type { WorkflowOptions } from "../../agent/workflow/types.js";
import type { InputMode } from "../../agent/design/types.js";
import { logger } from "../../utils/logger.js";

export function createBuildCommand(): Command {
  const command = new Command("build");

  command
  .description("Build or refine a web application using an autonomous coding agent directed by Elevate")
  .argument("[prompt]", "User goal or design description (e.g. 'Make me a portfolio website')")
  .option("-r, --reference <paths...>", "Path(s) or URL(s) to reference screenshots")
  .option("--url <url>", "Live URL of an existing website to analyze or improve")
  .option("--dir <path>", "Path to an existing repository directory")
  .option("-w, --workspace <dir>", "Destination workspace directory for newly built applications")
  .option("-m, --mode <mode>", "Explicit mode (BUILD_FROM_SCRATCH, REFERENCE_DRIVEN, EXISTING_SITE, HYBRID)")
  .option("--agent <name>", "Coding agent adapter name ('antigravity' | 'mock')", "antigravity")
  .option("--model <model>", "Coding agent model name (default: 'gemini-3.7-flash-high')")
  .option("--effort <effort>", "Thinking/reasoning effort level ('low' | 'medium' | 'high')", "high")
  .option("--auto-approve", "Bypass interactive terminal confirmation and proceed autonomously", false)
  .option("--dry-run", "Generate the complete design plan and agent context without executing coding agent", false)
  .option("--timeout <ms>", "Coding agent execution timeout in milliseconds", (val) => parseInt(val, 10))
  .option("-o, --output <file>", "Save workflow result or JSON report to a file")
  .option("--json", "Output raw JSON representation instead of terminal summary", false)
  .action(async (promptArg: string | undefined, options: any) => {
    try {
      const prompt = promptArg || "";
      const references = options.reference || [];
      const existingUrl = options.url;
      const existingRepoPath = options.dir;
      const workspaceRoot = options.workspace;

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
        logger.error("Please provide a goal prompt, reference screenshot (--reference), or existing site (--url / --dir).");
        process.exitCode = 1;
        return;
      }

      const workflowOptions: WorkflowOptions = {
        prompt,
        references,
        existingUrl,
        existingRepoPath,
        workspaceRoot,
        targetMode,
        agentName: options.agent,
        agentModel: options.model,
        effort: options.effort,
        autoApprove: options.autoApprove,
        dryRun: options.dryRun,
        timeoutMs: options.timeout,
      };

      const result = await WorkflowEngine.run(workflowOptions);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log("\n" + pc.bold(pc.cyan("=== ELEVATE AGENT DIRECTOR WORKFLOW COMPLETE ===")));
        console.log(`Status:    ${result.status === "SUCCESS" ? pc.green("SUCCESS") : result.status === "DRY_RUN" ? pc.cyan("DRY_RUN") : pc.yellow(result.status)}`);
        console.log(`Mode:      ${result.mode}`);
        console.log(`Duration:  ${result.durationMs}ms`);
        console.log(`Workspace: ${result.workspaceRoot}`);
        console.log(`Summary:   ${result.summary}\n`);

        if (result.verification) {
          console.log(pc.bold("Verification Summary:"));
          console.log(`  • Viewports Captured: ${result.verification.viewportsCaptured}`);
          console.log(`  • Findings:           ${result.verification.totalFindings} (${result.verification.criticalFindings} critical)`);
          console.log(`  • Hard Gates Passed:  ${result.verification.hardGatesPassed ? pc.green("YES") : pc.red("NO")}`);
          console.log(`  • Acceptance Criteria Satisfied: ${result.verification.acceptanceCriteriaEvaluations.filter((e) => e.passed).length}/${result.verification.acceptanceCriteriaEvaluations.length}\n`);
        }
      }

      if (options.output) {
        const content = options.output.endsWith(".json")
          ? JSON.stringify(result, null, 2)
          : result.summary;
        await writeFile(options.output, content, "utf8");
        logger.success(`Saved workflow result to ${pc.bold(options.output)}`);
      }

      if (
        result.status === "ERROR" ||
        result.status === "BLOCKED" ||
        result.status === "AGENT_FAILED" ||
        result.status === "AGENT_AUTHENTICATION_REQUIRED" ||
        result.status === "AGENT_TIMEOUT" ||
        result.status === "ROLLBACK"
      ) {
        process.exitCode = 1;
      }
    } catch (err: any) {
      logger.error(`Workflow execution failed: ${err.message}`);
      process.exitCode = 1;
    }
  });

  return command;
}
