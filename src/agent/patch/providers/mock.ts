/**
 * Phase 3B: Mock Patch Provider
 *
 * Deterministic fixture-based provider used for all Phase 3B tests.
 * No network calls.  No API keys required.
 *
 * Supports ten explicit test scenarios enumerated in MockPatchScenario.
 * READ-ONLY: does not write any file.
 */

import type {
  PatchProvider,
  PatchGenerationRequest,
  PatchGenerationResult,
  MockPatchScenario,
} from "../types.js";
import { hashPatch } from "../hash.js";

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

/** Minimal valid single-file unified diff used in scenario A. */
export const FIXTURE_VALID_SINGLE_FILE_PATCH = `--- a/src/components/HeroSection.tsx
+++ b/src/components/HeroSection.tsx
@@ -5,7 +5,7 @@
 export function HeroSection() {
   return (
     <section className="hero-section py-12">
-      <button className="cta-btn bg-gray-400 text-white px-6">Get Started</button>
+      <button className="cta-btn bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold">Get Started</button>
     </section>
   );
 }`;

/** Multi-file patch touching both component and its CSS module — scenario B. */
export const FIXTURE_VALID_MULTI_FILE_PATCH = `--- a/src/components/HeroSection.tsx
+++ b/src/components/HeroSection.tsx
@@ -5,7 +5,7 @@
 export function HeroSection() {
   return (
     <section className="hero-section py-12">
-      <button className="cta-btn">Get Started</button>
+      <button className="cta-btn cta-btn--primary">Get Started</button>
     </section>
   );
 }
--- a/src/components/HeroSection.module.css
+++ b/src/components/HeroSection.module.css
@@ -1,3 +1,6 @@
 .cta-btn {
   padding: 0.5rem 1.5rem;
 }
+.cta-btn--primary {
+  background-color: #2563eb;
+  color: white;
+}`;

/** Syntactically malformed diff — scenario C. */
export const FIXTURE_MALFORMED_PATCH = `this is not a unified diff at all
it has no headers
just random text`;

/** Valid diff that touches an unauthorized file — scenario D. */
export const FIXTURE_UNAUTHORIZED_FILE_PATCH = `--- a/src/components/Unrelated.tsx
+++ b/src/components/Unrelated.tsx
@@ -1,3 +1,3 @@
-export function Unrelated() { return <div>old</div>; }
+export function Unrelated() { return <div>new</div>; }`;

/** Diff that attempts to modify a protected file — scenario E. */
export const FIXTURE_PROTECTED_FILE_PATCH = `--- a/package.json
+++ b/package.json
@@ -1,3 +1,4 @@
 {
   "name": "test",
+  "description": "modified by AI"
 }`;

/** Diff that modifies hook logic — scenario F. */
export const FIXTURE_HOOK_MODIFICATION_PATCH = `--- a/src/components/HeroSection.tsx
+++ b/src/components/HeroSection.tsx
@@ -1,8 +1,9 @@
 import { useState } from 'react';
 export function HeroSection() {
-  const [count, setCount] = useState(0);
+  const [count, setCount] = useState(42);
+  const [extra, setExtra] = useState('new');
   return <button onClick={() => setCount(c => c+1)}>{count}</button>;
 }`;

/** Diff containing a file deletion — scenario G. */
export const FIXTURE_FILE_DELETION_PATCH = `--- a/src/components/OldComponent.tsx
+++ /dev/null
@@ -1,5 +0,0 @@
-export function OldComponent() {
-  return <div>Old</div>;
-}`;

// ---------------------------------------------------------------------------
// MockPatchProvider
// ---------------------------------------------------------------------------

export interface MockPatchProviderOptions {
  scenario?: MockPatchScenario;
  /**
   * Optional custom patch string override.
   */
  customPatch?: string;
  /**
   * Optional custom target files list.
   */
  customTargetFiles?: string[];
  /**
   * Delay in milliseconds before resolving (simulate latency).
   * For "timeout" scenario, this exceeds any reasonable timeout.
   */
  delayMs?: number;
  /**
   * Custom model name to report (default: "mock-patch-model").
   */
  modelName?: string;
}

export class MockPatchProvider implements PatchProvider {
  public readonly name = "mock";
  public readonly modelName: string;

  private scenario: MockPatchScenario;
  private customPatch?: string;
  private customTargetFiles?: string[];
  private delayMs: number;

  constructor(options: MockPatchProviderOptions = {}) {
    this.scenario = options.scenario ?? "valid_single_file";
    this.customPatch = options.customPatch;
    this.customTargetFiles = options.customTargetFiles;
    this.delayMs = options.delayMs ?? 0;
    this.modelName = options.modelName ?? "mock-patch-model";
  }

  public async generatePatch(
    request: PatchGenerationRequest
  ): Promise<PatchGenerationResult> {
    const start = Date.now();

    // Simulate latency if configured
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    const durationMs = Date.now() - start;

    if (this.customPatch) {
      const targetFiles = this.customTargetFiles || request.patchPlan.allowedFiles;
      return this.makeSuccess(
        request,
        this.customPatch,
        targetFiles,
        "Applied benchmark target fix",
        "Target component updated to fix visual/layout defect",
        "low",
        0.95,
        durationMs
      );
    }

    switch (this.scenario) {
      case "valid_single_file":
        return this.makeSuccess(
          request,
          FIXTURE_VALID_SINGLE_FILE_PATCH,
          ["src/components/HeroSection.tsx"],
          "Increased CTA button contrast using Tailwind bg-blue-600",
          "Button will meet WCAG AA contrast requirements",
          "low",
          0.92,
          durationMs
        );

      case "valid_multi_file":
        return this.makeSuccess(
          request,
          FIXTURE_VALID_MULTI_FILE_PATCH,
          ["src/components/HeroSection.tsx", "src/components/HeroSection.module.css"],
          "Added primary button modifier class for improved contrast",
          "Button will have higher contrast and be more visually prominent",
          "medium",
          0.85,
          durationMs
        );

      case "malformed_patch":
        // Return a structurally valid result, but the patch content is malformed
        // (Phase 3C will catch this during diff parsing)
        return this.makeSuccess(
          request,
          FIXTURE_MALFORMED_PATCH,
          ["src/components/HeroSection.tsx"],
          "Attempted change (malformed diff — Phase 3C will reject)",
          "Unknown",
          "high",
          0.3,
          durationMs
        );

      case "unauthorized_file":
        return this.makeSuccess(
          request,
          FIXTURE_UNAUTHORIZED_FILE_PATCH,
          ["src/components/Unrelated.tsx"],
          "Modified unrelated component (Phase 3C will reject)",
          "Unknown",
          "high",
          0.5,
          durationMs
        );

      case "protected_file":
        return this.makeSuccess(
          request,
          FIXTURE_PROTECTED_FILE_PATCH,
          ["package.json"],
          "Attempted modification of package.json (Phase 3C will reject)",
          "Unknown",
          "high",
          0.5,
          durationMs
        );

      case "hook_modification":
        return this.makeSuccess(
          request,
          FIXTURE_HOOK_MODIFICATION_PATCH,
          ["src/components/HeroSection.tsx"],
          "Modified React state hook (Phase 3C will reject)",
          "Unknown",
          "high",
          0.6,
          durationMs
        );

      case "file_deletion":
        return this.makeSuccess(
          request,
          FIXTURE_FILE_DELETION_PATCH,
          ["src/components/OldComponent.tsx"],
          "Deleted component file (Phase 3C will reject)",
          "Unknown",
          "high",
          0.4,
          durationMs
        );

      case "empty_response":
        return this.makeSuccess(
          request,
          "",
          [],
          "No change required — visual quality already satisfactory",
          "No impact",
          "low",
          1.0,
          durationMs
        );

      case "provider_error":
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
          error: {
            kind: "provider_unavailable",
            message: "Mock provider simulated error for testing",
          },
        };

      case "timeout":
        // delayMs should be set to a large value by the caller to simulate timeout.
        // The provider itself doesn't enforce a timeout — the caller wraps it.
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
          error: {
            kind: "timeout",
            message: "Mock provider simulated timeout",
          },
        };

      case "high_risk_valid":
        return this.makeSuccess(
          request,
          FIXTURE_VALID_SINGLE_FILE_PATCH,
          ["src/components/HeroSection.tsx"],
          "Significant layout restructuring of the hero section",
          "Improved visual hierarchy with high confidence",
          "high",
          0.78,
          durationMs
        );

      default:
        return this.makeSuccess(
          request,
          FIXTURE_VALID_SINGLE_FILE_PATCH,
          ["src/components/HeroSection.tsx"],
          "Default mock patch",
          "Default visual improvement",
          "low",
          0.9,
          durationMs
        );
    }
  }

  private makeSuccess(
    request: PatchGenerationRequest,
    patch: string,
    files: string[],
    summary: string,
    expectedImpact: string,
    risk: "low" | "medium" | "high",
    confidence: number,
    durationMs: number
  ): PatchGenerationResult {
    const patchHash = hashPatch(patch);
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
        scenario: this.scenario,
        requestId: request.requestId,
        recommendationId: request.recommendation.id,
      },
    };
  }
}
