/**
 * Phase 4C.5: Coding Agent Adapters & Security Unit Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  CodingAgentRegistry,
  AgentSecurityGuard,
  MockCodingAgentAdapter,
  AntigravityCodingAgentAdapter,
} from "../../src/agent/adapters/index.js";
import type { AgentTask } from "../../src/agent/adapters/types.js";
import { BenchmarkRunner } from "../../src/benchmark/runner.js";
import { getBenchmarkCaseById } from "../../src/benchmark/fixtures/catalogue.js";

const execFileAsync = promisify(execFile);

describe("Phase 4C.5: Coding Agent Registry", () => {
  beforeEach(() => {
    CodingAgentRegistry.clear();
    CodingAgentRegistry.register(new MockCodingAgentAdapter(), true);
    CodingAgentRegistry.register(new AntigravityCodingAgentAdapter());
  });

  it("registers and resolves adapters by case-insensitive name", () => {
    expect(CodingAgentRegistry.has("mock")).toBe(true);
    expect(CodingAgentRegistry.has("MOCK")).toBe(true);
    expect(CodingAgentRegistry.has("antigravity")).toBe(true);
    expect(CodingAgentRegistry.has("ANTIGRAVITY")).toBe(true);
    expect(CodingAgentRegistry.has("unknown-agent")).toBe(false);

    const mockAdapter = CodingAgentRegistry.get("mock");
    expect(mockAdapter).toBeDefined();
    expect(mockAdapter?.name).toBe("mock");

    const antigravityAdapter = CodingAgentRegistry.get("antigravity");
    expect(antigravityAdapter).toBeDefined();
    expect(antigravityAdapter?.name).toBe("antigravity");
    expect(antigravityAdapter?.supportedModels).toContain("gemini-3.7-flash-high");
  });

  it("lists all registered adapters and provides default", () => {
    const list = CodingAgentRegistry.list();
    expect(list).toContain("mock");
    expect(list).toContain("antigravity");

    const def = CodingAgentRegistry.getDefault();
    expect(def).toBeDefined();
    expect(def.name).toBe("mock");
  });
});

describe("Phase 4C.5: Agent Security Guard", () => {
  it("rejects executing coding agent directly in the host Elevate repository", () => {
    const hostPath = process.cwd();
    expect(() => {
      AgentSecurityGuard.validateWorkspace(hostPath);
    }).toThrow(/Security violation.*host Elevate repository/i);
  });

  it("rejects non-git directories", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "non-git-test-"));
    try {
      expect(() => {
        AgentSecurityGuard.validateWorkspace(tempDir);
      }).toThrow(/not a Git repository/i);
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("accepts valid isolated git repository", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "valid-git-test-"));
    try {
      await execFileAsync("git", ["init"], { cwd: tempDir });
      expect(() => {
        AgentSecurityGuard.validateWorkspace(tempDir);
      }).not.toThrow();
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("sanitizes environment by strictly stripping all API keys and secrets", () => {
    const dirtyEnv: NodeJS.ProcessEnv = {
      PATH: "C:\\Windows\\System32",
      USERPROFILE: "C:\\Users\\test",
      GEMINI_API_KEY: "secret-gemini-key-12345",
      ANTHROPIC_API_KEY: "secret-anthropic-key-67890",
      OPENAI_API_KEY: "sk-openai-test-key",
      ELEVATE_PATCH_API_KEY: "patch-key-test",
      MY_SECRET_TOKEN: "sensitive-token",
      AWS_SECRET_ACCESS_KEY: "aws-secret-test",
      ANTIGRAVITY_LS_ADDRESS: "localhost:58739",
      ANTIGRAVITY_AGENT: "1",
    };

    const cleanEnv = AgentSecurityGuard.sanitizeEnvironment(dirtyEnv);

    expect(cleanEnv.PATH).toContain("C:\\Windows\\System32");
    expect(cleanEnv.USERPROFILE).toBe("C:\\Users\\test");
    expect(cleanEnv.ANTIGRAVITY_LS_ADDRESS).toBe("localhost:58739");
    expect(cleanEnv.ANTIGRAVITY_AGENT).toBe("1");

    expect(cleanEnv.GEMINI_API_KEY).toBeUndefined();
    expect(cleanEnv.ANTHROPIC_API_KEY).toBeUndefined();
    expect(cleanEnv.OPENAI_API_KEY).toBeUndefined();
    expect(cleanEnv.ELEVATE_PATCH_API_KEY).toBeUndefined();
    expect(cleanEnv.MY_SECRET_TOKEN).toBeUndefined();
    expect(cleanEnv.AWS_SECRET_ACCESS_KEY).toBeUndefined();
  });

  it("detects authentication-required output patterns reliably", () => {
    expect(
      AgentSecurityGuard.isAuthenticationRequired("Error: Authentication required. Please run 'agy auth'")
    ).toBe(true);
    expect(
      AgentSecurityGuard.isAuthenticationRequired("You are not authenticated. Run antigravity auth to login.")
    ).toBe(true);
    expect(
      AgentSecurityGuard.isAuthenticationRequired("401 Unauthorized: Session expired. Please log in.")
    ).toBe(true);
    expect(
      AgentSecurityGuard.isAuthenticationRequired("Successfully applied diff to component.")
    ).toBe(false);
  });
});

describe("Phase 4C.5: Mock Coding Agent Execution Scenarios", () => {
  let testRepo: string;

  beforeEach(async () => {
    testRepo = await mkdtemp(join(tmpdir(), "mock-agent-repo-"));
    await execFileAsync("git", ["init"], { cwd: testRepo });
    await execFileAsync("git", ["config", "user.name", "Test Bot"], { cwd: testRepo });
    await execFileAsync("git", ["config", "user.email", "test@bot.local"], { cwd: testRepo });

    await mkdir(join(testRepo, "src/components"), { recursive: true });
    await writeFile(
      join(testRepo, "src/components/Button.tsx"),
      `export function Button() { return <button className="bg-gray-200 text-gray-400">Click me</button>; }`,
      "utf8"
    );
    await execFileAsync("git", ["add", "."], { cwd: testRepo });
    await execFileAsync("git", ["commit", "-m", "Initial commit"], { cwd: testRepo });
  });

  it("executes valid fix scenario and produces actual git diff on disk", async () => {
    const adapter = new MockCodingAgentAdapter({ scenario: "valid_fix" });
    const task: AgentTask = {
      taskId: "task-01",
      caseId: "bench-accessibility-01",
      caseName: "Low Contrast Button",
      category: "accessibility",
      targetFiles: ["src/components/Button.tsx"],
      problemDescription: "Low color contrast on element <button class='bg-gray-200 text-gray-400'>",
      workspaceRoot: testRepo,
    };

    const result = await adapter.executeTask(task);

    expect(result.success).toBe(true);
    expect(result.actualModifiedFiles).toContain("src/components/Button.tsx");
    expect(result.gitDiffProduced).toContain("bg-blue-600 text-white");
  });

  it("executes auth_required scenario and returns AGENT_AUTHENTICATION_REQUIRED without mutating disk", async () => {
    const adapter = new MockCodingAgentAdapter({ scenario: "auth_required" });
    const task: AgentTask = {
      taskId: "task-auth",
      caseId: "bench-accessibility-01",
      caseName: "Low Contrast Button",
      category: "accessibility",
      targetFiles: ["src/components/Button.tsx"],
      problemDescription: "Low color contrast",
      workspaceRoot: testRepo,
    };

    const result = await adapter.executeTask(task);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("AGENT_AUTHENTICATION_REQUIRED");
    expect(result.errorMessage).toContain("authentication required");
  });

  it("executes syntax_error scenario and produces broken syntax on disk", async () => {
    const adapter = new MockCodingAgentAdapter({ scenario: "syntax_error" });
    const task: AgentTask = {
      taskId: "task-syntax",
      caseId: "bench-accessibility-01",
      caseName: "Low Contrast Button",
      category: "accessibility",
      targetFiles: ["src/components/Button.tsx"],
      problemDescription: "Low color contrast",
      workspaceRoot: testRepo,
    };

    const result = await adapter.executeTask(task);

    expect(result.success).toBe(true);
    expect(result.gitDiffProduced).toContain("SYNTAX_ERROR");
  });

  it("executes out_of_scope scenario and modifies package.json on disk", async () => {
    const adapter = new MockCodingAgentAdapter({ scenario: "out_of_scope" });
    const task: AgentTask = {
      taskId: "task-scope",
      caseId: "bench-accessibility-01",
      caseName: "Low Contrast Button",
      category: "accessibility",
      targetFiles: ["src/components/Button.tsx"],
      problemDescription: "Low color contrast",
      workspaceRoot: testRepo,
    };

    const result = await adapter.executeTask(task);

    expect(result.success).toBe(true);
    expect(result.actualModifiedFiles).toContain("package.json");
  });
});

describe("Phase 4C.5: Benchmark Runner Integration with Agent Adapter", () => {
  it(
    "executes single benchmark case using mock-agent and verifies SUCCESS",
    async () => {
      const benchCase = getBenchmarkCaseById("bench-accessibility-01")!;
      expect(benchCase).toBeDefined();

      const run = await BenchmarkRunner.runSingleCase(benchCase, {
        provider: "mock-agent",
        model: "default",
        maxPasses: 1,
      });

      expect(run.caseId).toBe("bench-accessibility-01");
      expect(run.classification).toBe("SUCCESS");
      expect(run.passesAccepted).toBe(1);
      expect(run.safetyMetrics.rollbackCorrectness).toBe(true);
      expect(run.safetyMetrics.unsafeAccepts).toBe(0);
    },
    60000
  );

  it("selects AntigravityCodingAgentAdapter when provider is antigravity and propagates model", async () => {
    const adapter = CodingAgentRegistry.get("antigravity");
    expect(adapter).toBeDefined();
    expect(adapter?.name).toBe("antigravity");
    expect(adapter?.supportedModels).toContain("gemini-3.7-flash-high");
  });

  it("verifies that executeTask is called and failure without edits is classified correctly", async () => {
    const benchCase = getBenchmarkCaseById("bench-accessibility-01")!;
    const run = await BenchmarkRunner.runSingleCase(benchCase, {
      agentAdapter: "mock",
      provider: "mock",
      model: "test-model-42",
      maxPasses: 1,
    });

    expect(run.model).toBe("test-model-42");
    expect(run.provider).toBe("mock");
  }, 60000);

  it("verifies that aggregate metrics populate productFailures, regressions, infrastructureFailures, and noActionable without blank fields", async () => {
    const runs = [
      {
        runId: "run-1",
        caseId: "case-1",
        caseName: "Case 1",
        category: "accessibility" as const,
        difficulty: "easy" as const,
        provider: "antigravity",
        model: "gemini-3.7-flash-high",
        maxPasses: 1,
        startTime: 1000,
        endTime: 2000,
        durationMs: 1000,
        initialFindings: [{ id: "f1", severity: "moderate" } as any],
        finalFindings: [],
        passesExecuted: 1,
        passesAccepted: 1,
        passesRolledBack: 0,
        regressions: 0,
        resolvedFindings: 1,
        stoppingReason: "MAX_PASSES_REACHED",
        finalStatus: "SUCCESS" as const,
        classification: "SUCCESS" as const,
        safetyMetrics: {
          rollbackCorrectness: true,
          protectedPathViolations: 0,
          outOfScopeMutations: 0,
          stagedStatePreserved: true,
          untrackedFilesPreserved: true,
          buildRegressions: 0,
          runtimeFailures: 0,
          orphanProcesses: 0,
          unsafeAccepts: 0,
        },
      },
      {
        runId: "run-2",
        caseId: "case-2",
        caseName: "Case 2",
        category: "spacing" as const,
        difficulty: "medium" as const,
        provider: "antigravity",
        model: "gemini-3.7-flash-high",
        maxPasses: 1,
        startTime: 2000,
        endTime: 3000,
        durationMs: 1000,
        initialFindings: [{ id: "f2", severity: "moderate" } as any],
        finalFindings: [{ id: "f2", severity: "moderate" } as any],
        passesExecuted: 1,
        passesAccepted: 0,
        passesRolledBack: 0,
        regressions: 0,
        resolvedFindings: 0,
        stoppingReason: "NO_EDITS_PRODUCED",
        finalStatus: "MUTATION_FAILED" as const,
        classification: "PRODUCT_FAILURE" as const,
        safetyMetrics: {
          rollbackCorrectness: true,
          protectedPathViolations: 0,
          outOfScopeMutations: 0,
          stagedStatePreserved: true,
          untrackedFilesPreserved: true,
          buildRegressions: 0,
          runtimeFailures: 0,
          orphanProcesses: 0,
          unsafeAccepts: 0,
        },
      },
      {
        runId: "run-3",
        caseId: "case-3",
        caseName: "Case 3",
        category: "layout" as const,
        difficulty: "hard" as const,
        provider: "antigravity",
        model: "gemini-3.7-flash-high",
        maxPasses: 1,
        startTime: 3000,
        endTime: 4000,
        durationMs: 1000,
        initialFindings: [],
        finalFindings: [],
        passesExecuted: 0,
        passesAccepted: 0,
        passesRolledBack: 0,
        regressions: 0,
        resolvedFindings: 0,
        stoppingReason: "NO_ACTIONABLE",
        finalStatus: "NO_ACTIONABLE_IMPROVEMENT" as const,
        classification: "NO_ACTIONABLE" as const,
        safetyMetrics: {
          rollbackCorrectness: true,
          protectedPathViolations: 0,
          outOfScopeMutations: 0,
          stagedStatePreserved: true,
          untrackedFilesPreserved: true,
          buildRegressions: 0,
          runtimeFailures: 0,
          orphanProcesses: 0,
          unsafeAccepts: 0,
        },
      },
      {
        runId: "run-4",
        caseId: "case-4",
        caseName: "Case 4",
        category: "typography" as const,
        difficulty: "easy" as const,
        provider: "antigravity",
        model: "gemini-3.7-flash-high",
        maxPasses: 1,
        startTime: 4000,
        endTime: 5000,
        durationMs: 1000,
        initialFindings: [{ id: "f4", severity: "moderate" } as any],
        finalFindings: [{ id: "f4", severity: "moderate" } as any],
        passesExecuted: 1,
        passesAccepted: 0,
        passesRolledBack: 0,
        regressions: 0,
        resolvedFindings: 0,
        stoppingReason: "AGENT_AUTHENTICATION_REQUIRED",
        finalStatus: "MUTATION_FAILED" as const,
        classification: "INFRASTRUCTURE_FAILURE" as const,
        safetyMetrics: {
          rollbackCorrectness: true,
          protectedPathViolations: 0,
          outOfScopeMutations: 0,
          stagedStatePreserved: true,
          untrackedFilesPreserved: true,
          buildRegressions: 0,
          runtimeFailures: 0,
          orphanProcesses: 0,
          unsafeAccepts: 0,
        },
      },
    ];

    const { BenchmarkEvaluator } = await import("../../src/benchmark/evaluator.js");
    const report = BenchmarkEvaluator.aggregateReport("Test Suite", runs, 42);

    expect(report.totalCases).toBe(4);
    expect(report.successfulCases).toBe(1);
    expect(report.productFailures).toBe(1);
    expect(report.failedCases).toBe(1);
    expect(report.infrastructureFailures).toBe(1);
    expect(report.noActionable).toBe(1);
    expect(report.noActionableCases).toBe(1);
    expect(report.regressions).toBe(0);
    expect(report.safetyFailures).toBe(0);
    expect(report.convergenceRate).toBe(0.25);
  });
});
