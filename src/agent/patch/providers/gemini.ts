/**
 * Phase 3B: Gemini Patch Provider
 *
 * Sends a structured patch generation request to the Google Gemini API.
 * Expects a JSON-formatted response matching RawPatchModelResponse.
 *
 * READ-ONLY: never writes to disk, never commits, never applies the patch.
 */

import type {
  PatchProvider,
  PatchGenerationRequest,
  PatchGenerationResult,
  PatchProviderErrorKind,
} from "../types.js";
import { buildPatchPrompt } from "../prompt.js";
import { validatePatchResponse } from "../validation.js";
import { hashPatch } from "../hash.js";
import { logger } from "../../../utils/logger.js";

export interface GeminiPatchProviderOptions {
  /** API key. Never logged. Read from env if not provided. */
  apiKey?: string;
  /** Model name. Default: ELEVATE_PATCH_MODEL env var or "gemini-1.5-pro". */
  model?: string;
  /** Request timeout in ms. Default: 60 000. */
  timeoutMs?: number;
}

const DEFAULT_GEMINI_PATCH_MODEL = "gemini-1.5-pro";

export class GeminiPatchProvider implements PatchProvider {
  public readonly name = "gemini";
  public readonly modelName: string;

  private apiKey?: string;
  private timeoutMs: number;

  constructor(options: GeminiPatchProviderOptions = {}) {
    // API key: constructor option → ELEVATE_PATCH_API_KEY → GEMINI_API_KEY
    this.apiKey =
      options.apiKey ||
      process.env.ELEVATE_PATCH_API_KEY ||
      process.env.GEMINI_API_KEY;

    // Model: constructor option → ELEVATE_PATCH_MODEL env → default
    this.modelName =
      options.model ||
      process.env.ELEVATE_PATCH_MODEL ||
      DEFAULT_GEMINI_PATCH_MODEL;

    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  public async generatePatch(
    request: PatchGenerationRequest
  ): Promise<PatchGenerationResult> {
    const start = Date.now();

    logger.step(
      "PATCH",
      `Gemini patch generation (${this.modelName}) for rec ${request.recommendation.id}`
    );

    if (!this.apiKey) {
      logger.warn("Gemini patch provider: no API key configured. Skipping.");
      return this.makeError(
        "configuration_error",
        "No API key found. Set ELEVATE_PATCH_API_KEY or GEMINI_API_KEY.",
        Date.now() - start
      );
    }

    const promptText = buildPatchPrompt(request);

    // API key is embedded in the URL query string — never in a header that might be logged
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;

    const body = JSON.stringify({
      contents: [
        {
          parts: [{ text: promptText }],
        },
      ],
      generationConfig: {
        temperature: 0.1, // Low temperature for deterministic code generation
        responseMimeType: "application/json",
      },
    });

    let rawText: string;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => "(unreadable)");
        const kind: PatchProviderErrorKind =
          response.status === 401 || response.status === 403
            ? "auth_error"
            : response.status === 429
            ? "rate_limit"
            : response.status >= 500
            ? "provider_unavailable"
            : "network_error";

        return this.makeError(
          kind,
          `Gemini API responded with HTTP ${response.status}: ${errText.slice(0, 200)}`,
          Date.now() - start,
          response.status
        );
      }

      const data: any = await response.json();
      rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    } catch (err: any) {
      const kind: PatchProviderErrorKind =
        err?.name === "AbortError" ? "timeout" : "network_error";
      return this.makeError(
        kind,
        `Gemini network/timeout error: ${err.message}`,
        Date.now() - start
      );
    }

    // Validate response schema
    const validation = validatePatchResponse(rawText);
    if (!validation.valid || !validation.response) {
      return this.makeError(
        validation.error?.kind ?? "malformed_response",
        validation.error?.message ?? "Unknown validation failure",
        Date.now() - start
      );
    }

    const { patch, files, summary, expectedImpact, risk, confidence } =
      validation.response;

    const patchHash = hashPatch(patch);
    const durationMs = Date.now() - start;

    logger.success(
      `Gemini patch generated: ${files.length} file(s) claimed, hash=${patchHash.slice(0, 12)}, ${durationMs}ms`
    );

    return {
      success: true,
      patch,
      patchHash,
      provider: this.name,
      model: this.modelName,
      changedFilesClaimed: files,
      reasoningSummary: summary,
      expectedImpact,
      risk,
      confidence,
      durationMs,
      rawMetadata: {
        requestId: request.requestId,
        recommendationId: request.recommendation.id,
        claimedFileCount: files.length,
      },
    };
  }

  private makeError(
    kind: PatchProviderErrorKind,
    message: string,
    durationMs: number,
    httpStatus?: number
  ): PatchGenerationResult {
    logger.warn(`Gemini patch provider error [${kind}]: ${message}`);
    return {
      success: false,
      provider: this.name,
      model: this.modelName,
      changedFilesClaimed: [],
      reasoningSummary: "",
      expectedImpact: "",
      risk: "low",
      confidence: 0,
      durationMs,
      error: { kind, message, httpStatus },
    };
  }
}
