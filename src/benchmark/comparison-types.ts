/**
 * Phase 5A & 5B: Agent-Alone vs Agent+Elevate Comparison — Type Definitions
 *
 * Defines the data contracts, metrics models, build validity evaluations,
 * and comparison report shapes for controlled A/B evaluation between baseline
 * coding agents and Elevate.
 */

import type { BenchmarkCaseClassification } from "./types.js";
import type { Finding } from "../analysis/types.js";
import type { InputMode } from "../agent/design/types.js";

export type ComparisonRunMode = "AGENT_ALONE" | "AGENT_ELEVATE";

export type TokenMeasurementStatus = "MEASURED" | "ESTIMATED" | "UNAVAILABLE";

export type DimensionOutcome = "WIN" | "TIE" | "LOSS";

/**
 * Effective high-level product build outcome.
 * Prevents empty or stub builds with 0 DOM findings from falsely ranking as higher quality.
 */
export type EffectiveOutcome =
  | "INVALID_BUILD"
  | "VALID_BUILD"
  | "VALID_BUILD_IMPROVED"
  | "VALID_BUILD_REGRESSED"
  | "INFRASTRUCTURE_FAILURE"
  | "SAFETY_FAILURE";

/**
 * Task-level structural expectations for non-leaking build validity verification.
 */
export interface TaskExpectedSignals {
  /** Expected logical sections (e.g. ['hero', 'projects', 'contact', 'pricing']). */
  expectedSections?: string[];

  /** Expected domain keywords that should be present in rendered content. */
  expectedKeywords?: string[];

  /** Minimum number of meaningful components / sections expected. */
  minComponentCount?: number;

  /** Minimum number of interactive elements (buttons, inputs, links). */
  minInteractiveElements?: number;

  /** Minimum text content length in characters across the rendered page. */
  minTextLength?: number;
}

/**
 * Detailed DOM and build validity evaluation result.
 */
export interface BuildValidityResult {
  /** Whether the ephemeral preview server booted successfully. */
  serverStarted: boolean;

  /** Whether HTTP GET to the preview route returned HTTP 200. */
  routeReachable: boolean;

  /** Whether valid HTML content was returned in response. */
  htmlReturned: boolean;

  /** Whether an HTML <body> element with child nodes is present. */
  bodyPresent: boolean;

  /** Whether the rendered DOM contains non-trivial, meaningful structure. */
  meaningfulDomPresent: boolean;

  /** Whether task-specific structural signals (sections/keywords) are satisfied. */
  expectedStructurePresent: boolean;

  /** Rendered DOM content density metrics. */
  contentDensity: {
    textLength: number;
    elementCount: number;
    interactiveCount: number;
    sectionCount: number;
    headingCount: number;
  };

  /** Whether the rendered page is blank or whitespace-only. */
  blankPageDetected: boolean;

  /** Whether the rendered page is an unrendered stub or generic placeholder. */
  stubPageDetected: boolean;

  /** Uncaught server/runtime errors observed during execution. */
  runtimeErrors: string[];

  /** Browser console error messages captured by Playwright. */
  browserConsoleErrors: string[];

  /** Overall boolean: true if and only if the build is functioning and meaningful. */
  buildValid: boolean;

  /** Effective product outcome classification. */
  effectiveOutcome: EffectiveOutcome;

  /** Human-readable explanation of the validity classification. */
  reason: string;

  /** List of expected sections found in the rendered DOM. */
  matchedSections: string[];

  /** List of expected sections missing from the rendered DOM. */
  missingSections: string[];

  /** List of expected domain keywords found in the rendered DOM. */
  matchedKeywords: string[];
}

/**
 * Execution metrics captured from an individual benchmark run.
 */
export interface ComparisonExecutionMetrics {
  /** Execution mode of this run. */
  mode: ComparisonRunMode;

  /** Total elapsed execution duration in milliseconds. */
  totalDurationMs: number;

  /** Time spent by the coding agent executing tasks in milliseconds. */
  agentDurationMs: number;

  /** Time spent in planning / context building in milliseconds (0 for Agent-Alone). */
  planningDurationMs: number;

  /** Time spent running multi-viewport browser perception and audit in milliseconds. */
  verificationDurationMs: number;

  /** Number of agent execution turns if exposed by the provider. */
  agentTurnCount?: number;

  /** Estimated context tokens passed to the agent prompt. */
  estimatedContextTokens: number;

  /** Exact input tokens reported by provider API (if available). */
  actualInputTokens?: number;

  /** Exact output tokens reported by provider API (if available). */
  actualOutputTokens?: number;

  /** Token measurement status classification. */
  tokenStatus: TokenMeasurementStatus;

  /** Number of files created or modified on disk. */
  filesChanged: number;

  /** Number of lines added. */
  linesAdded: number;

  /** Number of lines deleted. */
  linesDeleted: number;

  /** Number of improvement iterations executed. */
  iterations: number;

  /** Number of baseline visual/accessibility defects flagged before mutation. */
  initialFindingCount: number;

  /** Number of residual defects remaining after mutation. */
  finalFindingCount: number;

  /** Number of baseline defects successfully resolved. */
  resolvedFindingCount: number;

  /** Number of new visual/functional defects introduced. */
  newFindingCount: number;

  /** Number of regressions detected. */
  regressionCount: number;

  /** Number of acceptance criteria satisfied. */
  acceptanceCriteriaPassed: number;

  /** Total number of acceptance criteria evaluated. */
  acceptanceCriteriaTotal: number;

  /** Deterministic build validity assessment. */
  buildValidity: BuildValidityResult;

  /** Effective product outcome. */
  effectiveOutcome: EffectiveOutcome;

  /** Whether all hard gates passed and target defects were reduced. */
  success: boolean;

  /** Benchmark outcome classification. */
  classification: BenchmarkCaseClassification;

  /** Error message if run failed. */
  failureReason?: string;

  /** Relative paths of modified files on disk. */
  modifiedFiles: string[];

  /** Unified git diff produced during the run. */
  gitDiff: string;

  /** Raw findings list for detailed reporting. */
  findings?: Finding[];
}

/**
 * Head-to-head comparison result for a single benchmark case.
 */
export interface AgentBenchmarkComparison {
  /** Benchmark case identifier. */
  caseId: string;

  /** Human-readable case title. */
  caseName: string;

  /** Task category (portfolio, saas_landing, ecommerce, etc.). */
  category: string;

  /** Input mode (BUILD_FROM_SCRATCH, REFERENCE_DRIVEN, EXISTING_SITE, HYBRID). */
  inputMode: InputMode;

  /** Coding agent adapter name (e.g. "antigravity", "mock"). */
  agent: string;

  /** Model name used (e.g. "gemini-3.7-flash-high"). */
  model: string;

  /** Metrics from Run A: Agent Alone. */
  baselineRun: ComparisonExecutionMetrics;

  /** Metrics from Run B: Agent + Elevate. */
  elevateRun: ComparisonExecutionMetrics;

  /** Quality delta: resolved findings increase or defect reduction. */
  qualityDelta: number;

  /** Efficiency delta: defects resolved per turn / unit time. */
  efficiencyDelta: number;

  /** Defect delta: (Elevate residual defects - Baseline residual defects). Negative is better. */
  defectDelta: number;

  /** Regression delta: (Elevate regressions - Baseline regressions). Negative is better. */
  regressionDelta: number;

  /** Time delta: (Elevate total ms - Baseline total ms). Negative is faster. */
  timeDelta: number;

  /** Turn delta: (Elevate turns - Baseline turns). */
  turnDelta?: number;

  /** Token delta: (Elevate tokens - Baseline tokens). */
  tokenDelta?: number;

  /** Acceptance delta: (Elevate AC passed - Baseline AC passed). Positive is better. */
  acceptanceDelta: number;

  /** Independent outcome for each evaluated dimension. */
  dimensionWinners: {
    /** Higher resolved findings, lower residual defects, and higher acceptance satisfaction on valid builds. */
    quality: DimensionOutcome;

    /** Higher defects resolved per turn or lower token waste. */
    efficiency: DimensionOutcome;

    /** Zero out-of-scope files, zero protected path violations, zero regressions. */
    safety: DimensionOutcome;

    /** Shorter overall wall-clock execution time. */
    time: DimensionOutcome;
  };
}

/**
 * Options for running a comparison benchmark suite.
 */
export interface ComparisonSuiteOptions {
  suiteName?: string;
  caseFilter?: string;
  categoryFilter?: string;
  agent?: string;
  model?: string;
  effort?: "low" | "medium" | "high";
  concurrency?: number;
  seed?: number;
  timeoutMs?: number;
  outputDir?: string;
  failFast?: boolean;
  dryRun?: boolean;
}

/**
 * Aggregated report comparing Agent-Alone vs Agent+Elevate across the suite.
 */
export interface ComparisonSuiteReport {
  reportId: string;
  timestamp: string;
  suiteName: string;
  agent: string;
  model: string;
  totalCases: number;

  elevateWins: {
    qualityWins: number;
    efficiencyWins: number;
    safetyWins: number;
    timeWins: number;
  };

  agentAloneWins: {
    qualityWins: number;
    efficiencyWins: number;
    safetyWins: number;
    timeWins: number;
  };

  ties: {
    qualityTies: number;
    efficiencyTies: number;
    safetyTies: number;
    timeTies: number;
  };

  aggregateMetrics: {
    agentAlone: {
      totalDurationMs: number;
      avgDurationMs: number;
      totalResolvedFindings: number;
      totalFinalFindings: number;
      totalRegressions: number;
      validBuildCount: number;
      invalidBuildCount: number;
      successRate: number;
      avgAcceptanceRate: number;
    };
    agentElevate: {
      totalDurationMs: number;
      avgDurationMs: number;
      totalResolvedFindings: number;
      totalFinalFindings: number;
      totalRegressions: number;
      validBuildCount: number;
      invalidBuildCount: number;
      successRate: number;
      avgAcceptanceRate: number;
    };
  };

  comparisons: AgentBenchmarkComparison[];

  reproducibility: {
    seed: number;
    agent: string;
    model: string;
    nodeVersion: string;
    platform: string;
    gitCommit: string;
    timestamp: string;
    fixtureHashes: Record<string, string>;
  };
}
