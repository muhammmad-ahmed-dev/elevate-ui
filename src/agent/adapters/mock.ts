/**
 * Phase 4C.5: Mock Coding Agent Adapter
 *
 * Provides a deterministic, highly configurable mock coding agent for
 * unit and integration tests across all execution scenarios (valid edits,
 * syntax errors, out-of-scope modifications, auth required, timeouts, crashes).
 */

import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AgentSecurityGuard } from "./security.js";
import type {
  CodingAgentAdapter,
  AgentTask,
  AgentRunResult,
  MockAgentOptions,
  MockAgentScenario,
} from "./types.js";

const execFileAsync = promisify(execFile);

async function getGitStatusAndDiff(workspaceRoot: string): Promise<{
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

export class MockCodingAgentAdapter implements CodingAgentAdapter {
  public readonly name: string = "mock";
  public readonly supportedModels: string[] = [
    "mock-model",
    "default",
    "gemini-3.7-flash-high",
    "gemini-3.7-flash",
  ];

  private options: MockAgentOptions;

  constructor(options: MockAgentOptions = {}) {
    this.options = {
      scenario: "valid_fix",
      ...options,
    };
  }

  public setScenario(scenario: MockAgentScenario): void {
    this.options.scenario = scenario;
  }

  public setCustomPatch(patch: string): void {
    this.options.customPatch = patch;
  }

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public async executeTask(task: AgentTask): Promise<AgentRunResult> {
    const startTime = Date.now();

    // 1. Enforce security boundary
    AgentSecurityGuard.validateWorkspace(task.workspaceRoot);

    if (this.options.delayMs && this.options.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.options.delayMs));
    }

    const scenario = this.options.scenario || "valid_fix";

    // Scenario: Authentication Required
    if (scenario === "auth_required") {
      return {
        success: false,
        agentName: this.name,
        modelName: task.model || "mock-model",
        workspaceRoot: task.workspaceRoot,
        exitCode: 1,
        stdout: "",
        stderr: "Authentication required: run 'agy auth' to log in with your Antigravity account.",
        durationMs: Date.now() - startTime,
        errorMessage: "Antigravity authentication required: run 'agy auth' to authenticate.",
        errorCode: "AGENT_AUTHENTICATION_REQUIRED",
      };
    }

    // Scenario: Timeout
    if (scenario === "timeout") {
      return {
        success: false,
        agentName: this.name,
        modelName: task.model || "mock-model",
        workspaceRoot: task.workspaceRoot,
        durationMs: task.timeoutMs || 5000,
        timedOut: true,
        errorMessage: `Agent execution timed out after ${task.timeoutMs || 5000}ms`,
        errorCode: "AGENT_TIMEOUT",
      };
    }

    // Scenario: Crash
    if (scenario === "crash") {
      return {
        success: false,
        agentName: this.name,
        modelName: task.model || "mock-model",
        workspaceRoot: task.workspaceRoot,
        exitCode: 1,
        stdout: "",
        stderr: this.options.errorMessage || "Agent crashed with uncaught fatal exception.",
        durationMs: Date.now() - startTime,
        errorMessage: this.options.errorMessage || "Agent crashed with exit code 1",
        errorCode: "AGENT_CRASH",
      };
    }

    // Target file check
    const targetRelPath = task.targetFiles[0] || "src/components/Component.tsx";
    const targetAbsPath = join(task.workspaceRoot, targetRelPath);

    // Scenario: No Edits
    if (scenario === "no_edits") {
      return {
        success: true,
        agentName: this.name,
        modelName: task.model || "mock-model",
        workspaceRoot: task.workspaceRoot,
        exitCode: 0,
        stdout: "Inspected component. No edits required.",
        durationMs: Date.now() - startTime,
        modifiedFilesClaimed: [],
        actualModifiedFiles: [],
        gitDiffProduced: "",
      };
    }

    // Scenario: Syntax Error
    if (scenario === "syntax_error") {
      let content = "";
      try {
        content = await readFile(targetAbsPath, "utf8");
      } catch {
        content = "export default function Broken() { return <div></div>; }";
      }
      await writeFile(targetAbsPath, content + "\n\n<<<SYNTAX_ERROR>>> const invalid === ;;", "utf8");

      const { modifiedFiles, diff } = await getGitStatusAndDiff(task.workspaceRoot);
      return {
        success: true,
        agentName: this.name,
        modelName: task.model || "mock-model",
        workspaceRoot: task.workspaceRoot,
        exitCode: 0,
        stdout: "Modified component file with changes.",
        durationMs: Date.now() - startTime,
        modifiedFilesClaimed: [targetRelPath],
        actualModifiedFiles: modifiedFiles,
        gitDiffProduced: diff,
      };
    }

    // Scenario: Out of Scope
    if (scenario === "out_of_scope") {
      const packageJsonPath = join(task.workspaceRoot, "package.json");
      await writeFile(
        packageJsonPath,
        JSON.stringify({ name: "corrupted-by-agent", version: "9.9.9" }, null, 2),
        "utf8"
      );

      const { modifiedFiles, diff } = await getGitStatusAndDiff(task.workspaceRoot);
      return {
        success: true,
        agentName: this.name,
        modelName: task.model || "mock-model",
        workspaceRoot: task.workspaceRoot,
        exitCode: 0,
        stdout: "Modified package configuration.",
        durationMs: Date.now() - startTime,
        modifiedFilesClaimed: ["package.json"],
        actualModifiedFiles: modifiedFiles,
        gitDiffProduced: diff,
      };
    }

    // Scenario: Valid Fix (default)
    try {
      let content = await readFile(targetAbsPath, "utf8");

      // Apply standard deterministic fixes based on defect categories
      if (content.includes("bg-gray-200 text-gray-400")) {
        content = content.replace("bg-gray-200 text-gray-400", "bg-blue-600 text-white min-h-[44px] min-w-[44px] p-2.5");
      } else if (content.includes("h-6 w-6")) {
        content = content.replace("h-6 w-6", "min-h-[44px] min-w-[44px] p-2");
      } else if (content.includes("w-[600px]") || content.includes("w-[650px]")) {
        content = content.replace(/w-\[\d+px\]/g, "w-full max-w-full");
      } else if (content.includes("text-[9px]")) {
        content = content.replace("text-[9px]", "text-sm");
      } else if (content.includes("p-0")) {
        content = content.replace("p-0", "p-4");
      } else if (content.includes("<h4>") && !content.includes("<h3>")) {
        content = content.replace("<h4>", "<h2>").replace("</h4>", "</h2>");
      } else if (content.includes("<img") && !content.includes("alt=")) {
        content = content.replace("<img", '<img alt="Preview" width="300" height="200"');
      } else {
        // Generic improvement: add accessible attributes and standard Tailwind classes
        content = content.replace("<button", '<button aria-label="Action"');
      }

      await writeFile(targetAbsPath, content, "utf8");

      const { modifiedFiles, diff } = await getGitStatusAndDiff(task.workspaceRoot);

      return {
        success: true,
        agentName: this.name,
        modelName: task.model || "mock-model",
        workspaceRoot: task.workspaceRoot,
        exitCode: 0,
        stdout: `Successfully refined ${targetRelPath} to address ${task.category} defect.`,
        durationMs: Date.now() - startTime,
        modifiedFilesClaimed: [targetRelPath],
        actualModifiedFiles: modifiedFiles,
        gitDiffProduced: diff,
      };
    } catch (err: any) {
      return {
        success: false,
        agentName: this.name,
        modelName: task.model || "mock-model",
        workspaceRoot: task.workspaceRoot,
        exitCode: 1,
        errorMessage: `Failed to edit target component: ${err.message}`,
        durationMs: Date.now() - startTime,
        errorCode: "AGENT_CRASH",
      };
    }
  }
}
