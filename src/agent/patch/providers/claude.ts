/**
 * Phase 3B: Claude Patch Provider
 *
 * Sends a structured patch generation request to the Anthropic Claude API.
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

export interface ClaudePatchProviderOptions {
  /** API key. Never logged. Read from env if not provided. */
  apiKey?: string;
  /** Model name. Default: ELEVATE_PATCH_MODEL env var or "claude-sonnet-4-6". */
  model?: string;
  /** Request timeout in ms. Default: 60 000. */
  timeoutMs?: number;
}

// Default model — configurable via ELEVATE_PATCH_MODEL env var
const DEFAULT_CLAUDE_PATCH_MODEL = "claude-sonnet-4-6";

export class ClaudePatchProvider implements PatchProvider {
  public readonly name = "claude";
  public readonly modelName: string;

  private apiKey?: string;
  private timeoutMs: number;

  constructor(options: ClaudePatchProviderOptions = {}) {
    // API key: constructor option → ELEVATE_PATCH_API_KEY → ANTHROPIC_API_KEY
    this.apiKey =
      options.apiKey ||
      process.env.ELEVATE_PATCH_API_KEY ||
      process.env.ANTHROPIC_API_KEY;

    // Model: constructor option → ELEVATE_PATCH_MODEL env → default
    this.modelName =
      options.model ||
      process.env.ELEVATE_PATCH_MODEL ||
      DEFAULT_CLAUDE_PATCH_MODEL;

    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  public async generatePatch(
    request: PatchGenerationRequest
  ): Promise<PatchGenerationResult> {
    const start = Date.now();

    // Log metadata only — no API keys
    logger.step(
      "PATCH",
      `Claude patch generation (${this.modelName}) for rec ${request.recommendation.id}`
    );

    if (!this.apiKey) {
      logger.warn("Claude patch provider: no API key configured. Skipping.");
      return this.makeError(
        "configuration_error",
        "No API key found. Set ELEVATE_PATCH_API_KEY or ANTHROPIC_API_KEY.",
        Date.now() - start
      );
    }

    const promptText = buildPatchPrompt(request);

    const body = JSON.stringify({
      model: this.modelName,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: promptText,
        },
      ],
    });

    let rawText: string;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      let response: Response;
      try {
        response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // API key read from config — never logged
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
          },
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
          `Claude API responded with HTTP ${response.status}: ${errText.slice(0, 200)}`,
          Date.now() - start,
          response.status
        );
      }

      const data: any = await response.json();
      rawText = data.content?.[0]?.text ?? "";
    } catch (err: any) {
      const kind: PatchProviderErrorKind =
        err?.name === "AbortError" ? "timeout" : "network_error";
      return this.makeError(
        kind,
        `Claude network/timeout error: ${err.message}`,
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
      `Claude patch generated: ${files.length} file(s) claimed, hash=${patchHash.slice(0, 12)}, ${durationMs}ms`
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
    logger.warn(`Claude patch provider error [${kind}]: ${message}`);
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
