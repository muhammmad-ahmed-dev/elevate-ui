import type { VisionProvider, VisualEvaluationRequest, VisualEvaluationResponse } from "../types.js";
import { buildVisualAnalysisPrompt, parseAndValidateVisionResponse } from "./base.js";
import { logger } from "../../../utils/logger.js";

export interface ClaudeVisionProviderOptions {
  apiKey?: string;
  model?: string;
}

export class ClaudeVisionProvider implements VisionProvider {
  public readonly name = "claude";
  private apiKey?: string;
  private model: string;

  constructor(options: ClaudeVisionProviderOptions = {}) {
    this.apiKey = options.apiKey || process.env.ELEVATE_VISION_API_KEY || process.env.ANTHROPIC_API_KEY;
    this.model = options.model || process.env.ELEVATE_VISION_MODEL || "claude-3-5-sonnet-20241022";
  }

  public async evaluateVisual(request: VisualEvaluationRequest): Promise<VisualEvaluationResponse> {
    if (!this.apiKey) {
      logger.warn("Claude vision evaluation skipped: No API key found (set ELEVATE_VISION_API_KEY or ANTHROPIC_API_KEY).");
      return {
        findings: [],
        modelUsed: this.model,
        providerName: this.name,
      };
    }

    const promptText = buildVisualAnalysisPrompt(request);
    const content: any[] = [];

    for (const [, capture] of Object.entries(request.multiViewportResult.captures)) {
      if (capture.screenshotBase64) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: capture.screenshotBase64,
          },
        });
      }
    }

    content.push({
      type: "text",
      text: promptText,
    });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4000,
        messages: [{ role: "user", content }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error (${response.status}): ${errorText.slice(0, 200)}`);
    }

    const data: any = await response.json();
    const text = data.content?.[0]?.text || "{}";
    const findings = parseAndValidateVisionResponse(text);

    return {
      findings,
      rawOutput: text,
      modelUsed: this.model,
      providerName: this.name,
    };
  }
}
