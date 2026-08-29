/**
 * Phase 4C: Benchmark & Automated Evaluation Framework — Type Definitions
 */

import type { Finding } from "../analysis/types.js";
import type { ImproveRunStatus, MultiPassStoppingReason } from "../agent/improve/types.js";

export type BenchmarkCategory =
  | "accessibility"
  | "typography"
  | "spacing"
  | "layout"
  | "responsive"
  | "cta-hierarchy"
  | "broken-images"
  | "touch-targets"
  | "heading-structure"
  | "horizontal-overflow"
  | "visual-hierarchy"
  | "negative-space"
  | "responsive-composition";

export type BenchmarkDifficulty = "easy" | "medium" | "hard";

export type BenchmarkCaseClassification =
  | "SUCCESS"                   // Target issue resolved/improved with hard gates passed & no regression
  | "PRODUCT_FAILURE"           // Elevate failed to resolve or produce valid patch
  | "SAFETY_FAILURE"            // Transaction or safety invariant breached
  | "EXPECTED_REJECTION"        // Expected rejection (e.g. protected path or invalid patch correctly caught)
  | "NO_ACTIONABLE"             // No actionable issues identified on clean baseline
  | "REGRESSION"                // Mutation introduced unacceptable new regressions
  | "INFRASTRUCTURE_FAILURE";   // Provisioning, process start, or filesystem failure

export interface BenchmarkCase {
  id: string;
  name: string;
  category: BenchmarkCategory;
  framework: "nextjs" | "react" | "vanilla" | "html";
  difficulty: BenchmarkDifficulty;
  tags: string[];
  expectedIssueTypes: string[];
  expectedFiles: string[];
  description: string;
  componentCode: string;
  componentPath: string;
  targetSelector?: string;
  mockPatchOverride?: string;
  mockImprovement?: string;
}

export interface BenchmarkSafetyMetrics {
  rollbackCorrectness: boolean;
  protectedPathViolations: number;
  outOfScopeMutations: number;
  stagedStatePreserved: boolean;
  untrackedFilesPreserved: boolean;
  buildRegressions: number;
  runtimeFailures: number;
  orphanProcesses: number;
  unsafeAccepts: number;
}

export interface BenchmarkUsageMetadata {
  inputTokens?: number;
  outputTokens?: number;
  requestCount?: number;
  latencyMs?: number;
}

export interface BenchmarkRun {
  runId: string;
  caseId: string;
  caseName: string;
  category: BenchmarkCategory;
  difficulty: BenchmarkDifficulty;
  provider: string;
  model: string;
  maxPasses: number;
  startTime: number;
  endTime: number;
  durationMs: number;
  initialFindings: Finding[];
  finalFindings: Finding[];
  passesExecuted: number;
  passesAccepted: number;
  passesRolledBack: number;
  regressions: number;
  resolvedFindings: number;
  stoppingReason: MultiPassStoppingReason | string;
  finalStatus: ImproveRunStatus;
  classification: BenchmarkCaseClassification;
  safetyMetrics: BenchmarkSafetyMetrics;
  usageMetadata?: BenchmarkUsageMetadata;
  errorMessage?: string;
}

export interface BenchmarkReport {
  reportId: string;
  timestamp: string;
  suiteName: string;
  totalCases: number;
  successfulCases: number;
  failedCases: number;
  productFailures: number;
  safetyFailures: number;
  regressionsCount: number;
  regressions: number;
  infrastructureFailures: number;
  noActionableCases: number;
  noActionable: number;
  rolledBackCases: number;
  averagePasses: number;
  averageDurationMs: number;
  issueResolutionRate: number;
  regressionRate: number;
  convergenceRate: number;
  safetySummary: {
    rollbackCorrectnessRate: number;
    protectedPathViolationRate: number;
    outOfScopeMutationRate: number;
    stagedStatePreservationRate: number;
    untrackedFilePreservationRate: number;
    buildRegressionRate: number;
    runtimeFailureRate: number;
    orphanProcessRate: number;
    unsafeAcceptCount: number;
  };
  productSummary: {
    passAcceptanceRate: number;
    repeatedRecommendationRate: number;
    noNetProgressRate: number;
    p50RuntimeMs: number;
    p95RuntimeMs: number;
    beforeTotalFindings: number;
    afterTotalFindings: number;
    beforeCriticalFindings: number;
    afterCriticalFindings: number;
    beforeSeriousFindings: number;
    afterSeriousFindings: number;
  };
  providerStats: Record<
    string,
    {
      totalRuns: number;
      successCount: number;
      successRate: number;
      averageDurationMs: number;
      averagePasses: number;
    }
  >;
  modelStats: Record<
    string,
    {
      totalRuns: number;
      successCount: number;
      successRate: number;
      averageDurationMs: number;
    }
  >;
  caseResults: BenchmarkRun[];
  reproducibility: {
    benchmarkVersion: string;
    fixtureVersion: string;
    randomSeed: number;
    gitCommit: string;
    nodeVersion: string;
    platform: string;
    timestamp: string;
  };
}

export interface BenchmarkSuiteOptions {
  suiteName?: string;
  caseFilter?: string;
  tagFilter?: string;
  categoryFilter?: BenchmarkCategory;
  provider?: string;
  model?: string;
  maxPasses?: number;
  concurrency?: number;
  seed?: number;
  agentAdapter?: string;
  effort?: "low" | "medium" | "high";
  timeoutMs?: number;
  outputDir?: string;
  failFast?: boolean;
  dryRun?: boolean;
}
