/**
 * Phase 3E: TypeScript Verification Gate
 *
 * Runs `tsc --noEmit` (or a configurable command) against the target project.
 * Captures exit code, stdout/stderr, and duration.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "../../../utils/logger.js";
import type { VerificationGateResult } from "./types.js";

const execFileAsync = promisify(execFile);

export interface TypecheckOptions {
  /** Absolute path to project root. */
  cwd: string;
  /** Override command (default: `npx tsc --noEmit`). */
  command?: string;
  /** Timeout in ms (default: 60 000). */
  timeoutMs?: number;
}

/**
 * Run the TypeScript type-checker against a project.
 * Returns a structured gate result — never throws.
 */
export async function runTypecheckGate(
  options: TypecheckOptions
): Promise<VerificationGateResult> {
  const start = Date.now();
  const cmd = options.command ?? "npx tsc --noEmit";
  const timeoutMs = options.timeoutMs ?? 60_000;

  logger.step("VERIFY", `TypeScript check: ${cmd}`);

  // Split command into executable + args
  const parts = cmd.split(/\s+/);
  const executable = parts[0];
  const args = parts.slice(1);

  try {
    const { stdout, stderr } = await execFileAsync(executable, args, {
      cwd: options.cwd,
      windowsHide: true,
      shell: process.platform === "win32",
      timeout: timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
    });

    const output = `${stdout}\n${stderr}`.trim();
    const durationMs = Date.now() - start;
    logger.success(`TypeScript check passed (${durationMs}ms)`);

    return {
      name: "TypeScript",
      passed: true,
      output: output.slice(0, 8192),
      exitCode: 0,
      durationMs,
      mandatory: true,
    };
  } catch (err: any) {
    const durationMs = Date.now() - start;
    const output = `${err.stdout ?? ""}\n${err.stderr ?? ""}\n${err.message ?? ""}`.trim();
    const exitCode: number = err.code ?? 1;

    logger.error(`TypeScript check FAILED (exit ${exitCode}, ${durationMs}ms)`);

    return {
      name: "TypeScript",
      passed: false,
      output: output.slice(0, 8192),
      error: `TypeScript check failed (exit code ${exitCode})`,
      exitCode,
      durationMs,
      mandatory: true,
    };
  }
}
