/**
 * Phase 3E: Hard Gates Orchestrator
 *
 * Runs TypeScript, build, runtime startup, and route smoke test in sequence.
 * Each gate is independently captured; failure in an earlier gate is noted
 * but later gates are still run where safe to do so.
 */

import { runTypecheckGate } from "./typecheck.js";
import { runBuildGate } from "./build.js";
import { runRouteSmoke } from "./runtime.js";
import { logger } from "../../../utils/logger.js";
import type { VerificationGateResult, VerificationPipelineOptions } from "./types.js";

export type HardGateRunOptions = Pick<
  VerificationPipelineOptions,
  | "projectRoot"
  | "targetUrl"
  | "typecheckCmd"
  | "buildCmd"
  | "navigationTimeoutMs"
  | "serverAlreadyRunning"
>;

/**
 * Run all hard verification gates in sequence.
 * Returns the full list so callers can inspect individual gate outcomes.
 */
export async function runHardGates(
  options: HardGateRunOptions
): Promise<VerificationGateResult[]> {
  const gates: VerificationGateResult[] = [];

  logger.title("Phase 3E: Running hard verification gates...");

  // Gate 1: TypeScript
  const typecheckResult = await runTypecheckGate({
    cwd: options.projectRoot,
    command: options.typecheckCmd,
  });
  gates.push(typecheckResult);

  // Gate 2: Framework build — only if typecheck passed
  if (typecheckResult.passed) {
    const buildResult = await runBuildGate({
      cwd: options.projectRoot,
      command: options.buildCmd,
    });
    gates.push(buildResult);
  } else {
    logger.warn("Skipping framework build because TypeScript check failed.");
    gates.push({
      name: "Framework Build",
      passed: false,
      output: "Skipped — TypeScript check failed",
      error: "Skipped due to TypeScript failure",
      durationMs: 0,
      mandatory: true,
    });
  }

  // Gate 3: Route smoke test (only when server is already running externally,
  // or skipped here if serverAlreadyRunning=false — runtime.ts handles startup separately)
  if (options.serverAlreadyRunning && options.targetUrl) {
    const routeResult = await runRouteSmoke({
      targetUrl: options.targetUrl,
      navigationTimeoutMs: options.navigationTimeoutMs,
    });
    gates.push(routeResult);
  }

  const passed = gates.filter((g) => g.mandatory).every((g) => g.passed);
  if (passed) {
    logger.success(`All hard gates passed (${gates.length} gates).`);
  } else {
    const failed = gates.filter((g) => g.mandatory && !g.passed).map((g) => g.name);
    logger.error(`Hard gate failures: ${failed.join(", ")}`);
  }

  return gates;
}
