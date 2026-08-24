/**
 * Phase 3E: Browser Verification
 *
 * Wraps the existing BrowserRunner to capture all three viewports
 * (375px, 768px, 1440px) against the running server after mutation.
 *
 * Does NOT duplicate browser lifecycle logic — delegates entirely to BrowserRunner.
 */

import { BrowserRunner } from "../../../browser/runner.js";
import { DEFAULT_VIEWPORTS } from "../../../browser/viewports.js";
import { logger } from "../../../utils/logger.js";
import type { BrowserVerificationResult } from "./types.js";

export interface BrowserVerifyOptions {
  targetUrl: string;
  screenshotDir?: string;
  navigationTimeoutMs?: number;
}

/**
 * Capture all viewports using the existing BrowserRunner infrastructure.
 * Returns a BrowserVerificationResult — never throws.
 */
export async function runBrowserVerification(
  options: BrowserVerifyOptions
): Promise<BrowserVerificationResult> {
  const start = Date.now();
  logger.step(
    "VERIFY",
    `Browser verification across ${DEFAULT_VIEWPORTS.length} viewports at ${options.targetUrl}`
  );

  const runner = new BrowserRunner({
    headless: true,
    timeout: options.navigationTimeoutMs ?? 15_000,
    screenshotDir: options.screenshotDir,
    waitUntil: "domcontentloaded",
  });

  try {
    const captureResult = await runner.captureAllViewports(
      options.targetUrl,
      DEFAULT_VIEWPORTS
    );

    const screenshotPaths: string[] = Object.values(captureResult.captures)
      .map((c) => c.screenshotPath)
      .filter((p): p is string => Boolean(p));

    const durationMs = Date.now() - start;
    logger.success(
      `Browser verification complete: ${Object.keys(captureResult.captures).length} viewports captured (${durationMs}ms)`
    );

    return {
      success: true,
      captureResult,
      viewportsCaptured: Object.keys(captureResult.captures).length,
      screenshotPaths,
      errors: [],
      durationMs,
    };
  } catch (err: any) {
    const durationMs = Date.now() - start;
    logger.error(`Browser verification FAILED: ${err.message}`);
    return {
      success: false,
      viewportsCaptured: 0,
      screenshotPaths: [],
      errors: [err.message],
      durationMs,
    };
  } finally {
    try {
      await runner.close();
    } catch {
      // Ignore browser close errors
    }
  }
}
