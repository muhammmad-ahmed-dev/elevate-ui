import type { ViewportName, ViewportConfig, ElementBoundingBox } from "../browser/types.js";

export type FindingCategory =
  | "accessibility"
  | "touch-target"
  | "broken-image"
  | "heading-hierarchy"
  | "overflow"
  | "layout-shift"
  | "visual-hierarchy"
  | "typography"
  | "spacing"
  | "color-contrast"
  | "brand-rhythm"
  | "cta-prominence"
  | "composition"
  | "responsive-integrity";

export type FindingSeverity = "critical" | "serious" | "moderate" | "minor" | "info";

export type FindingSource = "deterministic" | "heuristic";

export interface Finding {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  selector?: string;
  boundingBox?: ElementBoundingBox;
  viewport: ViewportName;
  source: FindingSource;
  deterministic: boolean;
  confidence: number; // 0.0 - 1.0
  affectedComponents?: string[];
  proposedImprovement?: string;
  metadata?: Record<string, unknown>;
}

export interface PrioritizationFactors {
  severityWeight: number;
  viewportBreadth: number;
  confidenceWeight: number;
  deterministicBonus: number;
  userVisibleImpact: number;
  [key: string]: number;
}

export interface PrioritizedFinding {
  rank: number;
  finding: Finding;
  score: number;
  rationale: string;
  factors: PrioritizationFactors;
}

export type MutationScope = "single-element" | "component" | "layout";

export type MutationRisk = "low" | "medium" | "high";

export interface MutationRecommendation {
  id: string;
  problem: string;
  evidence: Record<string, unknown>;
  affectedSelector?: string;
  affectedComponents?: string[];
  affectedViewports: ViewportName[];
  proposedImprovement: string;
  rationale: string;
  confidence: number;
  estimatedMutationScope: MutationScope;
  risk: MutationRisk;
  sourceFindingIds: string[];
}

export interface AnalysisRunMetadata {
  timestamp: number;
  targetUrl: string;
  durationMs: number;
  visionProvider?: string;
  visionModel?: string;
}

export interface AnalysisResult {
  runMetadata: AnalysisRunMetadata;
  viewportMetadata: ViewportConfig[];
  deterministicFindings: Finding[];
  heuristicFindings: Finding[];
  normalizedFindings: Finding[];
  deduplicatedFindings: Finding[];
  prioritizedFindings: PrioritizedFinding[];
  recommendations: MutationRecommendation[];
  errors?: string[];
}
