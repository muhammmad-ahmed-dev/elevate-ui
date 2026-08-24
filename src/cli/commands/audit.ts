import { Command } from "commander";
import { BrowserRunner } from "../../browser/runner.js";
import { GitManager } from "../../safety/git.js";
import { DEFAULT_CONFIG } from "../../utils/config.js";
import { logger } from "../../utils/logger.js";
import { RuleEvaluator } from "../../analysis/deterministic/evaluator.js";
import { VisualEvaluator } from "../../analysis/heuristic/evaluator.js";
import { FindingNormalizer } from "../../analysis/normalization.js";
import { FindingDeduplicator } from "../../analysis/deduplication.js";
import { FindingPrioritizer } from "../../analysis/prioritization.js";
import { IssueSynthesizer } from "../../analysis/synthesis.js";
import type { AnalysisResult } from "../../analysis/types.js";
import pc from "picocolors";

export interface AuditCommandOptions {
  screenshotsDir?: string;
  visionProvider?: string;
  visionModel?: string;
  skipVision?: boolean;
}

export async function runAuditPipeline(
  url: string,
  options: AuditCommandOptions = {}
): Promise<AnalysisResult> {
  const startTime = Date.now();

  // 1. Perception & Multi-viewport capture
  const runner = new BrowserRunner({
    screenshotDir: options.screenshotsDir,
  });

  try {
    const captureResult = await runner.captureAllViewports(url);

    // 2. Deterministic analysis
    const ruleEvaluator = new RuleEvaluator();
    const deterministicFindings = await ruleEvaluator.evaluateMultiViewport(captureResult);

    // 3. Multimodal heuristic visual analysis
    const visualEvaluator = new VisualEvaluator({
      providerName: options.visionProvider,
      model: options.visionModel,
      enabled: !options.skipVision,
    });
    const visualResult = await visualEvaluator.evaluateVisual(url, captureResult, deterministicFindings);
    const heuristicFindings = visualResult.findings;

    // 4. Normalization
    const allRaw = [...deterministicFindings, ...heuristicFindings];
    const normalizedFindings = FindingNormalizer.normalize(allRaw);

    // 5. Deduplication
    const deduplicatedFindings = FindingDeduplicator.deduplicate(normalizedFindings);

    // 6. Prioritization
    const prioritizedFindings = FindingPrioritizer.prioritize(deduplicatedFindings);

    // 7. Synthesis into 3-5 Mutation Recommendations
    const recommendations = IssueSynthesizer.synthesize(prioritizedFindings, 5, 3);

    const viewports = Object.values(captureResult.captures).map((c) => c.viewport);

    return {
      runMetadata: {
        timestamp: startTime,
        targetUrl: url,
        durationMs: Date.now() - startTime,
        visionProvider: options.visionProvider,
        visionModel: options.visionModel,
      },
      viewportMetadata: viewports,
      deterministicFindings,
      heuristicFindings,
      normalizedFindings,
      deduplicatedFindings,
      prioritizedFindings,
      recommendations,
      errors: visualResult.errors,
    };
  } finally {
    await runner.close();
  }
}

export function createAuditCommand(): Command {
  return new Command("audit")
    .description("Performs multi-viewport perception, deterministic analysis, visual heuristic evaluation, and recommendation synthesis")
    .argument("[url]", "Target local dev server URL", DEFAULT_CONFIG.targetUrl)
    .option("-s, --screenshots-dir <dir>", "Directory to save captured screenshots", "./elevate-report/screenshots")
    .option("--vision-provider <provider>", "Vision provider (gemini, claude, mock)")
    .option("--vision-model <model>", "Vision model name")
    .option("--skip-vision", "Skip multimodal vision evaluation (run deterministic checks only)")
    .action(async (url: string, options: AuditCommandOptions) => {
      logger.title("ELEVATE: AUDIT & SYNTHESIS PASS");

      // 1. Git Safety Guardrail Check
      const git = new GitManager();
      const status = await git.getStatus();
      if (!status.isRepo) {
        logger.warn("Project is not tracked by Git. Elevate safety guarantees require Git.");
      } else {
        logger.info(`Git repository active. Current branch: ${status.branch} (${status.headCommit.slice(0, 7)})`);
      }

      try {
        const result = await runAuditPipeline(url, options);

        logger.title("AUDIT FINDINGS SUMMARY");
        console.log(`Target: ${url}`);
        console.log(`Total Normalized Findings: ${result.normalizedFindings.length}`);
        console.log(`Deduplicated Findings: ${result.deduplicatedFindings.length}`);
        console.log(`- Deterministic Issues: ${result.deterministicFindings.length}`);
        console.log(`- Heuristic Issues: ${result.heuristicFindings.length}`);

        if (result.prioritizedFindings.length > 0) {
          console.log("\n" + pc.bold("Top Prioritized Findings:"));
          for (const item of result.prioritizedFindings.slice(0, 8)) {
            const sevBadge = item.finding.severity === "critical"
              ? pc.red("[CRITICAL]")
              : item.finding.severity === "serious"
              ? pc.yellow("[SERIOUS]")
              : pc.blue(`[${item.finding.severity.toUpperCase()}]`);

            console.log(`  ${pc.dim(`#${item.rank}`)} ${sevBadge} ${pc.bold(item.finding.title)} (${item.finding.viewport})`);
            console.log(`     ${pc.dim("Selector:")} ${item.finding.selector || "N/A"}`);
            console.log(`     ${pc.dim("Rationale:")} ${item.rationale}`);
          }
        }

        logger.title("SYNTHESIZED MUTATION RECOMMENDATIONS (3-5)");
        if (result.recommendations.length === 0) {
          logger.success("No actionable issues identified. The layout passes all deterministic and heuristic quality bars!");
        } else {
          for (const [idx, rec] of result.recommendations.entries()) {
            console.log(`\n${pc.bold(pc.cyan(`Recommendation ${idx + 1}: ${rec.id}`))}`);
            console.log(`  ${pc.bold("Problem:")} ${rec.problem}`);
            console.log(`  ${pc.bold("Action:")} ${rec.proposedImprovement}`);
            console.log(`  ${pc.bold("Target Selector:")} ${rec.affectedSelector || "General layout"}`);
            console.log(`  ${pc.bold("Affected Viewports:")} ${rec.affectedViewports.join(", ")}`);
            console.log(`  ${pc.bold("Estimated Scope:")} ${rec.estimatedMutationScope} (Risk: ${rec.risk})`);
            console.log(`  ${pc.bold("Confidence:")} ${Math.round(rec.confidence * 100)}%`);
          }
        }

        console.log(`\nAudit completed in ${result.runMetadata.durationMs}ms.\n`);
      } catch (err: any) {
        logger.error(`Audit failed: ${err.message}`);
        process.exitCode = 1;
      }
    });
}
