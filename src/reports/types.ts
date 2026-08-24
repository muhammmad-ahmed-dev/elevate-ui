/**
 * Phase 4A: Reporting & Visual Diff HTML Report — Type Definitions
 *
 * Normalized, provider-independent data model for Elevate run reports.
 */

import type { Finding, MutationRecommendation } from "../analysis/types.js";
import type { ViewportName } from "../browser/types.js";
import type { VerificationDecision, VerificationGateResult } from "../agent/patch/verify/types.js";
import type { ImproveRunStatus, MultiPassStoppingReason } from "../agent/improve/types.js";

export type ReportType = "audit" | "single-pass" | "multi-pass";

// ---------------------------------------------------------------------------
// Viewport & Screenshot Models
// ---------------------------------------------------------------------------

export interface ReportViewportScreenshot {
  viewport: ViewportName;
  label: string;
  width: number;
  height: number;
  beforePath?: string;
  beforeBase64?: string;
  afterPath?: string;
  afterBase64?: string;
}

// ---------------------------------------------------------------------------
// Per-Pass Mutation Report Details
// ---------------------------------------------------------------------------

export interface ReportPassItem {
  passNumber: number;
  recommendationId: string;
  recommendationProblem: string;
  recommendationAction: string;
  affectedSelector?: string;
  affectedComponents?: string[];
  status: ImproveRunStatus;
  decision?: VerificationDecision;
  filesTouched: string[];
  additions: number;
  deletions: number;
  patchSummary?: string;
  rawDiff?: string;
  pathGuardValid: boolean;
  scopeGuardValid: boolean;
  astGuardValid: boolean;
  hardGatesPassed: boolean;
  hardGates: { name: string; passed: boolean; output: string; durationMs: number }[];
  targetedIssueImproved: boolean;
  newCriticalFindings: number;
  newSeriousFindings: number;
  resolvedFindingsCount: number;
  durationMs: number;
  summary: string;
  rollbackOccurred: boolean;
}

// ---------------------------------------------------------------------------
// Executive Summary
// ---------------------------------------------------------------------------

export interface ReportExecutiveSummary {
  status: ImproveRunStatus;
  decision?: VerificationDecision;
  passesExecuted: number;
  passesAccepted: number;
  passesRolledBack: number;
  stoppingReason?: MultiPassStoppingReason | string;
  totalFindingsBefore: number;
  totalFindingsAfter: number;
  criticalFindingsBefore: number;
  criticalFindingsAfter: number;
  seriousFindingsBefore: number;
  seriousFindingsAfter: number;
  resolvedFindingsCount: number;
  recommendationsConsidered: number;
  recommendationsAccepted: number;
}

// ---------------------------------------------------------------------------
// Complete Normalized Report Model
// ---------------------------------------------------------------------------

export interface ReportModel {
  /** Unique report identifier. */
  reportId: string;

  /** Run type: audit, single-pass, or multi-pass. */
  reportType: ReportType;

  /** Target application URL audited/improved. */
  targetUrl: string;

  /** Timestamp when report was generated (ISO string). */
  timestamp: string;

  /** Total elapsed time for the run in ms. */
  durationMs: number;

  /** High-level executive KPI summary. */
  executiveSummary: ReportExecutiveSummary;

  /** Multi-viewport screenshot comparisons. */
  viewports: ReportViewportScreenshot[];

  /** Initial baseline findings. */
  findingsBaseline: Finding[];

  /** Final state findings (after mutations, or baseline if audit-only). */
  findingsFinal: Finding[];

  /** Synthesized recommendations. */
  recommendations: MutationRecommendation[];

  /** Per-pass mutation history and verification details. */
  passHistory: ReportPassItem[];

  /** Verification gates summary across all passes. */
  verificationGates: VerificationGateResult[];

  /** Critical recovery instructions if any rollback failed. */
  recoveryInstructions?: string[];

  /** Generation metadata. */
  generatorMetadata: {
    version: string;
    generatedAt: string;
    environment: string;
  };
}

// ---------------------------------------------------------------------------
// Report Generation Options
// ---------------------------------------------------------------------------

export interface ReportGeneratorOptions {
  /** Output directory for report files. Default: "./elevate-report". */
  outputDir?: string;

  /** If true, embeds screenshot images directly as base64 in HTML. Default: false. */
  embedImages?: boolean;

  /** Custom title for the report page. */
  title?: string;

  /** Theme mode: "dark" | "light" | "auto". Default: "dark". */
  theme?: "dark" | "light" | "auto";
}

export interface GeneratedReportOutput {
  htmlPath: string;
  jsonPath: string;
  assetsDir: string;
  reportModel: ReportModel;
}
