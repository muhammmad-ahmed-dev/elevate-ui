/**
 * Phase 3E: Decision Gate Tests
 *
 * Tests Scenarios U through Y, AB, AC:
 *  U. DecisionGate accept when hard gates pass and targeted issue improved
 *  V. DecisionGate rollback when hard gate fails or regression appears
 *  W. DecisionGate error when rollback fails
 *  X. Rollback success restores repository cleanly
 *  Y. Rollback criticalError surfaces recovery instructions
 *  AB. No direct GitManager.rollback() invocation
 *  AC. No git clean invocation in verify module
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DecisionGate } from "../../../src/agent/patch/verify/decision.js";
import { assembleBeforeAfterComparison } from "../../../src/agent/patch/verify/regression.js";
import type { MutationTransaction } from "../../../src/agent/types.js";
import type { Finding, MutationRecommendation } from "../../../src/analysis/types.js";
import type {
  BrowserVerificationResult,
  VerificationGateResult,
  VisualReanalysisResult,
} from "../../../src/agent/patch/verify/types.js";

const execFileAsync = promisify(execFile);

let tempRepo: string;

async function gitExec(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd: tempRepo,
    windowsHide: true,
  });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

async function initGitRepo(): Promise<void> {
  await gitExec(["init"]);
  await gitExec(["config", "user.name", "Elevate Test"]);
  await gitExec(["config", "user.email", "test@elevate.local"]);
  await writeFile(join(tempRepo, "README.md"), "# Initial Commit\n", "utf8");
  await gitExec(["add", "README.md"]);
  await gitExec(["commit", "-m", "Initial commit"]);
}

function makeFakeTransaction(overrides: Partial<MutationTransaction> = {}): MutationTransaction {
  return {
    transactionId: "tx-test-decision",
    recommendationId: "rec-test-1",
    startedAt: new Date().toISOString(),
    repositoryRoot: tempRepo,
    transactionState: "APPLIED",
    gitHeadBefore: "head123",
    workingTreeStateBefore: {
      headCommit: "head123",
      branch: "main",
      modifiedFiles: [],
      untrackedFiles: [],
      stagedFiles: [],
      unstagedFiles: [],
    },
    stagedFilesBefore: [],
    unstagedFilesBefore: [],
    untrackedFilesBefore: [],
    filesAuthorizedForMutation: ["src/Button.tsx"],
    filesCreatedByMutation: [],
    filesModifiedByMutation: [],
    verificationResults: [],
    decision: "PENDING",
    ...overrides,
  };
}

const mockRecommendation: MutationRecommendation = {
  id: "rec-test-1",
  problem: "Missing aria-label on button",
  evidence: { selector: "button.cta" },
  affectedSelector: "button.cta",
  affectedViewports: ["desktop"],
  proposedImprovement: "Add aria-label to button.cta",
  rationale: "Fix WCAG compliance",
  confidence: 1.0,
  estimatedMutationScope: "single-element",
  risk: "low",
  sourceFindingIds: ["finding-cta-1"],
};

const passingHardGates: VerificationGateResult[] = [
  { name: "TypeScript", passed: true, output: "ok", durationMs: 50, mandatory: true },
  { name: "Framework Build", passed: true, output: "ok", durationMs: 100, mandatory: true },
];

const successfulBrowserCheck: BrowserVerificationResult = {
  success: true,
  viewportsCaptured: 3,
  screenshotPaths: [],
  errors: [],
  durationMs: 200,
};

const visualResult: VisualReanalysisResult = {
  available: false,
  findings: [],
  errors: [],
  durationMs: 0,
};

beforeEach(async () => {
  tempRepo = await mkdtemp(join(tmpdir(), "elevate-decision-test-"));
});

afterEach(async () => {
  try {
    await rm(tempRepo, { recursive: true, force: true });
  } catch {
    // Ignore cleanup error on Windows
  }
});

describe("DecisionGate Evaluation (Scenarios U, V, W, X, Y)", () => {
  it("returns ACCEPT and marks transaction COMPLETED when hard gates pass and targeted issue improved (U)", async () => {
    await initGitRepo();
    const gate = new DecisionGate(tempRepo);
    const tx = makeFakeTransaction();

    const beforeFindings: Finding[] = [
      {
        id: "finding-cta-1",
        category: "accessibility",
        severity: "serious",
        title: "Missing label",
        description: "No label",
        evidence: {},
        selector: "button.cta",
        viewport: "desktop",
        source: "deterministic",
        deterministic: true,
        confidence: 1.0,
      },
    ];
    const afterFindings: Finding[] = []; // Resolved!

    const comparison = assembleBeforeAfterComparison(
      tx.transactionId,
      mockRecommendation,
      beforeFindings,
      afterFindings,
      passingHardGates,
      successfulBrowserCheck,
      visualResult
    );

    const result = await gate.evaluate(tx, comparison);

    expect(result.decision).toBe("ACCEPT");
    expect(tx.transactionState).toBe("COMPLETED");
    expect(tx.decision).toBe("ACCEPT");
    expect(tx.completedAt).toBeDefined();
    expect(result.rationale.some((r) => r.includes("ACCEPT"))).toBe(true);
  });

  it("returns ROLLBACK when any hard gate fails (V)", async () => {
    await initGitRepo();
    const gate = new DecisionGate(tempRepo);
    const tx = makeFakeTransaction();

    const failingHardGates: VerificationGateResult[] = [
      { name: "TypeScript", passed: false, output: "Syntax error", error: "Failed", durationMs: 50, mandatory: true },
      { name: "Framework Build", passed: false, output: "Skipped", error: "Skipped", durationMs: 0, mandatory: true },
    ];

    const comparison = assembleBeforeAfterComparison(
      tx.transactionId,
      mockRecommendation,
      [],
      [],
      failingHardGates,
      successfulBrowserCheck,
      visualResult
    );

    const result = await gate.evaluate(tx, comparison);

    expect(result.decision).toBe("ROLLBACK");
    expect(tx.transactionState).toBe("ROLLED_BACK");
    expect(result.rollbackResult?.success).toBe(true);
    expect(result.rationale.some((r) => r.includes("HARD GATE FAILURE"))).toBe(true);
  });

  it("returns ROLLBACK when a new critical regression is introduced (V)", async () => {
    await initGitRepo();
    const gate = new DecisionGate(tempRepo);
    const tx = makeFakeTransaction();

    const beforeFindings: Finding[] = [];
    const afterFindings: Finding[] = [
      {
        id: "new-critical-finding",
        category: "accessibility",
        severity: "critical",
        title: "Fatal markup breakage",
        description: "Entire form inaccessible",
        evidence: {},
        viewport: "desktop",
        source: "deterministic",
        deterministic: true,
        confidence: 1.0,
      },
    ];

    const comparison = assembleBeforeAfterComparison(
      tx.transactionId,
      mockRecommendation,
      beforeFindings,
      afterFindings,
      passingHardGates,
      successfulBrowserCheck,
      visualResult
    );

    const result = await gate.evaluate(tx, comparison);

    expect(result.decision).toBe("ROLLBACK");
    expect(result.rationale.some((r) => r.includes("REGRESSION"))).toBe(true);
  });

  it("returns ROLLBACK when targeted issue worsens (V)", async () => {
    await initGitRepo();
    const gate = new DecisionGate(tempRepo);
    const tx = makeFakeTransaction();

    const beforeFindings: Finding[] = [
      {
        id: "f1",
        category: "accessibility",
        severity: "minor",
        title: "Minor label issue",
        description: "",
        evidence: {},
        selector: "button.cta",
        viewport: "desktop",
        source: "deterministic",
        deterministic: true,
        confidence: 1.0,
      },
    ];
    const afterFindings: Finding[] = [
      {
        id: "f1",
        category: "accessibility",
        severity: "critical", // Worsened!
        title: "Minor label issue",
        description: "",
        evidence: {},
        selector: "button.cta",
        viewport: "desktop",
        source: "deterministic",
        deterministic: true,
        confidence: 1.0,
      },
    ];

    const comparison = assembleBeforeAfterComparison(
      tx.transactionId,
      mockRecommendation,
      beforeFindings,
      afterFindings,
      passingHardGates,
      successfulBrowserCheck,
      visualResult
    );

    const result = await gate.evaluate(tx, comparison);

    expect(result.decision).toBe("ROLLBACK");
    expect(result.rationale.some((r) => r.includes("worsened"))).toBe(true);
  });

  it("returns ACCEPT on neutral result when allowNeutralVisualResult policy is set", async () => {
    await initGitRepo();
    const gate = new DecisionGate(tempRepo);
    const tx = makeFakeTransaction();

    // No findings before or after
    const comparison = assembleBeforeAfterComparison(
      tx.transactionId,
      mockRecommendation,
      [],
      [],
      passingHardGates,
      successfulBrowserCheck,
      visualResult
    );

    const result = await gate.evaluate(tx, comparison, { allowNeutralVisualResult: true });

    expect(result.decision).toBe("ACCEPT");
    expect(tx.transactionState).toBe("COMPLETED");
  });

  it("surfaces recovery instructions when rollback fails critically (W & Y)", async () => {
    // Target invalid non-existent repo directory to induce rollback failure
    const invalidDir = "/non/existent/path/for/failure";
    const gate = new DecisionGate(invalidDir);
    const tx = makeFakeTransaction({
      repositoryRoot: invalidDir,
      filesModifiedByMutation: ["/non/existent/file.tsx"],
    });

    const failingHardGates: VerificationGateResult[] = [
      { name: "TypeScript", passed: false, output: "fail", error: "fail", durationMs: 0, mandatory: true },
    ];

    const comparison = assembleBeforeAfterComparison(
      tx.transactionId,
      mockRecommendation,
      [],
      [],
      failingHardGates,
      successfulBrowserCheck,
      visualResult
    );

    const result = await gate.evaluate(tx, comparison);

    expect(result.decision).toBe("ERROR");
    expect(result.recoveryInstructions).toBeDefined();
    expect(result.recoveryInstructions?.length).toBeGreaterThan(0);
    expect(result.recoveryInstructions?.some((i) => i.includes("git stash list"))).toBe(true);
  });
});

describe("Binding Safety Invariant Verification (Scenarios AB & AC)", () => {
  it("does not call GitManager.rollback in verify module source code (AB)", async () => {
    const decisionSrc = await readFile(
      join(__dirname, "../../../src/agent/patch/verify/decision.ts"),
      "utf8"
    );
    expect(decisionSrc).not.toContain("GitManager");

    const indexSrc = await readFile(
      join(__dirname, "../../../src/agent/patch/verify/index.ts"),
      "utf8"
    );
    expect(indexSrc).not.toContain("GitManager.rollback");
  });

  it("does not call git clean in any verify module source file (AC)", async () => {
    const files = [
      "types.ts",
      "typecheck.ts",
      "build.ts",
      "runtime.ts",
      "browser.ts",
      "regression.ts",
      "decision.ts",
      "gates.ts",
      "index.ts",
    ];

    for (const file of files) {
      const src = await readFile(
        join(__dirname, "../../../src/agent/patch/verify", file),
        "utf8"
      );
      expect(src).not.toContain("git clean");
      expect(src).not.toContain("clean -fd");
    }
  });
});
