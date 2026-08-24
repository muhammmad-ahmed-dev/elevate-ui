import type { MultiViewportResult } from "../../browser/types.js";
import type { Finding } from "../types.js";
import type { VisionProvider, VisualEvaluationRequest, RawVisualFinding } from "./types.js";
import { GeminiVisionProvider } from "./providers/gemini.js";
import { ClaudeVisionProvider } from "./providers/claude.js";
import { MockVisionProvider } from "./providers/mock.js";
import { logger } from "../../utils/logger.js";

export interface VisualEvaluatorOptions {
  provider?: VisionProvider;
  providerName?: "gemini" | "claude" | "mock" | string;
  apiKey?: string;
  model?: string;
  enabled?: boolean;
}

export class VisualEvaluator {
  private provider: VisionProvider;
  private enabled: boolean;

  constructor(options: VisualEvaluatorOptions = {}) {
    this.enabled = options.enabled ?? true;

    if (options.provider) {
      this.provider = options.provider;
    } else {
      const selectedName = (
        options.providerName ||
        process.env.ELEVATE_VISION_PROVIDER ||
        "gemini"
      ).toLowerCase();

      if (selectedName === "claude" || selectedName === "anthropic") {
        this.provider = new ClaudeVisionProvider({
          apiKey: options.apiKey,
          model: options.model,
        });
      } else if (selectedName === "mock") {
        this.provider = new MockVisionProvider();
      } else {
        this.provider = new GeminiVisionProvider({
          apiKey: options.apiKey,
          model: options.model,
        });
      }
    }
  }

  public async evaluateVisual(
    targetUrl: string,
    multiViewportResult: MultiViewportResult,
    deterministicFindings: Finding[]
  ): Promise<{ findings: Finding[]; errors: string[]; rawFindings: RawVisualFinding[] }> {
    if (!this.enabled) {
      return { findings: [], errors: [], rawFindings: [] };
    }

    const start = Date.now();
    logger.step("HEURISTIC", `Running multimodal visual evaluation (${this.provider.name})...`);

    const request: VisualEvaluationRequest = {
      targetUrl,
      multiViewportResult,
      deterministicFindings,
    };

    try {
      const response = await this.provider.evaluateVisual(request);
      const normalizedFindings: Finding[] = response.findings.map((raw, index) => ({
        id: `heuristic-${raw.category}-${raw.viewport}-${index + 1}`,
        category: raw.category,
        severity: "moderate", // Heuristic findings are advisory visual improvements
        title: raw.title,
        description: raw.description,
        evidence: raw.evidence || {},
        selector: raw.selector,
        boundingBox: raw.boundingBox,
        viewport: raw.viewport,
        source: "heuristic",
        deterministic: false,
        confidence: raw.confidence ?? 0.8,
        proposedImprovement: raw.proposedImprovement,
      }));

      logger.success(
        `Visual heuristic evaluation complete: ${normalizedFindings.length} findings (${Date.now() - start}ms)`
      );

      return {
        findings: normalizedFindings,
        errors: [],
        rawFindings: response.findings,
      };
    } catch (err: any) {
      const errorMsg = `Visual evaluation provider '${this.provider.name}' failed: ${err.message}`;
      logger.warn(errorMsg);
      return {
        findings: [],
        errors: [errorMsg],
        rawFindings: [],
      };
    }
  }
}
