/**
 * Phase 4B: MCP Resources Unit Tests
 */

import { describe, it, expect } from "vitest";
import { createElevateMcpServer } from "../../src/mcp/server.js";
import type { ReportModel } from "../../src/reports/types.js";

const mockReport: ReportModel = {
  reportId: "rep-resource-test",
  reportType: "multi-pass",
  targetUrl: "http://localhost:3000",
  timestamp: "2026-08-25T00:00:00.000Z",
  durationMs: 1200,
  executiveSummary: {
    status: "SUCCESS",
    passesExecuted: 1,
    passesAccepted: 1,
    passesRolledBack: 0,
    totalFindingsBefore: 1,
    totalFindingsAfter: 0,
    criticalFindingsBefore: 0,
    criticalFindingsAfter: 0,
    seriousFindingsBefore: 1,
    seriousFindingsAfter: 0,
    resolvedFindingsCount: 1,
    recommendationsConsidered: 1,
    recommendationsAccepted: 1,
  },
  viewports: [],
  findingsBaseline: [],
  findingsFinal: [],
  recommendations: [],
  passHistory: [],
  verificationGates: [],
  generatorMetadata: {
    version: "0.1.0",
    generatedAt: "2026-08-25T00:00:00.000Z",
    environment: "Node.js",
  },
};

describe("Phase 4B: MCP Resources", () => {
  it("stores and retrieves runs and reports via McpRunStore", () => {
    const { store } = createElevateMcpServer();

    store.saveReport(mockReport);

    const retrieved = store.getReport("rep-resource-test");
    expect(retrieved).toBeDefined();
    expect(retrieved?.reportId).toBe("rep-resource-test");

    const latest = store.getLatestReport();
    expect(latest?.reportId).toBe("rep-resource-test");
  });

  it("handles missing resource lookups gracefully", () => {
    const { store } = createElevateMcpServer();

    expect(store.getReport("non-existent")).toBeUndefined();
    expect(store.getLatestRun()).toBeUndefined();
  });
});
