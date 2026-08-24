/**
 * Phase 4B: Model Context Protocol (MCP) — Type Definitions
 */

import type { AnalysisResult } from "../analysis/types.js";
import type { MultiPassImproveResult, ImproveRunResult } from "../agent/improve/types.js";
import type { ReportModel } from "../reports/types.js";

export type McpExecutionStatus =
  | "SUCCESS"
  | "CANCELLED"
  | "DRY_RUN"
  | "NO_ACTIONABLE_IMPROVEMENT"
  | "AMBIGUOUS_TARGET"
  | "PATCH_REJECTED"
  | "MUTATION_FAILED"
  | "VERIFICATION_FAILED"
  | "ROLLED_BACK"
  | "ERROR"
  | "BLOCKED"
  | "APPROVAL_REQUIRED";

export interface McpToolResponse {
  status: McpExecutionStatus;
  runId?: string;
  summary: string;
  details?: Record<string, any>;
  reportPath?: string;
  jsonPath?: string;
  stoppingReason?: string;
  error?: string;
}

export type StoredRun =
  | { type: "audit"; id: string; timestamp: number; data: AnalysisResult; report?: ReportModel }
  | { type: "single-pass"; id: string; timestamp: number; data: ImproveRunResult; report?: ReportModel }
  | { type: "multi-pass"; id: string; timestamp: number; data: MultiPassImproveResult; report?: ReportModel };

export interface McpServerOptions {
  projectRoot?: string;
  defaultTargetUrl?: string;
}
