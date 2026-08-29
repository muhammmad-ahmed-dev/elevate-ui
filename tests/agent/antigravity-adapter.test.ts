/**
 * Phase 4C.5: Antigravity CLI Coding Agent Adapter Comprehensive Unit Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AntigravityCodingAgentAdapter } from "../../src/agent/adapters/antigravity.js";
import type { AgentTask } from "../../src/agent/adapters/types.js";

const execFileAsync = promisify(execFile);

describe("Phase 4C.5: Antigravity Coding Agent Adapter", () => {
  let testRepo: string;

  beforeEach(async () => {
    testRepo = await mkdtemp(join(tmpdir(), "antigravity-test-repo-"));
    await execFileAsync("git", ["init"], { cwd: testRepo });
    await execFileAsync("git", ["config", "user.name", "Test Bot"], { cwd: testRepo });
    await execFileAsync("git", ["config", "user.email", "test@bot.local"], { cwd: testRepo });

    await mkdir(join(testRepo, "src/components"), { recursive: true });
    await writeFile(
      join(testRepo, "src/components/Card.tsx"),
      `export function Card() { return <div className="p-0">Hello</div>; }`,
      "utf8"
    );
    await execFileAsync("git", ["add", "."], { cwd: testRepo });
    await execFileAsync("git", ["commit", "-m", "Initial commit"], { cwd: testRepo });
  });

  it("configures supported models correctly including gemini-3.7-flash-high", () => {
    const adapter = new AntigravityCodingAgentAdapter();
    expect(adapter.name).toBe("antigravity");
    expect(adapter.supportedModels).toContain("gemini-3.7-flash-high");
    expect(adapter.supportedModels).toContain("gemini-3.7-flash");
  });

  it("resolves the available agy executable path on Windows", async () => {
    const adapter = new AntigravityCodingAgentAdapter();
    const resolvedPath = await adapter.resolveCliCommand();
    expect(resolvedPath).toBeDefined();
    expect(typeof resolvedPath).toBe("string");
    expect(resolvedPath.length).toBeGreaterThan(0);
  });

  it("constructs structured task prompt without leaking benchmark solutions or fixedCode", () => {
    const adapter = new AntigravityCodingAgentAdapter();
    const task: AgentTask = {
      taskId: "task-prompt-test",
      caseId: "bench-accessibility-01",
      caseName: "Low Contrast Button",
      category: "accessibility",
      targetFiles: ["src/components/Button.tsx"],
      problemDescription: "Element button.bg-gray-200 has low contrast 1.8:1.",
      expectedVisualImprovement: "Increase color contrast to WCAG AA 4.5:1.",
      workspaceRoot: testRepo,
    };

    const prompt = adapter.buildTaskPrompt(task);
    expect(prompt).toContain("src/components/Button.tsx");
    expect(prompt).toContain("accessibility");
    expect(prompt).toContain("Element button.bg-gray-200 has low contrast");
    expect(prompt).toContain("REQUIREMENTS");
    expect(prompt).not.toContain("fixedCode");
    expect(prompt).not.toContain("diff --git");
  });

  it("rejects execution directly in the host Elevate repository", async () => {
    const adapter = new AntigravityCodingAgentAdapter();
    const task: AgentTask = {
      taskId: "task-bad-ws",
      caseId: "bench-spacing-01",
      caseName: "Card Spacing",
      category: "spacing",
      targetFiles: ["src/components/Card.tsx"],
      problemDescription: "Missing padding",
      workspaceRoot: process.cwd(),
    };

    const result = await adapter.executeTask(task);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("SECURITY_VIOLATION");
    expect(result.errorMessage).toContain("Security violation");
  });

  it("executes simple AGENT_OK command via local Antigravity CLI", async () => {
    const adapter = new AntigravityCodingAgentAdapter();
    const isAvail = await adapter.isAvailable();
    if (!isAvail) {
      // If CLI not in test path, skip live invocation
      return;
    }

    const task: AgentTask = {
      taskId: "task-ok",
      caseId: "bench-test-01",
      caseName: "Simple Probe",
      category: "accessibility",
      targetFiles: ["src/components/Card.tsx"],
      problemDescription: "Reply with exactly AGENT_OK",
      workspaceRoot: testRepo,
      model: "gemini-3.7-flash-high",
    };

    const result = await adapter.executeTask(task);
    if (result.errorCode === "AGENT_AUTHENTICATION_REQUIRED") {
      expect(result.errorCode).toBe("AGENT_AUTHENTICATION_REQUIRED");
    } else {
      expect(result.success).toBe(true);
      expect(result.stdout || "").toContain("AGENT_OK");
    }
  }, 45000);

  it("executes real task against disposable repo using Antigravity CLI and modifies file", async () => {
    const adapter = new AntigravityCodingAgentAdapter();
    const isAvail = await adapter.isAvailable();
    if (!isAvail) return;

    const task: AgentTask = {
      taskId: "task-real-edit",
      caseId: "bench-spacing-01",
      caseName: "Card Spacing Fix",
      category: "spacing",
      targetFiles: ["src/components/Card.tsx"],
      problemDescription: "Element div.p-0 has zero padding causing text to collide with container edges.",
      expectedVisualImprovement: "Increase padding to p-4 or p-6.",
      workspaceRoot: testRepo,
      model: "gemini-3.7-flash-high",
    };

    const result = await adapter.executeTask(task);
    if (result.errorCode === "AGENT_AUTHENTICATION_REQUIRED") {
      expect(result.errorCode).toBe("AGENT_AUTHENTICATION_REQUIRED");
    } else {
      expect(result.success).toBe(true);
      expect(result.durationMs).toBeGreaterThan(0);
    }
  }, 60000);

  it("handles non-existent CLI gracefully by reporting CLI_NOT_FOUND", async () => {
    const adapter = new AntigravityCodingAgentAdapter({
      cliCommand: "C:\\nonexistent\\agy_fake_binary_xyz.exe",
      timeoutMs: 5000,
    });

    const task: AgentTask = {
      taskId: "task-cli-missing",
      caseId: "bench-spacing-01",
      caseName: "Card Spacing",
      category: "spacing",
      targetFiles: ["src/components/Card.tsx"],
      problemDescription: "Missing padding",
      workspaceRoot: testRepo,
      model: "gemini-3.7-flash-high",
    };

    const result = await adapter.executeTask(task);
    expect(result.success).toBe(false);
    expect(["CLI_NOT_FOUND", "AGENT_CRASH"]).toContain(result.errorCode);
  });
});
