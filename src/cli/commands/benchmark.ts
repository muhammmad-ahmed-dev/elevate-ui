/**
 * Phase 4C: CLI Benchmark Command
 *
 * Runs the Elevate benchmark suite across visual defect archetypes.
 */

import { Command } from "commander";
import pc from "picocolors";
import { BenchmarkRunner } from "../../benchmark/runner.js";
import { generateBenchmarkReport } from "../../benchmark/reporter.js";
import { logger } from "../../utils/logger.js";
import type { BenchmarkCategory } from "../../benchmark/types.js";

import { ComparisonRunner } from "../../benchmark/comparison-runner.js";
import { generateComparisonReport } from "../../benchmark/comparison-reporter.js";

interface BenchmarkCliOptions {
  suite?: string;
  case?: string;
  tag?: string;
  category?: string;
  provider?: string;
  agent?: string;
  model?: string;
  effort?: string;
  maxPasses?: string;
  concurrency?: string;
  seed?: string;
  outputDir?: string;
  failFast?: boolean;
  dryRun?: boolean;
}

export function createBenchmarkCommand(): Command {
  const benchmarkCmd = new Command("benchmark")
    .description("Runs reproducible Elevate benchmark suites across visual/layout defect categories")
    .option("--suite <name>", "Name of the benchmark suite", "Elevate Core Visual Benchmark")
    .option("--case <id>", "Run a single benchmark case by ID")
    .option("--tag <tag>", "Filter cases by tag")
    .option("--category <category>", "Filter cases by defect category")
    .option("--provider <provider>", "Provider (mock, antigravity, gemini, claude)", "mock")
    .option("--agent <agent>", "External coding agent adapter (antigravity, mock)")
    .option("--model <model>", "Patch generation or agent model name", "default")
    .option("--effort <level>", "Reasoning effort level (low, medium, high)", "high")
    .option("--max-passes <number>", "Maximum improvement passes per case", "1")
    .option("--concurrency <number>", "Number of concurrent benchmark cases (1-8)", "1")
    .option("--seed <number>", "Random seed for deterministic reproducibility", "42")
    .option("--output-dir <dir>", "Directory to output benchmark reports", "./elevate-report")
    .option("--fail-fast", "Stop suite execution immediately on first failure", false)
    .option("--dry-run", "Run cases in dry-run mode without applying mutations to disk", false)
    .action(async (options: BenchmarkCliOptions) => {
      logger.title("ELEVATE: AUTOMATED BENCHMARK SUITE");

      try {
        const report = await BenchmarkRunner.runSuite({
          suiteName: options.suite,
          caseFilter: options.case,
          tagFilter: options.tag,
          categoryFilter: options.category as BenchmarkCategory | undefined,
          provider: options.provider,
          agentAdapter: options.agent,
          model: options.model,
          effort: options.effort as "low" | "medium" | "high" | undefined,
          maxPasses: options.maxPasses ? parseInt(options.maxPasses, 10) : 1,
          concurrency: options.concurrency ? parseInt(options.concurrency, 10) : 1,
          seed: options.seed ? parseInt(options.seed, 10) : 42,
          outputDir: options.outputDir,
          failFast: Boolean(options.failFast),
          dryRun: Boolean(options.dryRun),
        });

        const paths = await generateBenchmarkReport(report, options.outputDir);

        console.log(`\n${pc.bold("Benchmark Execution Summary:")}`);
        console.log(`  Total Cases:             ${report.totalCases}`);
        console.log(`  Successful:              ${pc.green(String(report.successfulCases))}`);
        console.log(`  Product Failures:        ${report.productFailures > 0 ? pc.red(String(report.productFailures)) : "0"}`);
        console.log(`  Infrastructure Failures: ${report.infrastructureFailures > 0 ? pc.yellow(String(report.infrastructureFailures)) : "0"}`);
        console.log(`  No Actionable:           ${report.noActionable > 0 ? pc.dim(String(report.noActionable)) : "0"}`);
        console.log(`  Safety Failures:         ${report.safetyFailures > 0 ? pc.red(String(report.safetyFailures)) : pc.green("0")}`);
        console.log(`  Regressions:             ${report.regressions > 0 ? pc.yellow(String(report.regressions)) : "0"}`);
        console.log(`  Convergence Rate:        ${pc.cyan(Math.round(report.convergenceRate * 100) + "%")}`);
        console.log(`  HTML Report:             ${pc.bold(paths.htmlPath)}`);
        console.log(`  JSON Report:             ${pc.bold(paths.jsonPath)}\n`);

        if (report.safetyFailures > 0 || (report.failedCases > 0 && options.failFast)) {
          process.exitCode = 1;
        }
      } catch (err: any) {
        logger.error(`Benchmark execution failed: ${err.message}`);
        process.exitCode = 1;
      }
    });

  // -------------------------------------------------------------------------
  // Subcommand: `elevate benchmark compare` (Phase 5A)
  // -------------------------------------------------------------------------
  benchmarkCmd
    .command("compare")
    .description("Run controlled A/B benchmark: AGENT ALONE vs AGENT + ELEVATE across identical fixture snapshots")
    .option("--suite <name>", "Name of the comparison benchmark suite", "Elevate Controlled A/B Benchmark")
    .option("--case <id>", "Run a single comparison case by ID (e.g. 'comp-portfolio-01')")
    .option("--category <category>", "Filter comparison cases by category")
    .option("--agent <agent>", "Coding agent adapter to evaluate ('antigravity' | 'mock')", "antigravity")
    .option("--model <model>", "Coding agent model name (default: 'gemini-3.7-flash-high')")
    .option("--effort <level>", "Reasoning effort level ('low' | 'medium' | 'high')", "high")
    .option("--seed <number>", "Random seed for deterministic reproducibility", "42")
    .option("--output-dir <dir>", "Directory to output comparison reports", "./elevate-benchmark-comparison")
    .option("--fail-fast", "Stop suite execution immediately on first failure", false)
    .option("--dry-run", "Run comparison in dry-run mode without mutating workspaces", false)
    .action(async (options: any, command: Command) => {
      logger.title("ELEVATE: CONTROLLED AGENT-ALONE VS AGENT+ELEVATE BENCHMARK");

      const parentOpts = command?.parent?.opts() || {};
      const cmdOpts = command?.opts() || {};
      const caseId = options.case || cmdOpts.case || parentOpts.case;
      const category = options.category || cmdOpts.category || parentOpts.category;
      const agent = options.agent || cmdOpts.agent || parentOpts.agent || "antigravity";
      const model = options.model || cmdOpts.model || parentOpts.model;
      const effort = (options.effort || cmdOpts.effort || parentOpts.effort || "high") as "low" | "medium" | "high";
      const outputDir = options.outputDir || cmdOpts.outputDir || parentOpts.outputDir || "./elevate-benchmark-comparison";

      try {
        const report = await ComparisonRunner.runSuite({
          suiteName: options.suite || cmdOpts.suite || parentOpts.suite,
          caseFilter: caseId,
          categoryFilter: category,
          agent,
          model,
          effort,
          seed: options.seed ? parseInt(options.seed, 10) : 42,
          outputDir,
          failFast: Boolean(options.failFast || cmdOpts.failFast || parentOpts.failFast),
          dryRun: Boolean(options.dryRun || cmdOpts.dryRun || parentOpts.dryRun),
        });

        const paths = await generateComparisonReport(report, options.outputDir);

        console.log(`\n${pc.bold(pc.cyan("=== CONTROLLED A/B BENCHMARK COMPLETE ==="))}`);
        console.log(`  Total Cases:         ${report.totalCases}`);
        console.log(`  Quality Wins:        ${pc.green(String(report.elevateWins.qualityWins))} Elevate vs ${pc.yellow(String(report.agentAloneWins.qualityWins))} Alone (${report.ties.qualityTies} ties)`);
        console.log(`  Efficiency Wins:     ${pc.cyan(String(report.elevateWins.efficiencyWins))} Elevate vs ${pc.yellow(String(report.agentAloneWins.efficiencyWins))} Alone (${report.ties.efficiencyTies} ties)`);
        console.log(`  Safety Wins:         ${pc.green(String(report.elevateWins.safetyWins))} Elevate vs ${pc.yellow(String(report.agentAloneWins.safetyWins))} Alone (${report.ties.safetyTies} ties)`);
        console.log(`  Time Wins:           ${pc.magenta(String(report.elevateWins.timeWins))} Elevate vs ${pc.yellow(String(report.agentAloneWins.timeWins))} Alone (${report.ties.timeTies} ties)`);
        console.log(`  HTML Comparison:     ${pc.bold(paths.htmlPath)}`);
        console.log(`  JSON Comparison:     ${pc.bold(paths.jsonPath)}\n`);
      } catch (err: any) {
        logger.error(`Benchmark comparison failed: ${err.message}`);
        process.exitCode = 1;
      }
    });

  return benchmarkCmd;
}

