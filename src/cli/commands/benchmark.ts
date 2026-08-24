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

interface BenchmarkCliOptions {
  suite?: string;
  case?: string;
  tag?: string;
  category?: string;
  provider?: string;
  model?: string;
  maxPasses?: string;
  concurrency?: string;
  seed?: string;
  outputDir?: string;
  failFast?: boolean;
  dryRun?: boolean;
}

export function createBenchmarkCommand(): Command {
  return new Command("benchmark")
    .description("Runs reproducible Elevate benchmark suites across visual/layout defect categories")
    .option("--suite <name>", "Name of the benchmark suite", "Elevate Core Visual Benchmark")
    .option("--case <id>", "Run a single benchmark case by ID")
    .option("--tag <tag>", "Filter cases by tag")
    .option("--category <category>", "Filter cases by defect category")
    .option("--provider <provider>", "Patch generation provider (mock, gemini, claude)", "mock")
    .option("--model <model>", "Patch generation model name", "default")
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
          model: options.model,
          maxPasses: options.maxPasses ? parseInt(options.maxPasses, 10) : 1,
          concurrency: options.concurrency ? parseInt(options.concurrency, 10) : 1,
          seed: options.seed ? parseInt(options.seed, 10) : 42,
          outputDir: options.outputDir,
          failFast: Boolean(options.failFast),
          dryRun: Boolean(options.dryRun),
        });

        const paths = await generateBenchmarkReport(report, options.outputDir);

        console.log(`\n${pc.bold("Benchmark Execution Summary:")}`);
        console.log(`  Total Cases:      ${report.totalCases}`);
        console.log(`  Successful:       ${pc.green(String(report.successfulCases))}`);
        console.log(`  Failed:           ${report.failedCases > 0 ? pc.red(String(report.failedCases)) : "0"}`);
        console.log(`  Safety Failures:  ${report.safetyFailures > 0 ? pc.red(String(report.safetyFailures)) : pc.green("0")}`);
        console.log(`  Regressions:      ${report.regressionsCount > 0 ? pc.yellow(String(report.regressionsCount)) : "0"}`);
        console.log(`  Convergence Rate: ${pc.cyan(Math.round(report.convergenceRate * 100) + "%")}`);
        console.log(`  HTML Report:      ${pc.bold(paths.htmlPath)}`);
        console.log(`  JSON Report:      ${pc.bold(paths.jsonPath)}\n`);

        if (report.safetyFailures > 0 || (report.failedCases > 0 && options.failFast)) {
          process.exitCode = 1;
        }
      } catch (err: any) {
        logger.error(`Benchmark execution failed: ${err.message}`);
        process.exitCode = 1;
      }
    });
}
