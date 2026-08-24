/**
 * Phase 4A: HTML & JSON Report Renderer
 *
 * Generates self-contained, interactive HTML reports (summary.html) and
 * machine-readable structured JSON reports (report.json).
 */

import type { ReportModel, ReportGeneratorOptions } from "./types.js";

/**
 * Escapes HTML characters to prevent XSS.
 */
export function escapeHtml(str?: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Colorizes unified diff text into styled HTML markup.
 */
export function renderDiffHtml(rawDiff?: string): string {
  if (!rawDiff) return "<div class=\"empty-diff\">No diff content available.</div>";

  const lines = rawDiff.split("\n");
  const rendered = lines.map((line) => {
    const escaped = escapeHtml(line);
    if (line.startsWith("+") && !line.startsWith("+++")) {
      return `<div class="diff-line diff-add">${escaped}</div>`;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      return `<div class="diff-line diff-del">${escaped}</div>`;
    } else if (line.startsWith("@@")) {
      return `<div class="diff-line diff-hunk">${escaped}</div>`;
    } else {
      return `<div class="diff-line diff-ctx">${escaped}</div>`;
    }
  });

  return `<pre class="diff-container"><code>${rendered.join("")}</code></pre>`;
}

/**
 * Renders complete self-contained HTML report.
 */
export function renderHtmlReport(
  model: ReportModel,
  options: ReportGeneratorOptions = {}
): string {
  const title = options.title || `Elevate Report — ${model.targetUrl}`;
  const statusColor =
    model.executiveSummary.status === "SUCCESS"
      ? "#10b981"
      : model.executiveSummary.status === "ROLLED_BACK"
      ? "#f59e0b"
      : model.executiveSummary.status === "DRY_RUN"
      ? "#3b82f6"
      : "#ef4444";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
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
      --info: #38bdf8;
      --code-bg: #030712;
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
    .title-group h1 { font-size: 22px; font-weight: 700; }
    .title-group p { font-size: 14px; color: var(--text-muted); }
    .status-badge {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid currentColor;
    }

    /* KPI Cards */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
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

    /* Sections */
    section {
      background: var(--surface);
      border: 1px solid var(--surface-border);
      border-radius: var(--radius);
      padding: 24px;
      margin-bottom: 32px;
    }
    section h2 {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 18px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    /* Visual Diff Side-by-Side */
    .viewport-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 24px;
    }
    .viewport-card {
      background: var(--code-bg);
      border: 1px solid var(--surface-border);
      border-radius: var(--radius);
      padding: 16px;
    }
    .viewport-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      font-weight: 600;
      font-size: 14px;
      color: var(--text);
    }
    .diff-sides {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    @media (max-width: 768px) {
      .diff-sides { grid-template-columns: 1fr; }
    }
    .diff-pane {
      background: #000;
      border: 1px solid var(--surface-border);
      border-radius: 6px;
      padding: 10px;
      text-align: center;
    }
    .diff-pane-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 8px;
      color: var(--text-muted);
    }
    .diff-img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      border: 1px solid var(--surface-border);
    }
    .diff-placeholder {
      padding: 48px 16px;
      font-size: 13px;
      color: var(--text-muted);
      background: #0d1117;
      border: 1px dashed var(--surface-border);
      border-radius: 4px;
    }

    /* Findings Table */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      padding: 12px 14px;
      text-align: left;
      border-bottom: 1px solid var(--surface-border);
    }
    th {
      background: var(--code-bg);
      font-weight: 600;
      color: var(--text-muted);
      font-size: 12px;
      text-transform: uppercase;
    }
    tr:hover td { background: var(--surface-hover); }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge-critical { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; }
    .badge-serious { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid #f59e0b; }
    .badge-moderate { background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid #38bdf8; }
    .badge-minor { background: rgba(156, 163, 175, 0.2); color: #9ca3af; }
    .badge-success { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #10b981; }

    /* Recommendations & Pass Timeline */
    .rec-card, .pass-card {
      background: var(--code-bg);
      border: 1px solid var(--surface-border);
      border-radius: var(--radius);
      padding: 18px;
      margin-bottom: 16px;
    }
    .rec-card-header, .pass-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .diff-container {
      background: #000;
      border: 1px solid var(--surface-border);
      border-radius: 6px;
      padding: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      overflow-x: auto;
      margin-top: 12px;
    }
    .diff-line { line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
    .diff-add { color: #4ade80; background: rgba(74, 222, 128, 0.08); }
    .diff-del { color: #f87171; background: rgba(248, 113, 113, 0.08); }
    .diff-hunk { color: #38bdf8; font-weight: 700; }
    .diff-ctx { color: #9ca3af; }

    .checklist { list-style: none; margin: 10px 0; font-size: 13px; }
    .checklist li { margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
    .check-pass { color: var(--success); }
    .check-fail { color: var(--danger); }

    footer {
      text-align: center;
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 40px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div class="brand-logo">E</div>
        <div class="title-group">
          <h1>Elevate Visual Refinement Report</h1>
          <p>Target: <code>${escapeHtml(model.targetUrl)}</code> • Generated: ${escapeHtml(model.timestamp)}</p>
        </div>
      </div>
      <div>
        <span class="status-badge" style="color: ${statusColor};">
          ${escapeHtml(model.executiveSummary.status)}
        </span>
      </div>
    </header>

    <!-- Executive KPIs -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Run Outcome</div>
        <div class="kpi-value" style="color: ${statusColor}; font-size: 20px;">
          ${escapeHtml(model.executiveSummary.status)}
        </div>
        <div class="kpi-subtext">${escapeHtml(model.executiveSummary.stoppingReason || "Completed")}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Passes Executed</div>
        <div class="kpi-value">
          ${model.executiveSummary.passesExecuted}
        </div>
        <div class="kpi-subtext">Accepted: ${model.executiveSummary.passesAccepted} | Rolled Back: ${model.executiveSummary.passesRolledBack}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Findings Resolved</div>
        <div class="kpi-value" style="color: var(--success);">
          ${model.executiveSummary.resolvedFindingsCount}
        </div>
        <div class="kpi-subtext">Before: ${model.executiveSummary.totalFindingsBefore} → After: ${model.executiveSummary.totalFindingsAfter}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Execution Time</div>
        <div class="kpi-value">${Math.round(model.durationMs / 1000)}s</div>
        <div class="kpi-subtext">${model.durationMs}ms elapsed</div>
      </div>
    </div>

    <!-- Visual Diff Section -->
    <section>
      <h2>Visual Comparison Across Viewports</h2>
      <div class="viewport-grid">
        ${model.viewports
          .map((vp) => {
            const beforeSrc = vp.beforeBase64 || vp.beforePath;
            const afterSrc = vp.afterBase64 || vp.afterPath;

            return `
          <div class="viewport-card">
            <div class="viewport-header">
              <span>${escapeHtml(vp.label)} (${vp.width}x${vp.height}px)</span>
            </div>
            <div class="diff-sides">
              <div class="diff-pane">
                <div class="diff-pane-title">Before Mutation</div>
                ${
                  beforeSrc
                    ? `<img class="diff-img" src="${escapeHtml(beforeSrc)}" alt="Before ${vp.viewport}" />`
                    : `<div class="diff-placeholder">No baseline screenshot captured</div>`
                }
              </div>
              <div class="diff-pane">
                <div class="diff-pane-title">After Mutation</div>
                ${
                  afterSrc
                    ? `<img class="diff-img" src="${escapeHtml(afterSrc)}" alt="After ${vp.viewport}" />`
                    : `<div class="diff-placeholder">No post-mutation screenshot captured</div>`
                }
              </div>
            </div>
          </div>`;
          })
          .join("")}
      </div>
    </section>

    <!-- Findings Section -->
    <section>
      <h2>Audit Findings (${model.findingsFinal.length})</h2>
      ${
        model.findingsFinal.length === 0
          ? `<p style="color: var(--success); font-weight: 600;">✓ No visual, accessibility, or layout defects detected!</p>`
          : `<table>
        <thead>
          <tr>
            <th>Severity</th>
            <th>Category</th>
            <th>Title & Selector</th>
            <th>Viewport</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          ${model.findingsFinal
            .map((f) => {
              const badgeClass =
                f.severity === "critical"
                  ? "badge-critical"
                  : f.severity === "serious"
                  ? "badge-serious"
                  : f.severity === "moderate"
                  ? "badge-moderate"
                  : "badge-minor";

              return `
            <tr>
              <td><span class="badge ${badgeClass}">${escapeHtml(f.severity)}</span></td>
              <td><code>${escapeHtml(f.category)}</code></td>
              <td>
                <strong>${escapeHtml(f.title)}</strong><br />
                <small style="color: var(--text-muted);">${escapeHtml(f.description)}</small>
                ${f.selector ? `<br /><code style="font-size: 11px;">${escapeHtml(f.selector)}</code>` : ""}
              </td>
              <td>${escapeHtml(f.viewport)}</td>
              <td>${Math.round((f.confidence ?? 1) * 100)}%</td>
            </tr>`;
            })
            .join("")}
        </tbody>
      </table>`
      }
    </section>

    <!-- Recommendations Section -->
    <section>
      <h2>Synthesized Recommendations (${model.recommendations.length})</h2>
      ${
        model.recommendations.length === 0
          ? `<p style="color: var(--text-muted);">No recommendations synthesized.</p>`
          : model.recommendations
              .map(
                (r) => `
        <div class="rec-card">
          <div class="rec-card-header">
            <strong>${escapeHtml(r.id)}</strong>
            <span class="badge ${r.risk === "low" ? "badge-success" : r.risk === "medium" ? "badge-serious" : "badge-critical"}">
              Risk: ${escapeHtml(r.risk)}
            </span>
          </div>
          <p><strong>Problem:</strong> ${escapeHtml(r.problem)}</p>
          <p><strong>Improvement:</strong> ${escapeHtml(r.proposedImprovement)}</p>
          ${r.affectedSelector ? `<p style="margin-top: 4px;"><small>Selector: <code>${escapeHtml(r.affectedSelector)}</code></small></p>` : ""}
        </div>`
              )
              .join("")
      }
    </section>

    <!-- Mutation Pass History -->
    ${
      model.passHistory.length > 0
        ? `<section>
      <h2>Mutation Pass History (${model.passHistory.length})</h2>
      ${model.passHistory
        .map(
          (p) => `
        <div class="pass-card">
          <div class="pass-card-header">
            <h3>Pass ${p.passNumber}: ${escapeHtml(p.recommendationId)}</h3>
            <span class="badge ${p.status === "SUCCESS" ? "badge-success" : p.status === "ROLLED_BACK" ? "badge-serious" : "badge-critical"}">
              ${escapeHtml(p.status)}
            </span>
          </div>
          <p><strong>Action:</strong> ${escapeHtml(p.recommendationAction)}</p>
          <p><strong>Changes:</strong> ${p.filesTouched.length} file(s) modified (${p.additions > 0 ? `<span style="color:#4ade80;">+${p.additions}</span>` : ""} / ${p.deletions > 0 ? `<span style="color:#f87171;">-${p.deletions}</span>` : ""})</p>
          
          <ul class="checklist">
            <li><span class="${p.pathGuardValid ? "check-pass" : "check-fail"}">${p.pathGuardValid ? "✓" : "✗"}</span> Protected Paths Guard</li>
            <li><span class="${p.scopeGuardValid ? "check-pass" : "check-fail"}">${p.scopeGuardValid ? "✓" : "✗"}</span> Scope Boundary Limits</li>
            <li><span class="${p.astGuardValid ? "check-pass" : "check-fail"}">${p.astGuardValid ? "✓" : "✗"}</span> AST & Hook Restrictions</li>
            <li><span class="${p.hardGatesPassed ? "check-pass" : "check-fail"}">${p.hardGatesPassed ? "✓" : "✗"}</span> Hard Verification Gates (TypeScript & Build)</li>
          </ul>

          ${p.rawDiff ? renderDiffHtml(p.rawDiff) : ""}
        </div>`
        )
        .join("")}
    </section>`
        : ""
    }

    <!-- Verification Gates Summary -->
    ${
      model.verificationGates.length > 0
        ? `<section>
      <h2>Verification Gates Breakdown</h2>
      <table>
        <thead>
          <tr>
            <th>Gate</th>
            <th>Result</th>
            <th>Duration</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          ${model.verificationGates
            .map(
              (g) => `
            <tr>
              <td><strong>${escapeHtml(g.name)}</strong></td>
              <td><span class="badge ${g.passed ? "badge-success" : "badge-critical"}">${g.passed ? "PASSED" : "FAILED"}</span></td>
              <td>${g.durationMs}ms</td>
              <td><small style="color: var(--text-muted); font-family: monospace;">${escapeHtml(g.output ? g.output.slice(0, 100) : "OK")}</small></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </section>`
        : ""
    }

    ${
      model.recoveryInstructions && model.recoveryInstructions.length > 0
        ? `<section style="border-color: var(--danger);">
      <h2 style="color: var(--danger);">Critical Recovery Instructions</h2>
      <ul style="margin-left: 20px; color: #f87171;">
        ${model.recoveryInstructions.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}
      </ul>
    </section>`
        : ""
    }

    <footer>
      <p>Elevate UI Refinement Engine • Generated at ${escapeHtml(model.generatorMetadata.generatedAt)}</p>
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Renders formatted JSON report string.
 */
export function renderJsonReport(model: ReportModel): string {
  return JSON.stringify(model, null, 2);
}
