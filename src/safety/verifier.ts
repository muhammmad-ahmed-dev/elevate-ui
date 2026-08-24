import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { GateCheckResult, VerificationResult } from "./types.js";
import { logger } from "../utils/logger.js";

const execAsync = promisify(exec);

export interface VerifierOptions {
  cwd?: string;
  skipBuild?: boolean;
  typecheckCmd?: string;
  buildCmd?: string;
}

export class SafetyVerifier {
  private cwd: string;
  private typecheckCmd: string;
  private buildCmd: string;
  private skipBuild: boolean;

  constructor(options: VerifierOptions = {}) {
    this.cwd = options.cwd || process.cwd();
    this.typecheckCmd = options.typecheckCmd || "npx tsc --noEmit";
    this.buildCmd = options.buildCmd || "npm run build";
    this.skipBuild = options.skipBuild ?? false;
  }

  private async runGate(name: string, command: string): Promise<GateCheckResult> {
    const start = Date.now();
    logger.step("VERIFY", `Running ${name} (${command})...`);

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.cwd,
        windowsHide: true,
      });

      const durationMs = Date.now() - start;
      logger.success(`${name} passed (${durationMs}ms)`);
      return {
        name,
        passed: true,
        command,
        output: `${stdout}\n${stderr}`.trim(),
        durationMs,
      };
    } catch (err: any) {
      const durationMs = Date.now() - start;
      const errorOutput = `${err.stdout || ""}\n${err.stderr || ""}\n${err.message || ""}`.trim();
      logger.error(`${name} failed (${durationMs}ms):\n${errorOutput}`);
      return {
        name,
        passed: false,
        command,
        output: errorOutput,
        error: err.message,
        durationMs,
      };
    }
  }

  public async verify(): Promise<VerificationResult> {
    const start = Date.now();
    const gates: GateCheckResult[] = [];
    const errors: string[] = [];

    // Gate 1: Typecheck
    const typecheckResult = await this.runGate("Typecheck", this.typecheckCmd);
    gates.push(typecheckResult);
    if (!typecheckResult.passed) {
      errors.push(`Typecheck failed: ${typecheckResult.error || "Compilation errors"}`);
    }

    // Gate 2: Framework Build (if not skipped and typecheck passed)
    let buildResult: GateCheckResult = {
      name: "Framework Build",
      passed: true,
      command: this.buildCmd,
      output: "Skipped",
      durationMs: 0,
    };

    if (!this.skipBuild && typecheckResult.passed) {
      buildResult = await this.runGate("Framework Build", this.buildCmd);
      gates.push(buildResult);
      if (!buildResult.passed) {
        errors.push(`Framework build failed: ${buildResult.error || "Build errors"}`);
      }
    } else if (!typecheckResult.passed && !this.skipBuild) {
      errors.push("Framework build skipped due to typecheck failure.");
    }

    const typecheckPassed = typecheckResult.passed;
    const buildPassed = this.skipBuild ? true : (typecheckPassed && buildResult.passed);
    const passed = typecheckPassed && buildPassed;

    return {
      passed,
      typecheckPassed,
      buildPassed,
      gates,
      errors,
      totalDurationMs: Date.now() - start,
    };
  }
}
