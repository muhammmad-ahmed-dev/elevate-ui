/**
 * Phase 4C.5: Antigravity CLI Coding Agent Adapter
 *
 * Integrates the local authenticated Antigravity CLI (`agy`) with Elevate's
 * benchmark runner and safety pipeline without requiring separate API keys.
 *
 * Enforces structured argv invocation without shell concatenation, `--model`,
 * `--effort high`, `--output-format json`, scoped permissions, and strict workspace isolation.
 */

import { join } from "node:path";
import { existsSync } from "node:fs";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { AgentSecurityGuard } from "./security.js";
import type {
  CodingAgentAdapter,
  AgentTask,
  AgentRunResult,
  AntigravityAdapterOptions,
} from "./types.js";

const execFileAsync = promisify(execFile);

interface AgyJsonResponse {
  conversation_id?: string;
  status?: string;
  response?: string;
  duration_seconds?: number;
  num_turns?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    thinking_tokens?: number;
    cache_read_tokens?: number;
    total_tokens?: number;
  };
}

export class AntigravityCodingAgentAdapter implements CodingAgentAdapter {
  public readonly name: string = "antigravity";
  public readonly supportedModels: string[] = [
    "gemini-3.7-flash-high",
    "gemini-3.7-flash",
    "gemini-2.5-pro",
    "claude-3-7-sonnet",
    "flash",
    "pro",
    "default",
  ];

  private options: AntigravityAdapterOptions;

  constructor(options: AntigravityAdapterOptions = {}) {
    this.options = {
      cliCommand: process.env.ANTIGRAVITY_CLI_CMD || "agy",
      effort: "high",
      outputFormat: "json",
      timeoutMs: 300000,
      dangerouslySkipPermissions: true,
      ...options,
    };
  }

  /**
   * Discovers the exact path to the Antigravity CLI executable.
   */
  public async resolveCliCommand(): Promise<string> {
    if (this.options.cliCommand && this.options.cliCommand !== "agy") {
      return this.options.cliCommand;
    }

    const localAppData = process.env.LOCALAPPDATA || "";
    const userProfile = process.env.USERPROFILE || "";

    const candidates = [
      // 1. Explicitly configured command/path
      this.options.cliCommand,
      // 2. Standard Windows LocalAppData install location
      localAppData ? join(localAppData, "agy", "bin", "agy.exe") : "",
      userProfile ? join(userProfile, "AppData", "Local", "agy", "bin", "agy.exe") : "",
      // 3. Common global PATH names
      "agy.exe",
      "agy",
      "agy.cmd",
      "agy.bat",
      "antigravity.exe",
      "antigravity",
      "antigravity.cmd",
    ].filter((c): c is string => Boolean(c && c.trim().length > 0));

    // First check existing absolute/relative paths directly on filesystem
    for (const candidate of candidates) {
      if (candidate.includes("/") || candidate.includes("\\")) {
        if (existsSync(candidate)) {
          return candidate;
        }
      }
    }

    // Next check executable invocations via version probe
    for (const candidate of candidates) {
      try {
        const { stdout } = await execFileAsync(candidate, ["--help"], { timeout: 3000 });
        if (stdout) return candidate;
      } catch {
        // try next candidate
      }
    }

    return this.options.cliCommand || "agy";
  }

  /**
   * Checks whether the Antigravity CLI executable is available and usable.
   */
  public async isAvailable(): Promise<boolean> {
    try {
      const cmd = await this.resolveCliCommand();
      const { stdout } = await execFileAsync(cmd, ["--help"], { timeout: 5000 });
      return Boolean(stdout);
    } catch {
      return false;
    }
  }

  /**
   * Constructs the structured prompt for the Antigravity agent.
   * NEVER leaks benchmark expected fixedCode or answers.
   */
  public buildTaskPrompt(task: AgentTask): string {
    const targetFile = task.targetFiles[0] || "src/components/Component.tsx";
    const targetFilesList =
      task.targetFiles && task.targetFiles.length > 0 ? task.targetFiles.join(", ") : targetFile;

    if (task.customInstructions && task.customInstructions.includes("EXECUTION DIRECTIVES:")) {
      return [
        `You are an expert autonomous web developer.`,
        `Target Workspace: ${task.workspaceRoot}`,
        `Target File(s) to create or modify: ${targetFilesList}`,
        ``,
        `OBJECTIVE:`,
        task.problemDescription,
        task.expectedVisualImprovement ? `GOAL: ${task.expectedVisualImprovement}` : "",
        ``,
        `INSTRUCTIONS & CONTEXT:`,
        task.customInstructions,
        ``,
        `CRITICAL REQUIREMENTS:`,
        `1. Use your write/edit tools to write complete, functional React/TypeScript code directly to the target file(s).`,
        `2. Ensure all components use Tailwind CSS classes and are exported properly.`,
        `3. Modify the files directly on disk in '${task.workspaceRoot}' so changes persist.`,
      ]
        .filter(Boolean)
        .join("\n");
    }

    return [
      `You are an expert autonomous web developer.`,
      `Target Workspace: ${task.workspaceRoot}`,
      `Target File: ${targetFile}`,
      task.category ? `Category: ${task.category}` : "",
      ``,
      `TASK OBJECTIVE:`,
      `${task.problemDescription}`,
      task.expectedVisualImprovement ? `- Goal: ${task.expectedVisualImprovement}` : "",
      task.customInstructions ? `- Guidance: ${task.customInstructions}` : "",
      ``,
      `REQUIREMENTS:`,
      `1. Use your file editing/writing tools to create or modify '${targetFile}' directly on disk in '${task.workspaceRoot}'.`,
      `2. Implement a complete, fully styled React/TypeScript component using Tailwind CSS utility classes.`,
      `3. Preserve proper exports and ensure clean compilation.`,
      `4. Write the file directly to disk so changes persist.`,
    ]
      .filter((line) => line !== undefined && line !== null && line.length > 0)
      .join("\n");
  }

  /**
   * Inspects Git status and diff on disk in the disposable repository.
   */
  private async getGitStatusAndDiff(workspaceRoot: string): Promise<{
    modifiedFiles: string[];
    diff: string;
  }> {
    try {
      const { stdout: statusOut } = await execFileAsync(
        "git",
        ["status", "--porcelain"],
        { cwd: workspaceRoot }
      );
      const modifiedFiles = statusOut
        .split(/\r?\n/)
        .map((line) => {
          const match = line.match(/^..\s+(.*)$/);
          return match ? match[1].replace(/^"|"$/g, "").trim() : "";
        })
        .filter((file) => file.length > 0);

      const { stdout: diffOut } = await execFileAsync(
        "git",
        ["diff", "HEAD"],
        { cwd: workspaceRoot }
      );

      return { modifiedFiles, diff: diffOut };
    } catch {
      return { modifiedFiles: [], diff: "" };
    }
  }

  /**
   * Executes a benchmark task using the local Antigravity CLI / session.
   */
  public async executeTask(task: AgentTask): Promise<AgentRunResult> {
    const startTime = Date.now();
    const timeoutMs = task.timeoutMs || this.options.timeoutMs || 120000;
    const model = task.model || "gemini-3.7-flash-high";
    const effort = task.effort || this.options.effort || "high";

    // 1. Security Gate: Validate workspace is an isolated disposable repository
    try {
      AgentSecurityGuard.validateWorkspace(task.workspaceRoot);
    } catch (secErr: any) {
      return {
        success: false,
        agentName: this.name,
        modelName: model,
        workspaceRoot: task.workspaceRoot,
        durationMs: Date.now() - startTime,
        errorMessage: secErr.message,
        errorCode: "SECURITY_VIOLATION",
      };
    }

    // 2. Resolve CLI command
    const cliCmd = await this.resolveCliCommand();

    // 3. Build structured CLI argv (NEVER pass --headless; use -p print mode)
    const prompt = this.buildTaskPrompt(task);
    const args: string[] = [];

    // Print mode prompt
    args.push("-p", prompt);

    // Model selection
    args.push("--model", model);

    // Effort / reasoning level
    args.push("--effort", effort);

    // Explicitly declare target workspace directory for the subagent
    args.push("--add-dir", task.workspaceRoot);

    // Output format
    if (this.options.outputFormat) {
      args.push("--output-format", this.options.outputFormat);
    }

    // Execution mode if specified
    if (this.options.mode) {
      args.push("--mode", this.options.mode);
    }

    // Auto-approve tool operations in verified disposable workspace
    args.push("--dangerously-skip-permissions");

    // 4. Sanitize environment (preserves user session while stripping API keys)
    const sanitizedEnv = AgentSecurityGuard.sanitizeEnvironment(
      process.env,
      this.options.extraEnv
    );

    let stdoutData = "";
    let stderrData = "";
    let childPid: number | undefined;
    let timedOut = false;

    // 5. Execute process in disposable repository without shell interpolation
    try {
      const isCmdOrBat = cliCmd.toLowerCase().endsWith(".cmd") || cliCmd.toLowerCase().endsWith(".bat");
      const spawnExecutable = isCmdOrBat ? "cmd.exe" : cliCmd;
      const spawnArgs = isCmdOrBat ? ["/c", cliCmd, ...args] : args;

      let timeoutHandle: NodeJS.Timeout | undefined;
      const execPromise = new Promise<{ code: number | null }>((resolve, reject) => {
        let child: ReturnType<typeof spawn>;
        try {
          child = spawn(spawnExecutable, spawnArgs, {
            cwd: task.workspaceRoot,
            env: sanitizedEnv,
            shell: false,
            stdio: ["ignore", "pipe", "pipe"],
          });
        } catch (spawnErr) {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          return reject(spawnErr);
        }

        childPid = child.pid;

        child.stdout?.on("data", (chunk) => {
          stdoutData += chunk.toString("utf8");
        });

        child.stderr?.on("data", (chunk) => {
          stderrData += chunk.toString("utf8");
        });

        child.on("error", (err) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          reject(err);
        });

        child.on("close", (code) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          resolve({ code });
        });
      });

      // Timeout watchdog
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          if (childPid) {
            AgentSecurityGuard.killProcessTree(childPid);
          }
          reject(new Error(`Antigravity agent timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        if (typeof timeoutHandle.unref === "function") {
          timeoutHandle.unref();
        }
      });

      const { code } = await Promise.race([execPromise, timeoutPromise]);
      if (timeoutHandle) clearTimeout(timeoutHandle);

      const durationMs = Date.now() - startTime;
      const combinedOutput = `${stdoutData}\n${stderrData}`;

      // 6. Check for Authentication Required
      if (AgentSecurityGuard.isAuthenticationRequired(combinedOutput)) {
        return {
          success: false,
          agentName: this.name,
          modelName: model,
          workspaceRoot: task.workspaceRoot,
          exitCode: code ?? 1,
          stdout: stdoutData,
          stderr: stderrData,
          durationMs,
          errorMessage:
            "Antigravity authentication required: Please run 'agy auth' to log in with your Antigravity session.",
          errorCode: "AGENT_AUTHENTICATION_REQUIRED",
        };
      }

      // 6b. Check for Infrastructure Failure (model unreachable, 503, rate limit)
      if (AgentSecurityGuard.isInfrastructureFailure(combinedOutput)) {
        return {
          success: false,
          agentName: this.name,
          modelName: model,
          workspaceRoot: task.workspaceRoot,
          exitCode: code ?? 1,
          stdout: stdoutData,
          stderr: stderrData,
          durationMs,
          errorMessage: `Antigravity backend infrastructure failure: ${stderrData.trim() || stdoutData.trim() || "Model or service unreachable"}`,
          errorCode: "INFRASTRUCTURE_FAILURE",
        };
      }

      // 7. Check actual filesystem and Git diff produced on disk in the disposable repo
      const { modifiedFiles, diff } = await this.getGitStatusAndDiff(task.workspaceRoot);

      // Parse structured JSON response according to Antigravity CLI schema
      let parsedOutput: (AgyJsonResponse & { error?: string }) | undefined;
      try {
        parsedOutput = JSON.parse(stdoutData);
      } catch {
        // Non-JSON or mixed stream output: preserve stdoutData safely without failing
      }

      // Check if Antigravity JSON reported an explicit error
      if (parsedOutput?.status === "ERROR" || parsedOutput?.error) {
        const errText = parsedOutput.error || parsedOutput.response || "Antigravity CLI returned error status.";
        const isInfra = AgentSecurityGuard.isInfrastructureFailure(errText);
        return {
          success: false,
          agentName: this.name,
          modelName: model,
          workspaceRoot: task.workspaceRoot,
          exitCode: code ?? 1,
          stdout: stdoutData,
          stderr: stderrData,
          durationMs,
          errorMessage: errText,
          errorCode: isInfra ? "INFRASTRUCTURE_FAILURE" : "AGENT_CRASH",
          rawOutput: parsedOutput,
        };
      }

      if (code !== 0 && modifiedFiles.length === 0) {
        const isNotRecognized =
          combinedOutput.includes("is not recognized as an internal or external command") ||
          combinedOutput.includes("cannot find the path specified") ||
          combinedOutput.includes("command not found") ||
          combinedOutput.includes("No such file or directory");

        const errDetail =
          parsedOutput?.error ||
          stderrData.trim() ||
          stdoutData.trim() ||
          "Unknown error";

        return {
          success: false,
          agentName: this.name,
          modelName: model,
          workspaceRoot: task.workspaceRoot,
          exitCode: code ?? 1,
          stdout: stdoutData,
          stderr: stderrData,
          durationMs,
          errorMessage: isNotRecognized
            ? `Antigravity CLI ('${cliCmd}') not found or not executable in environment.`
            : `Antigravity CLI exited with code ${code}: ${errDetail}`,
          errorCode: isNotRecognized ? "CLI_NOT_FOUND" : "AGENT_CRASH",
          rawOutput: parsedOutput,
        };
      }

      return {
        success: true,
        agentName: this.name,
        modelName: model,
        workspaceRoot: task.workspaceRoot,
        exitCode: code ?? 0,
        stdout: stdoutData,
        stderr: stderrData,
        modifiedFilesClaimed: task.targetFiles,
        actualModifiedFiles: modifiedFiles,
        gitDiffProduced: diff,
        durationMs,
        rawOutput: parsedOutput,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const combinedOutput = `${stdoutData}\n${stderrData}\n${err.message}`;

      if (childPid) {
        await AgentSecurityGuard.killProcessTree(childPid);
      }

      if (AgentSecurityGuard.isAuthenticationRequired(combinedOutput)) {
        return {
          success: false,
          agentName: this.name,
          modelName: model,
          workspaceRoot: task.workspaceRoot,
          durationMs,
          errorMessage:
            "Antigravity authentication required: Please run 'agy auth' to log in with your Antigravity session.",
          errorCode: "AGENT_AUTHENTICATION_REQUIRED",
        };
      }

      if (AgentSecurityGuard.isInfrastructureFailure(combinedOutput)) {
        return {
          success: false,
          agentName: this.name,
          modelName: model,
          workspaceRoot: task.workspaceRoot,
          durationMs,
          errorMessage: `Antigravity backend infrastructure failure: ${err.message}`,
          errorCode: "INFRASTRUCTURE_FAILURE",
        };
      }

      if (timedOut || err.message?.includes("timed out")) {
        return {
          success: false,
          agentName: this.name,
          modelName: model,
          workspaceRoot: task.workspaceRoot,
          durationMs,
          timedOut: true,
          errorMessage: `Antigravity agent execution timed out after ${timeoutMs}ms`,
          errorCode: "AGENT_TIMEOUT",
        };
      }

      if (err.code === "ENOENT" || err.message?.includes("not found")) {
        return {
          success: false,
          agentName: this.name,
          modelName: model,
          workspaceRoot: task.workspaceRoot,
          durationMs,
          errorMessage: `Antigravity CLI ('${cliCmd}') not found in system PATH.`,
          errorCode: "CLI_NOT_FOUND",
        };
      }

      return {
        success: false,
        agentName: this.name,
        modelName: model,
        workspaceRoot: task.workspaceRoot,
        durationMs,
        errorMessage: `Antigravity agent failed: ${err.message}`,
        errorCode: "AGENT_CRASH",
      };
    }
  }
}
