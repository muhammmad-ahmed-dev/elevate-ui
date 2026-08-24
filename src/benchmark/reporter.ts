/**
 * Phase 4C: Benchmark Report Generator (HTML & JSON)
 *
 * Reuses Phase 4A reporting aesthetics to generate self-contained, interactive
 * HTML benchmark summaries and machine-readable JSON reports.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import type { BenchmarkReport } from "./types.js";
import { escapeHtml } from "../reports/renderer.js";

export function renderBenchmarkHtmlReport(report: BenchmarkReport): string {
  const successColor = "#10b981";
  const failColor = "#ef4444";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Elevate Benchmark Report — ${escapeHtml(report.suiteName)}</title>
  <style>
    :root {
      --bg: #090d16;
      --surface: #111827;
      --surface-border: #1f293d;
      --surface-hover: #1b2438;
      --text: #f9fafb;
      --text-muted: #9ca3af;
      --primary: #6366f1;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --radius: 10px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 32px 24px;
    }
    .container { max-width: 1280px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--surface-border);
      flex-wrap: wrap;
      gap: 16px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-logo {
      background: linear-gradient(135deg, #6366f1, #a855f7);
      width: 40px;
      height: 40px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 20px;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 36px;
    }
    .kpi-card {
      background: var(--surface);
      border: 1px solid var(--surface-border);
      border-radius: var(--radius);
      padding: 20px;
    }
    .kpi-label { font-size: 13px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px; font-weight: 600; }
    .kpi-value { font-size: 28px; font-weight: 800; }
    .kpi-subtext { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
    section {
      background: var(--surface);
      border: 1px solid var(--surface-border);
      border-radius: var(--radius);
      padding: 24px;
      margin-bottom: 32px;
    }
    section h2 { font-size: 18px; font-weight: 700; margin-bottom: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 12px 14px; text-align: left; border-bottom: 1px solid var(--surface-border); }
    th { background: #030712; color: var(--text-muted); font-size: 12px; text-transform: uppercase; }
    tr:hover td { background: var(--surface-hover); }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge-success { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #10b981; }
    .badge-danger { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; }
    .badge-warning { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid #f59e0b; }
    .badge-neutral { background: rgba(156, 163, 175, 0.2); color: #9ca3af; }
    footer { text-align: center; font-size: 13px; color: var(--text-muted); margin-top: 40px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div class="brand-logo">E</div>
        <div>
          <h1>${escapeHtml(report.suiteName)}</h1>
          <p>Generated: ${escapeHtml(report.timestamp)} • Seed: <code>${report.reproducibility.randomSeed}</code></p>
        </div>
      </div>
    </header>

    <!-- Executive KPIs -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Convergence Rate</div>
        <div class="kpi-value" style="color: ${report.convergenceRate >= 0.8 ? successColor : failColor};">
          ${Math.round(report.convergenceRate * 100)}%
        </div>
        <div class="kpi-subtext">${report.successfulCases} / ${report.totalCases} cases passed</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Regression Rate</div>
        <div class="kpi-value" style="color: ${report.regressionRate === 0 ? successColor : failColor};">
          ${Math.round(report.regressionRate * 100)}%
        </div>
        <div class="kpi-subtext">${report.regressionsCount} regressions observed</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Safety Failures</div>
        <div class="kpi-value" style="color: ${report.safetyFailures === 0 ? successColor : failColor};">
          ${report.safetyFailures}
        </div>
        <div class="kpi-subtext">Unsafe accepts: ${report.safetySummary.unsafeAcceptCount}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Avg Runtime</div>
        <div class="kpi-value">${Math.round(report.averageDurationMs / 1000)}s</div>
        <div class="kpi-subtext">p50: ${report.productSummary.p50RuntimeMs}ms | p95: ${report.productSummary.p95RuntimeMs}ms</div>
      </div>
    </div>

    <!-- Provider Breakdown -->
    <section>
      <h2>Provider & Model Performance</h2>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Total Runs</th>
            <th>Success Count</th>
            <th>Success Rate</th>
            <th>Avg Duration</th>
            <th>Avg Passes</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(report.providerStats)
            .map(
              ([prov, stats]) => `
            <tr>
              <td><strong>${escapeHtml(prov)}</strong></td>
              <td>${stats.totalRuns}</td>
              <td>${stats.successCount}</td>
              <td><span class="badge ${stats.successRate >= 0.8 ? "badge-success" : "badge-warning"}">${Math.round(stats.successRate * 100)}%</span></td>
              <td>${stats.averageDurationMs}ms</td>
              <td>${stats.averagePasses}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </section>

    <!-- Case Results -->
    <section>
      <h2>Benchmark Case Executions (${report.caseResults.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Case ID & Name</th>
            <th>Category</th>
            <th>Difficulty</th>
            <th>Classification</th>
            <th>Passes</th>
            <th>Duration</th>
            <th>Findings (Before → After)</th>
          </tr>
        </thead>
        <tbody>
          ${report.caseResults
            .map((c) => {
              const badgeClass =
                c.classification === "SUCCESS"
                  ? "badge-success"
                  : c.classification === "SAFETY_FAILURE"
                  ? "badge-danger"
                  : c.classification === "REGRESSION"
                  ? "badge-warning"
                  : "badge-neutral";

              return `
            <tr>
              <td><strong>${escapeHtml(c.caseId)}</strong><br /><small style="color: var(--text-muted);">${escapeHtml(c.caseName)}</small></td>
              <td><code>${escapeHtml(c.category)}</code></td>
              <td>${escapeHtml(c.difficulty)}</td>
              <td><span class="badge ${badgeClass}">${escapeHtml(c.classification)}</span></td>
              <td>${c.passesExecuted} (Accepted: ${c.passesAccepted})</td>
              <td>${c.durationMs}ms</td>
              <td>${c.initialFindings.length} → ${c.finalFindings.length}</td>
            </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </section>

    <footer>
      <p>Elevate Benchmark Framework v${escapeHtml(report.reproducibility.benchmarkVersion)} • Node ${escapeHtml(report.reproducibility.nodeVersion)} • ${escapeHtml(report.reproducibility.platform)}</p>
    </footer>
  </div>
</body>
</html>`;
}

export async function generateBenchmarkReport(
  report: BenchmarkReport,
  outputDir = "./elevate-report"
): Promise<{ htmlPath: string; jsonPath: string }> {
  const resolvedDir = resolve(outputDir);
  await mkdir(resolvedDir, { recursive: true });

  const htmlContent = renderBenchmarkHtmlReport(report);
  const jsonContent = JSON.stringify(report, null, 2);

  const htmlPath = join(resolvedDir, "benchmark-summary.html");
  const jsonPath = join(resolvedDir, "benchmark-report.json");

  await writeFile(htmlPath, htmlContent, "utf8");
  await writeFile(jsonPath, jsonContent, "utf8");

  return { htmlPath, jsonPath };
}
