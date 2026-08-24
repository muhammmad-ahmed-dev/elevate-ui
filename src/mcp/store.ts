/**
 * Phase 4B: MCP In-Memory Run & Report Store
 */

import type { StoredRun } from "./types.js";
import type { ReportModel } from "../reports/types.js";

export class McpRunStore {
  private runs: Map<string, StoredRun> = new Map();
  private reports: Map<string, ReportModel> = new Map();
  private latestRunId?: string;
  private latestReportId?: string;

  public saveRun(run: StoredRun): void {
    this.runs.set(run.id, run);
    this.latestRunId = run.id;
    if (run.report) {
      this.saveReport(run.report);
    }
  }

  public getRun(id: string): StoredRun | undefined {
    return this.runs.get(id);
  }

  public getLatestRun(): StoredRun | undefined {
    if (!this.latestRunId) return undefined;
    return this.runs.get(this.latestRunId);
  }

  public saveReport(report: ReportModel): void {
    this.reports.set(report.reportId, report);
    this.latestReportId = report.reportId;
  }

  public getReport(id: string): ReportModel | undefined {
    return this.reports.get(id);
  }

  public getLatestReport(): ReportModel | undefined {
    if (!this.latestReportId) return undefined;
    return this.reports.get(this.latestReportId);
  }

  public clear(): void {
    this.runs.clear();
    this.reports.clear();
    this.latestRunId = undefined;
    this.latestReportId = undefined;
  }
}
