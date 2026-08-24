import type { VisionProvider, VisualEvaluationRequest, VisualEvaluationResponse } from "../types.js";
import { buildVisualAnalysisPrompt, parseAndValidateVisionResponse } from "./base.js";
import { logger } from "../../../utils/logger.js";

export interface GeminiVisionProviderOptions {
  apiKey?: string;
  model?: string;
}

export class GeminiVisionProvider implements VisionProvider {
  public readonly name = "gemini";
  private apiKey?: string;
  private model: string;

  constructor(options: GeminiVisionProviderOptions = {}) {
    this.apiKey = options.apiKey || process.env.ELEVATE_VISION_API_KEY || process.env.GEMINI_API_KEY;
    this.model = options.model || process.env.ELEVATE_VISION_MODEL || "gemini-1.5-pro";
  }

  public async evaluateVisual(request: VisualEvaluationRequest): Promise<VisualEvaluationResponse> {
    if (!this.apiKey) {
      logger.warn("Gemini vision evaluation skipped: No API key found (set ELEVATE_VISION_API_KEY or GEMINI_API_KEY).");
      return {
        findings: [],
        modelUsed: this.model,
        providerName: this.name,
      };
    }

    const promptText = buildVisualAnalysisPrompt(request);

    // Build multimodal image parts from screenshots
    const parts: any[] = [{ text: promptText }];
    for (const [, capture] of Object.entries(request.multiViewportResult.captures)) {
      if (capture.screenshotBase64) {
        parts.push({
          inlineData: {
            mimeType: "image/png",
            data: capture.screenshotBase64,
          },
        });
      }
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errorText.slice(0, 200)}`);
    }

    const data: any = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const findings = parseAndValidateVisionResponse(candidateText);

    return {
      findings,
      rawOutput: candidateText,
      modelUsed: this.model,
      providerName: this.name,
    };
  }
}
