/**
 * Phase 5A: Benchmark Comparison Reporter (HTML & JSON)
 *
 * Formats side-by-side comparative benchmark findings into structured JSON
 * and interactive, publication-quality HTML reports.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ComparisonSuiteReport } from "./comparison-types.js";
import { logger } from "../utils/logger.js";

export function formatComparisonHtml(report: ComparisonSuiteReport): string {
  const { suiteName, timestamp, agent, model, totalCases, elevateWins, agentAloneWins, ties, aggregateMetrics, comparisons, reproducibility } = report;

  const casesRows = comparisons
    .map((c) => {
      const qBadge =
        c.dimensionWinners.quality === "WIN"
          ? `<span class="badge win">ELEVATE WIN</span>`
          : c.dimensionWinners.quality === "LOSS"
          ? `<span class="badge loss">ALONE WIN</span>`
          : `<span class="badge tie">TIE</span>`;

      const eBadge =
        c.dimensionWinners.efficiency === "WIN"
          ? `<span class="badge win">ELEVATE WIN</span>`
          : c.dimensionWinners.efficiency === "LOSS"
          ? `<span class="badge loss">ALONE WIN</span>`
          : `<span class="badge tie">TIE</span>`;

      const sBadge =
        c.dimensionWinners.safety === "WIN"
          ? `<span class="badge win">ELEVATE WIN</span>`
          : c.dimensionWinners.safety === "LOSS"
          ? `<span class="badge loss">ALONE WIN</span>`
          : `<span class="badge tie">TIE</span>`;

      const tBadge =
        c.dimensionWinners.time === "WIN"
          ? `<span class="badge win">ELEVATE WIN</span>`
          : c.dimensionWinners.time === "LOSS"
          ? `<span class="badge loss">ALONE WIN</span>`
          : `<span class="badge tie">TIE</span>`;

      return `
      <tr>
        <td class="font-mono font-bold">${c.caseId}</td>
        <td>
          <div class="font-semibold">${c.caseName}</div>
          <div class="text-muted text-xs">${c.category} • ${c.inputMode}</div>
        </td>
        <td class="text-center">
          <div class="stat-pair">
            <span class="alone">${c.baselineRun.resolvedFindingCount}</span> / <span class="elevate">${c.elevateRun.resolvedFindingCount}</span>
          </div>
          <div class="text-xs text-muted">Defects: ${c.baselineRun.finalFindingCount} vs ${c.elevateRun.finalFindingCount}</div>
        </td>
        <td class="text-center">
          <div class="stat-pair">
            <span class="alone">${c.baselineRun.acceptanceCriteriaPassed}/${c.baselineRun.acceptanceCriteriaTotal}</span> /
            <span class="elevate">${c.elevateRun.acceptanceCriteriaPassed}/${c.elevateRun.acceptanceCriteriaTotal}</span>
          </div>
        </td>
        <td class="text-center">
          <div class="stat-pair">
            <span class="alone">${c.baselineRun.totalDurationMs}ms</span> / <span class="elevate">${c.elevateRun.totalDurationMs}ms</span>
          </div>
        </td>
        <td class="text-center">${qBadge}</td>
        <td class="text-center">${eBadge}</td>
        <td class="text-center">${sBadge}</td>
        <td class="text-center">${tBadge}</td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${suiteName} — Elevate A/B Benchmark</title>
  <style>
    :root {
      --bg: #090d16;
      --card: #111827;
      --border: #1f2937;
      --text: #f9fafb;
      --muted: #9ca3af;
      --win: #10b981;
      --loss: #ef4444;
      --tie: #6b7280;
      --elevate: #6366f1;
      --alone: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background-color: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 32px; }
    .container { max-width: 1300px; margin: 0 auto; }
    header { margin-bottom: 32px; border-bottom: 1px solid var(--border); padding-bottom: 24px; }
    h1 { font-size: 28px; font-weight: 800; }
    .meta { color: var(--muted); font-size: 14px; margin-top: 6px; }
    .grid-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
    .card-title { font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); margin-bottom: 8px; font-weight: 600; }
    .card-val { font-size: 32px; font-weight: 800; }
    .card-sub { font-size: 13px; color: var(--muted); margin-top: 4px; }
    .table-container { background: var(--card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; margin-bottom: 32px; }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; }
    th { background: #1a2234; padding: 14px 16px; font-weight: 600; color: #cbd5e1; border-bottom: 1px solid var(--border); font-size: 12px; text-transform: uppercase; }
    td { padding: 16px; border-bottom: 1px solid var(--border); vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, monospace; }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }
    .text-center { text-align: center; }
    .text-xs { font-size: 12px; }
    .text-muted { color: var(--muted); }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .badge.win { background: rgba(16, 185, 129, 0.15); color: var(--win); border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge.loss { background: rgba(239, 68, 68, 0.15); color: var(--loss); border: 1px solid rgba(239, 68, 68, 0.3); }
    .badge.tie { background: rgba(107, 114, 128, 0.15); color: var(--tie); border: 1px solid rgba(107, 114, 128, 0.3); }
    .stat-pair { font-size: 15px; font-weight: 700; }
    .alone { color: var(--alone); }
    .elevate { color: var(--elevate); }
    .legend { display: flex; gap: 20px; font-size: 13px; color: var(--muted); margin-bottom: 16px; align-items: center; }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .dot.alone { background: var(--alone); }
    .dot.elevate { background: var(--elevate); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${suiteName}</h1>
      <div class="meta">
        Agent: <strong>${agent}</strong> (${model}) • Total Cases: <strong>${totalCases}</strong> • Node: ${reproducibility.nodeVersion} • Git: ${reproducibility.gitCommit} • Generated: ${timestamp}
      </div>
    </header>

    <div class="grid-cards">
      <div class="card">
        <div class="card-title">Quality Wins</div>
        <div class="card-val" style="color: var(--win);">${elevateWins.qualityWins} <span class="text-xs text-muted">/ ${totalCases}</span></div>
        <div class="card-sub">${agentAloneWins.qualityWins} Alone Wins • ${ties.qualityTies} Ties</div>
      </div>
      <div class="card">
        <div class="card-title">Efficiency Wins</div>
        <div class="card-val" style="color: var(--elevate);">${elevateWins.efficiencyWins} <span class="text-xs text-muted">/ ${totalCases}</span></div>
        <div class="card-sub">${agentAloneWins.efficiencyWins} Alone Wins • ${ties.efficiencyTies} Ties</div>
      </div>
      <div class="card">
        <div class="card-title">Safety Wins</div>
        <div class="card-val" style="color: var(--win);">${elevateWins.safetyWins} <span class="text-xs text-muted">/ ${totalCases}</span></div>
        <div class="card-sub">${agentAloneWins.safetyWins} Alone Wins • ${ties.safetyTies} Ties</div>
      </div>
      <div class="card">
        <div class="card-title">Time Wins</div>
        <div class="card-val" style="color: var(--alone);">${elevateWins.timeWins} <span class="text-xs text-muted">/ ${totalCases}</span></div>
        <div class="card-sub">${agentAloneWins.timeWins} Alone Wins • ${ties.timeTies} Ties</div>
      </div>
    </div>

    <div class="table-container" style="margin-bottom: 24px;">
      <table>
        <thead>
          <tr>
            <th>Platform Metric</th>
            <th class="text-center"><span class="dot alone"></span> Agent Alone</th>
            <th class="text-center"><span class="dot elevate"></span> Agent + Elevate</th>
            <th class="text-center">Delta / Advantage</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Success Rate</strong></td>
            <td class="text-center">${Math.round(aggregateMetrics.agentAlone.successRate * 100)}%</td>
            <td class="text-center font-bold" style="color: var(--elevate);">${Math.round(aggregateMetrics.agentElevate.successRate * 100)}%</td>
            <td class="text-center font-bold" style="color: ${aggregateMetrics.agentElevate.successRate >= aggregateMetrics.agentAlone.successRate ? "var(--win)" : "var(--loss)"};">
              ${aggregateMetrics.agentElevate.successRate >= aggregateMetrics.agentAlone.successRate ? "+" : ""}${Math.round((aggregateMetrics.agentElevate.successRate - aggregateMetrics.agentAlone.successRate) * 100)}%
            </td>
          </tr>
          <tr>
            <td><strong>Total Resolved Findings</strong></td>
            <td class="text-center">${aggregateMetrics.agentAlone.totalResolvedFindings}</td>
            <td class="text-center font-bold" style="color: var(--elevate);">${aggregateMetrics.agentElevate.totalResolvedFindings}</td>
            <td class="text-center font-bold" style="color: ${aggregateMetrics.agentElevate.totalResolvedFindings >= aggregateMetrics.agentAlone.totalResolvedFindings ? "var(--win)" : "var(--loss)"};">
              +${aggregateMetrics.agentElevate.totalResolvedFindings - aggregateMetrics.agentAlone.totalResolvedFindings}
            </td>
          </tr>
          <tr>
            <td><strong>Total Regressions</strong></td>
            <td class="text-center">${aggregateMetrics.agentAlone.totalRegressions}</td>
            <td class="text-center font-bold" style="color: var(--elevate);">${aggregateMetrics.agentElevate.totalRegressions}</td>
            <td class="text-center font-bold" style="color: ${aggregateMetrics.agentElevate.totalRegressions <= aggregateMetrics.agentAlone.totalRegressions ? "var(--win)" : "var(--loss)"};">
              ${aggregateMetrics.agentElevate.totalRegressions - aggregateMetrics.agentAlone.totalRegressions}
            </td>
          </tr>
          <tr>
            <td><strong>Avg Acceptance Rate</strong></td>
            <td class="text-center">${Math.round(aggregateMetrics.agentAlone.avgAcceptanceRate * 100)}%</td>
            <td class="text-center font-bold" style="color: var(--elevate);">${Math.round(aggregateMetrics.agentElevate.avgAcceptanceRate * 100)}%</td>
            <td class="text-center font-bold" style="color: ${aggregateMetrics.agentElevate.avgAcceptanceRate >= aggregateMetrics.agentAlone.avgAcceptanceRate ? "var(--win)" : "var(--loss)"};">
              +${Math.round((aggregateMetrics.agentElevate.avgAcceptanceRate - aggregateMetrics.agentAlone.avgAcceptanceRate) * 100)}%
            </td>
          </tr>
          <tr>
            <td><strong>Avg Execution Duration</strong></td>
            <td class="text-center">${aggregateMetrics.agentAlone.avgDurationMs}ms</td>
            <td class="text-center font-bold" style="color: var(--elevate);">${aggregateMetrics.agentElevate.avgDurationMs}ms</td>
            <td class="text-center font-bold text-muted">
              ${aggregateMetrics.agentElevate.avgDurationMs - aggregateMetrics.agentAlone.avgDurationMs > 0 ? "+" : ""}${aggregateMetrics.agentElevate.avgDurationMs - aggregateMetrics.agentAlone.avgDurationMs}ms
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="legend">
      <div class="legend-item"><span class="dot alone"></span> <strong>Amber:</strong> Agent Alone (Baseline)</div>
      <div class="legend-item"><span class="dot elevate"></span> <strong>Indigo:</strong> Agent + Elevate</div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Case ID</th>
            <th>Task & Input Mode</th>
            <th class="text-center">Resolved Findings (Alone / Elevate)</th>
            <th class="text-center">Acceptance Criteria</th>
            <th class="text-center">Duration</th>
            <th class="text-center">Quality</th>
            <th class="text-center">Efficiency</th>
            <th class="text-center">Safety</th>
            <th class="text-center">Time</th>
          </tr>
        </thead>
        <tbody>
          ${casesRows}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}

export async function generateComparisonReport(
  report: ComparisonSuiteReport,
  customOutputDir?: string
): Promise<{ jsonPath: string; htmlPath: string }> {
  const outputDir = resolve(customOutputDir || "./elevate-benchmark-comparison");
  await mkdir(outputDir, { recursive: true });

  const jsonPath = join(outputDir, "benchmark-comparison.json");
  const htmlPath = join(outputDir, "benchmark-comparison.html");

  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  const htmlContent = formatComparisonHtml(report);
  await writeFile(htmlPath, htmlContent, "utf8");

  logger.success(`✔ Saved benchmark comparison JSON to ${jsonPath}`);
  logger.success(`✔ Saved benchmark comparison HTML to ${htmlPath}`);

  return { jsonPath, htmlPath };
}
