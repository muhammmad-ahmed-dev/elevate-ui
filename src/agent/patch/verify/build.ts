/**
 * Phase 3E: Framework Build Verification Gate
 *
 * Runs the project build command. Auto-detects the best available build
 * command from package.json scripts when no override is given.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "../../../utils/logger.js";
import type { VerificationGateResult } from "./types.js";

const execFileAsync = promisify(execFile);

export interface BuildOptions {
  /** Absolute path to project root. */
  cwd: string;
  /** Override build command. If omitted, auto-detected from package.json. */
  command?: string;
  /** Timeout in ms (default: 120 000). */
  timeoutMs?: number;
}

/** Try to read package.json and detect the best build command. */
async function detectBuildCommand(cwd: string): Promise<string> {
  try {
    const raw = await readFile(join(cwd, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    const scripts = pkg.scripts ?? {};

    // Prefer framework-native build scripts in priority order
    if (scripts["build"]) return "npm run build";
    if (scripts["build:prod"]) return "npm run build:prod";
    if (scripts["compile"]) return "npm run compile";
  } catch {
    // package.json not found or invalid — use safe default
  }
  return "npm run build";
}

/**
 * Run the framework build gate against the target project.
 * Returns a structured gate result — never throws.
 */
export async function runBuildGate(
  options: BuildOptions
): Promise<VerificationGateResult> {
  const start = Date.now();
  const timeoutMs = options.timeoutMs ?? 120_000;

  const cmd = options.command ?? (await detectBuildCommand(options.cwd));
  logger.step("VERIFY", `Framework build: ${cmd}`);

  const parts = cmd.split(/\s+/);
  const executable = parts[0];
  const args = parts.slice(1);

  try {
    const { stdout, stderr } = await execFileAsync(executable, args, {
      cwd: options.cwd,
      windowsHide: true,
      shell: process.platform === "win32",
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      env: {
        ...process.env,
        // Next.js build optimization
        NODE_ENV: "production",
      },
    });

    const output = `${stdout}\n${stderr}`.trim();
    const durationMs = Date.now() - start;
    logger.success(`Framework build passed (${durationMs}ms)`);

    return {
      name: "Framework Build",
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

    logger.error(`Framework build FAILED (exit ${exitCode}, ${durationMs}ms)`);

    return {
      name: "Framework Build",
      passed: false,
      output: output.slice(0, 8192),
      error: `Framework build failed (exit code ${exitCode})`,
      exitCode,
      durationMs,
      mandatory: true,
    };
  }
}
