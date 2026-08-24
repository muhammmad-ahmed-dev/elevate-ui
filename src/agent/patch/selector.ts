/**
 * Phase 3B: Patch Provider Selector
 *
 * Configuration-driven factory that instantiates the correct PatchProvider
 * based on environment variables and/or CLI overrides.
 *
 * Configuration precedence (documented per spec):
 *   CLI override → ELEVATE_PATCH_PROVIDER env var → default ("claude")
 *   CLI override → ELEVATE_PATCH_MODEL env var → provider default
 *
 * READ-ONLY: this module never writes files.
 */

import type { PatchProvider } from "./types.js";
import { ClaudePatchProvider } from "./providers/claude.js";
import { GeminiPatchProvider } from "./providers/gemini.js";
import { MockPatchProvider } from "./providers/mock.js";
import type { MockPatchScenario } from "./types.js";

export type PatchProviderName = "claude" | "gemini" | "mock";

export interface PatchProviderSelectorOptions {
  /**
   * CLI-level override for provider name.
   * Highest precedence.
   */
  providerOverride?: string;
  /**
   * CLI-level override for model name.
   * Highest precedence.
   */
  modelOverride?: string;
  /**
   * Timeout in ms for real API providers.
   * Default: 60 000.
   */
  timeoutMs?: number;
  /**
   * API key override (for testing without env vars).
   * NEVER log this value.
   */
  apiKeyOverride?: string;
  /**
   * Mock scenario (only used when provider is "mock").
   */
  mockScenario?: MockPatchScenario;
}

/**
 * Returns the effective provider name according to the precedence order:
 *   providerOverride → ELEVATE_PATCH_PROVIDER env → "claude"
 */
export function resolveProviderName(override?: string): PatchProviderName {
  const raw = (
    override ||
    process.env.ELEVATE_PATCH_PROVIDER ||
    "claude"
  ).toLowerCase().trim();

  if (raw === "gemini") return "gemini";
  if (raw === "mock") return "mock";
  return "claude"; // default
}

/**
 * Returns the effective model name according to the precedence order:
 *   modelOverride → ELEVATE_PATCH_MODEL env → provider default (empty string = let provider decide)
 */
export function resolveModelName(override?: string): string | undefined {
  return override || process.env.ELEVATE_PATCH_MODEL || undefined;
}

/**
 * Factory function: constructs and returns the appropriate PatchProvider.
 *
 * @param options  Configuration and overrides.
 * @returns        A PatchProvider ready for use.
 */
export function selectPatchProvider(
  options: PatchProviderSelectorOptions = {}
): PatchProvider {
  const providerName = resolveProviderName(options.providerOverride);
  const modelName = resolveModelName(options.modelOverride);

  switch (providerName) {
    case "gemini":
      return new GeminiPatchProvider({
        apiKey: options.apiKeyOverride,
        model: modelName,
        timeoutMs: options.timeoutMs,
      });

    case "mock":
      return new MockPatchProvider({
        scenario: options.mockScenario,
        modelName: modelName ?? "mock-patch-model",
      });

    case "claude":
    default:
      return new ClaudePatchProvider({
        apiKey: options.apiKeyOverride,
        model: modelName,
        timeoutMs: options.timeoutMs,
      });
  }
}
