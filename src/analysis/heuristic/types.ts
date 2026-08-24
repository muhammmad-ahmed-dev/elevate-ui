import type { MultiViewportResult, ViewportName, ElementBoundingBox } from "../../browser/types.js";
import type { Finding, FindingCategory } from "../types.js";

export interface RawVisualFinding {
  category: FindingCategory;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  selector?: string;
  boundingBox?: ElementBoundingBox;
  viewport: ViewportName;
  confidence: number;
  proposedImprovement?: string;
}

export interface VisualEvaluationRequest {
  targetUrl: string;
  multiViewportResult: MultiViewportResult;
  deterministicFindings: Finding[];
}

export interface VisualEvaluationResponse {
  findings: RawVisualFinding[];
  rawOutput?: string;
  modelUsed?: string;
  providerName?: string;
}

export interface VisionProvider {
  readonly name: string;
  evaluateVisual(request: VisualEvaluationRequest): Promise<VisualEvaluationResponse>;
}
