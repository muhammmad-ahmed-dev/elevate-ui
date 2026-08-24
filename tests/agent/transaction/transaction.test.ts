/**
 * Phase 3D Tests — Mutation Transaction, Safe Patch Application & Exact Rollback
 *
 * Validates scenarios A through V and all 6 safety invariants on real temporary
 * Git repositories.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MutationTransactionRunner } from "../../../src/agent/patch/transaction/transaction.js";
import { runPreflightChecks } from "../../../src/agent/patch/transaction/preflight.js";
import { checkPatchDryRun } from "../../../src/agent/patch/transaction/apply.js";
import { rollbackTransaction } from "../../../src/agent/patch/transaction/rollback.js";
import { parseDiff } from "../../../src/agent/patch/validate/parser.js";
import { hashPatch } from "../../../src/agent/patch/hash.js";
import type { ValidatedPatch } from "../../../src/agent/patch/validate/types.js";
import type { MutationTransaction } from "../../../src/agent/types.js";

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
}

async function commitInitialFile(relPath: string, content: string): Promise<void> {
  const fullPath = join(tempRepo, relPath);
  const dir = fullPath.substring(0, Math.max(fullPath.lastIndexOf("/"), fullPath.lastIndexOf("\\")));
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dir, { recursive: true });
  const formatted = content.endsWith("\n") ? content : content + "\n";
  await writeFile(fullPath, formatted, "utf8");
  await gitExec(["add", relPath]);
  await gitExec(["commit", "-m", `Add ${relPath}`]);
}

function makeValidatedPatch(rawPatch: string, normalizedFiles: string[]): ValidatedPatch {
  const parsedDiff = parseDiff(rawPatch, { strictHunkCounts: false });
  const originalPatchHash = hashPatch(rawPatch);

  return {
    originalPatchHash,
    rawPatch,
    parsedDiff,
    normalizedFiles,
    providerClaimedFiles: [...normalizedFiles],
    pathGuardResult: { valid: true, violations: [], normalizedPaths: [...normalizedFiles] },
    scopeResult: {
      valid: true,
      violations: [],
      filesChecked: [...normalizedFiles],
      totalAdditions: parsedDiff.totalAdditions,
      totalDeletions: parsedDiff.totalDeletions,
      totalChanged: parsedDiff.totalChanged,
    },
    astResult: {
      valid: true,
      violations: [],
      warnings: [],
      changedFiles: [...normalizedFiles],
      changedComponents: [],
      changedHooks: [],
      changedImports: [],
      changedExports: [],
      changedNetworkOperations: [],
      additions: parsedDiff.totalAdditions,
      deletions: parsedDiff.totalDeletions,
      risk: "low",
    },
    violations: [],
    warnings: [],
    valid: true,
    risk: "low",
    validatedAt: new Date().toISOString(),
  };
}

beforeEach(async () => {
  tempRepo = await mkdtemp(join(tmpdir(), "elevate-tx-test-"));
});

afterEach(async () => {
  try {
    await rm(tempRepo, { recursive: true, force: true });
  } catch {
    // Ignore cleanup error on Windows
  }
});

// ---------------------------------------------------------------------------
// A & B. Checkpoint creation & exact Git state capture
// ---------------------------------------------------------------------------

describe("Transaction Checkpoint & State Capture (Scenarios A & B)", () => {
  it("creates checkpoint and captures clean repository state", async () => {
    await initGitRepo();
    await commitInitialFile("src/Button.tsx", `export function Button() { return <button>Click</button>; }`);

    const patch = `--- a/src/Button.tsx
+++ b/src/Button.tsx
@@ -1,1 +1,1 @@
-export function Button() { return <button>Click</button>; }
+export function Button() { return <button className="bg-blue-600">Click</button>; }`;

    const validatedPatch = makeValidatedPatch(patch, ["src/Button.tsx"]);
    const runner = new MutationTransactionRunner({ projectRoot: tempRepo });
    const result = await runner.execute(validatedPatch, "rec-1", ["src/Button.tsx"]);

    expect(result.success).toBe(true);
    expect(result.transaction.transactionState).toBe("APPLIED");
    expect(result.transaction.gitHeadBefore).toBeTruthy();
    expect(result.transaction.stagedFilesBefore).toHaveLength(0);
    expect(result.transaction.unstagedFilesBefore).toHaveLength(0);
    expect(result.transaction.untrackedFilesBefore).toHaveLength(0);

    const checkpoint = runner.getCheckpoint();
    expect(checkpoint).toBeDefined();
    expect(checkpoint?.stashed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C, D, E, F. Staged, unstaged, untracked & ignored preservation
// ---------------------------------------------------------------------------

describe("Working Tree Preservation (Scenarios C, D, E, F)", () => {
  it("preserves staged index state through checkpoint -> mutation -> rollback (C)", async () => {
    await initGitRepo();
    await commitInitialFile("src/UserStaged.tsx", "Original User Content");
    await commitInitialFile("src/Button.tsx", "Original Button");

    // User modifies and stages UserStaged.tsx
    await writeFile(join(tempRepo, "src/UserStaged.tsx"), "User Staged Changes", "utf8");
    await gitExec(["add", "src/UserStaged.tsx"]);

    const patch = `--- a/src/Button.tsx
+++ b/src/Button.tsx
@@ -1,1 +1,1 @@
-Original Button
+Mutated Button`;

    const validatedPatch = makeValidatedPatch(patch, ["src/Button.tsx"]);
    const runner = new MutationTransactionRunner({ projectRoot: tempRepo });

    const result = await runner.execute(validatedPatch, "rec-staged", ["src/Button.tsx"]);
    expect(result.success).toBe(true);

    // Rollback
    const rb = await runner.rollback(result.transaction);
    expect(rb.success).toBe(true);
    expect(rb.stagedPreserved).toBe(true);

    // User staged file must still be staged with user changes
    const stagedContent = await readFile(join(tempRepo, "src/UserStaged.tsx"), "utf8");
    expect(stagedContent).toBe("User Staged Changes");

    const { stdout: statusAfter } = await gitExec(["status", "--porcelain"]);
    expect(statusAfter).toMatch(/^M /); // Staged index entry
  });

  it("preserves unstaged changes and untracked files through transaction & rollback (D & E)", async () => {
    await initGitRepo();
    await commitInitialFile("src/Tracked.tsx", "Original Tracked");
    await commitInitialFile("src/Button.tsx", "Original Button");

    // Unstaged modification
    await writeFile(join(tempRepo, "src/Tracked.tsx"), "User Unstaged Work", "utf8");

    // Pre-existing untracked file
    await writeFile(join(tempRepo, "user-notes.txt"), "Important user notes", "utf8");

    const patch = `--- a/src/Button.tsx
+++ b/src/Button.tsx
@@ -1,1 +1,1 @@
-Original Button
+Mutated Button`;

    const validatedPatch = makeValidatedPatch(patch, ["src/Button.tsx"]);
    const runner = new MutationTransactionRunner({ projectRoot: tempRepo });

    const result = await runner.execute(validatedPatch, "rec-mixed", ["src/Button.tsx"]);
    expect(result.success).toBe(true);

    // Rollback
    const rb = await runner.rollback(result.transaction);
    expect(rb.success).toBe(true);

    // Verify unstaged content is restored
    const trackedContent = await readFile(join(tempRepo, "src/Tracked.tsx"), "utf8");
    expect(trackedContent).toBe("User Unstaged Work");

    // Verify pre-existing untracked file is preserved
    const notesContent = await readFile(join(tempRepo, "user-notes.txt"), "utf8");
    expect(notesContent).toBe("Important user notes");
  });

  it("preserves ignored files (.gitignore) (F)", async () => {
    await initGitRepo();
    await commitInitialFile(".gitignore", "node_modules/\n*.log\n");
    await commitInitialFile("src/Button.tsx", "Original Button");

    // Create an ignored file
    await writeFile(join(tempRepo, "debug.log"), "Some log content", "utf8");

    const patch = `--- a/src/Button.tsx
+++ b/src/Button.tsx
@@ -1,1 +1,1 @@
-Original Button
+Mutated Button`;

    const validatedPatch = makeValidatedPatch(patch, ["src/Button.tsx"]);
    const runner = new MutationTransactionRunner({ projectRoot: tempRepo });

    const result = await runner.execute(validatedPatch, "rec-ignore", ["src/Button.tsx"]);
    expect(result.success).toBe(true);

    await runner.rollback(result.transaction);

    // Ignored file must remain intact
    const logContent = await readFile(join(tempRepo, "debug.log"), "utf8");
    expect(logContent).toBe("Some log content");
  });
});

// ---------------------------------------------------------------------------
// G & H. Mutation tracking: created and modified files
// ---------------------------------------------------------------------------

describe("Mutation Tracking (Scenarios G & H)", () => {
  it("tracks modified files and created files accurately", async () => {
    await initGitRepo();
    await commitInitialFile("src/Button.tsx", "Original Button");

    const patch = `--- a/src/Button.tsx
+++ b/src/Button.tsx
@@ -1,1 +1,1 @@
-Original Button
+Mutated Button
--- /dev/null
+++ b/src/Badge.tsx
@@ -0,0 +1,1 @@
+export function Badge() { return <span>New</span>; }`;

    const validatedPatch = makeValidatedPatch(patch, ["src/Button.tsx", "src/Badge.tsx"]);
    const runner = new MutationTransactionRunner({ projectRoot: tempRepo });

    const result = await runner.execute(validatedPatch, "rec-multi", [
      "src/Button.tsx",
      "src/Badge.tsx",
    ]);

    expect(result.success).toBe(true);
    expect(result.filesModified).toHaveLength(1);
    expect(result.filesModified[0]).toContain("Button.tsx");
    expect(result.filesCreated).toHaveLength(1);
    expect(result.filesCreated[0]).toContain("Badge.tsx");

    // Verify new file exists on disk
    const badgeContent = await readFile(join(tempRepo, "src/Badge.tsx"), "utf8");
    expect(badgeContent).toContain("Badge");

    // Rollback: modified file restored, created file removed
    const rb = await runner.rollback(result.transaction);
    expect(rb.success).toBe(true);
    expect(rb.restoredFiles.some((f) => f.includes("Button.tsx"))).toBe(true);
    expect(rb.deletedFiles.some((f) => f.includes("Badge.tsx"))).toBe(true);

    // Button restored
    const buttonContent = await readFile(join(tempRepo, "src/Button.tsx"), "utf8");
    expect(buttonContent.trim()).toBe("Original Button");

    // Badge deleted
    await expect(stat(join(tempRepo, "src/Badge.tsx"))).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// I & J. git apply --check dry-run and patch application
// ---------------------------------------------------------------------------

describe("Patch Application & Dry Run (Scenarios I & J)", () => {
  it("verifies git apply --check dry run passes for valid patch and fails for invalid patch", async () => {
    await initGitRepo();
    await commitInitialFile("src/Button.tsx", "Original Button");

    const validPatch = `--- a/src/Button.tsx
+++ b/src/Button.tsx
@@ -1,1 +1,1 @@
-Original Button
+Valid Patch`;

    const invalidPatch = `--- a/src/Button.tsx
+++ b/src/Button.tsx
@@ -1,1 +1,1 @@
-NonExistent Context Line
+Will Fail`;

    const check1 = await checkPatchDryRun(tempRepo, validPatch);
    expect(check1.success).toBe(true);

    const check2 = await checkPatchDryRun(tempRepo, invalidPatch);
    expect(check2.success).toBe(false);
    expect(check2.error).toContain("git apply --check failed");
  });
});

// ---------------------------------------------------------------------------
// K, L, M. Rollback scenarios (successful, failed apply, partial)
// ---------------------------------------------------------------------------

describe("Rollback Mechanics (Scenarios K, L, M)", () => {
  it("handles rollback cleanly after application failure without leaving partial state (L & M)", async () => {
    await initGitRepo();
    await commitInitialFile("src/Button.tsx", "Original Button");

    // Patch that targets non-existent line to force git apply failure
    const badPatch = `--- a/src/Button.tsx
+++ b/src/Button.tsx
@@ -1,1 +1,1 @@
-Wrong Base Line
+New`;

    const validatedPatch = makeValidatedPatch(badPatch, ["src/Button.tsx"]);
    const runner = new MutationTransactionRunner({ projectRoot: tempRepo });

    const result = await runner.execute(validatedPatch, "rec-fail", ["src/Button.tsx"]);
    expect(result.success).toBe(false);
    expect(result.transaction.transactionState).toBe("FAILED");
    expect(result.transaction.decision).toBe("ROLLBACK");

    // Working tree is clean
    const buttonContent = await readFile(join(tempRepo, "src/Button.tsx"), "utf8");
    expect(buttonContent.trim()).toBe("Original Button");
  });
});

// ---------------------------------------------------------------------------
// N & O. Stash handling and pre-existing stash preservation
// ---------------------------------------------------------------------------

describe("Stash Handling (Scenarios N & O)", () => {
  it("preserves pre-existing user stash without corrupting it", async () => {
    await initGitRepo();
    await commitInitialFile("src/Base.tsx", "Base content");

    // Create a pre-existing user stash
    await writeFile(join(tempRepo, "src/Base.tsx"), "User important stash work", "utf8");
    await gitExec(["stash", "push", "-m", "user-important-stash"]);

    // Verify stash list has 1 entry
    const { stdout: stashBefore } = await gitExec(["stash", "list"]);
    expect(stashBefore).toContain("user-important-stash");

    // Run transaction on clean tree
    const patch = `--- a/src/Base.tsx
+++ b/src/Base.tsx
@@ -1,1 +1,1 @@
-Base content
+Mutated content`;

    const validatedPatch = makeValidatedPatch(patch, ["src/Base.tsx"]);
    const runner = new MutationTransactionRunner({ projectRoot: tempRepo });

    const result = await runner.execute(validatedPatch, "rec-stash-test", ["src/Base.tsx"]);
    expect(result.success).toBe(true);

    await runner.rollback(result.transaction);

    // Pre-existing stash MUST still exist in stash list
    const { stdout: stashAfter } = await gitExec(["stash", "list"]);
    expect(stashAfter).toContain("user-important-stash");
  });
});

// ---------------------------------------------------------------------------
// P, Q, R. Preflight rejections (empty HEAD, protected paths, drift)
// ---------------------------------------------------------------------------

describe("Preflight Rejections (Scenarios P, Q, R)", () => {
  it("rejects empty HEAD repository with descriptive error (P)", async () => {
    await gitExec(["init"]);
    const patch = `--- a/file.txt\n+++ b/file.txt\n@@ -0,0 +1 @@\n+test`;
    const validatedPatch = makeValidatedPatch(patch, ["file.txt"]);

    const preflight = await runPreflightChecks(tempRepo, validatedPatch);
    expect(preflight.valid).toBe(false);
    expect(preflight.errors.some((e) => /empty HEAD/i.test(e))).toBe(true);
  });

  it("rejects protected path mutation during preflight (Q)", async () => {
    await initGitRepo();
    await commitInitialFile("package.json", '{"name":"test"}');

    const patch = `--- a/package.json
+++ b/package.json
@@ -1,1 +1,1 @@
-{"name":"test"}
+{"name":"mutated"}`;

    const validatedPatch = makeValidatedPatch(patch, ["package.json"]);
    const preflight = await runPreflightChecks(tempRepo, validatedPatch);
    expect(preflight.valid).toBe(false);
    expect(preflight.errors.some((e) => /protected path/i.test(e))).toBe(true);
  });

  it("rejects transaction if patch hash does not match ValidatedPatch (R)", async () => {
    await initGitRepo();
    await commitInitialFile("src/Button.tsx", "Original Button");

    const patch = `--- a/src/Button.tsx
+++ b/src/Button.tsx
@@ -1,1 +1,1 @@
-Original Button
+Mutated`;

    const validatedPatch = makeValidatedPatch(patch, ["src/Button.tsx"]);
    // Corrupt the hash to simulate drift
    validatedPatch.originalPatchHash = "corrupted-hash-12345";

    const preflight = await runPreflightChecks(tempRepo, validatedPatch);
    expect(preflight.valid).toBe(false);
    expect(preflight.errors.some((e) => /integrity violation/i.test(e))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// S & T. State machine transitions and rollback failure reporting
// ---------------------------------------------------------------------------

describe("State Machine & Error Reporting (Scenarios S & T)", () => {
  it("enforces valid state machine transitions (S)", async () => {
    await initGitRepo();
    await commitInitialFile("src/Button.tsx", "Original Button");

    const runner = new MutationTransactionRunner({ projectRoot: tempRepo });
    const fakeTx: MutationTransaction = {
      transactionId: "fake-tx",
      recommendationId: "rec-fake",
      startedAt: new Date().toISOString(),
      repositoryRoot: tempRepo,
      transactionState: "CREATED",
      gitHeadBefore: "abc",
      workingTreeStateBefore: {
        headCommit: "abc",
        branch: "main",
        modifiedFiles: [],
        untrackedFiles: [],
        stagedFiles: [],
        unstagedFiles: [],
      },
      stagedFilesBefore: [],
      unstagedFilesBefore: [],
      untrackedFilesBefore: [],
      filesAuthorizedForMutation: [],
      filesCreatedByMutation: [],
      filesModifiedByMutation: [],
      verificationResults: [],
      decision: "PENDING",
    };

    // Cannot jump directly from CREATED to ROLLED_BACK without checkpoint/applying
    await expect(runner.rollback(fakeTx)).rejects.toThrow(/Invalid transaction state transition/);
  });

  it("surfaces rollback failure with criticalError flag (T)", async () => {
    const fakeTx: MutationTransaction = {
      transactionId: "fake-tx-2",
      recommendationId: "rec-fake",
      startedAt: new Date().toISOString(),
      repositoryRoot: "/non/existent/path/for/failure",
      transactionState: "APPLIED",
      gitHeadBefore: "abc",
      workingTreeStateBefore: {
        headCommit: "abc",
        branch: "main",
        modifiedFiles: [],
        untrackedFiles: [],
        stagedFiles: [],
        unstagedFiles: [],
      },
      stagedFilesBefore: [],
      unstagedFilesBefore: [],
      untrackedFilesBefore: [],
      filesAuthorizedForMutation: [],
      filesCreatedByMutation: [],
      filesModifiedByMutation: ["/non/existent/path/file.tsx"],
      verificationResults: [],
      decision: "PENDING",
    };

    const rbResult = await rollbackTransaction("/non/existent/path/for/failure", fakeTx);
    expect(rbResult.success).toBe(false);
    expect(rbResult.criticalError).toBe(true);
    expect(rbResult.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// U & V. No blanket git clean & scope limitation
// ---------------------------------------------------------------------------

describe("Safety Constraints (Scenarios U & V)", () => {
  it("does not use git clean in rollback implementation (U)", async () => {
    const rollbackSource = await readFile(
      join(__dirname, "../../../src/agent/patch/transaction/rollback.ts"),
      "utf8"
    );
    expect(rollbackSource).not.toContain("git clean");
    expect(rollbackSource).not.toContain('"clean"');
    expect(rollbackSource).not.toContain("'clean'");
  });
});

// ---------------------------------------------------------------------------
// 6 Explicit Safety Invariants
// ---------------------------------------------------------------------------

describe("6 Explicit Safety Invariants", () => {
  it("INVARIANT 1: Elevate never modifies files outside ValidatedPatch scope", async () => {
    await initGitRepo();
    await commitInitialFile("src/Allowed.tsx", "Allowed original");
    await commitInitialFile("src/Unrelated.tsx", "Unrelated original");

    const patch = `--- a/src/Allowed.tsx
+++ b/src/Allowed.tsx
@@ -1,1 +1,1 @@
-Allowed original
+Allowed mutated`;

    const validatedPatch = makeValidatedPatch(patch, ["src/Allowed.tsx"]);
    const runner = new MutationTransactionRunner({ projectRoot: tempRepo });
    const result = await runner.execute(validatedPatch, "rec-inv-1", ["src/Allowed.tsx"]);

    expect(result.success).toBe(true);
    expect(result.filesModified).toHaveLength(1);
    expect(result.filesModified[0]).toContain("Allowed.tsx");

    // Unrelated file must be untouched
    const unrelatedContent = await readFile(join(tempRepo, "src/Unrelated.tsx"), "utf8");
    expect(unrelatedContent.trim()).toBe("Unrelated original");
  });

  it("INVARIANT 2: Elevate never deletes a pre-existing untracked user file", async () => {
    await initGitRepo();
    await commitInitialFile("src/Button.tsx", "Original Button");

    // Pre-existing untracked user files
    await writeFile(join(tempRepo, "user-script.js"), "console.log('keep me');", "utf8");
    await writeFile(join(tempRepo, "notes.md"), "# Keep notes", "utf8");

    const patch = `--- a/src/Button.tsx
+++ b/src/Button.tsx
@@ -1,1 +1,1 @@
-Original Button
+Mutated Button
--- /dev/null
+++ b/src/NewElevateFile.tsx
@@ -0,0 +1,1 @@
+export const New = 1;`;

    const validatedPatch = makeValidatedPatch(patch, ["src/Button.tsx", "src/NewElevateFile.tsx"]);
    const runner = new MutationTransactionRunner({ projectRoot: tempRepo });
    const result = await runner.execute(validatedPatch, "rec-inv-2", [
      "src/Button.tsx",
      "src/NewElevateFile.tsx",
    ]);

    expect(result.success).toBe(true);

    // Rollback
    await runner.rollback(result.transaction);

    // Pre-existing untracked files MUST still exist
    const script = await readFile(join(tempRepo, "user-script.js"), "utf8");
    expect(script).toContain("keep me");

    const notes = await readFile(join(tempRepo, "notes.md"), "utf8");
    expect(notes).toContain("Keep notes");

    // Newly created Elevate file MUST be deleted
    await expect(stat(join(tempRepo, "src/NewElevateFile.tsx"))).rejects.toThrow();
  });

  it("INVARIANT 3: Elevate never destroys the user's staged state", async () => {
    await initGitRepo();
    await commitInitialFile("src/Staged.tsx", "Initial Staged File");
    await commitInitialFile("src/Target.tsx", "Initial Target File");

    // User stages a change
    await writeFile(join(tempRepo, "src/Staged.tsx"), "User staged improvement", "utf8");
    await gitExec(["add", "src/Staged.tsx"]);

    const patch = `--- a/src/Target.tsx
+++ b/src/Target.tsx
@@ -1,1 +1,1 @@
-Initial Target File
+Elevate Target Mutated`;

    const validatedPatch = makeValidatedPatch(patch, ["src/Target.tsx"]);
    const runner = new MutationTransactionRunner({ projectRoot: tempRepo });
    const result = await runner.execute(validatedPatch, "rec-inv-3", ["src/Target.tsx"]);

    expect(result.success).toBe(true);

    await runner.rollback(result.transaction);

    // Staged status MUST be preserved
    const { stdout: status } = await gitExec(["status", "--porcelain"]);
    expect(status).toMatch(/^M\s+src\/Staged\.tsx/);

    const content = await readFile(join(tempRepo, "src/Staged.tsx"), "utf8");
    expect(content).toBe("User staged improvement");
  });

  it("INVARIANT 4: Rollback never uses blanket git clean", async () => {
    const rollbackSrc = await readFile(
      join(__dirname, "../../../src/agent/patch/transaction/rollback.ts"),
      "utf8"
    );
    expect(rollbackSrc.includes("git clean")).toBe(false);
    expect(rollbackSrc.includes("clean -fd")).toBe(false);
  });

  it("INVARIANT 5: Failed patch application does not leave partial changes", async () => {
    await initGitRepo();
    await commitInitialFile("src/Button.tsx", "Original Button");

    const failingPatch = `--- a/src/Button.tsx
+++ b/src/Button.tsx
@@ -1,1 +1,1 @@
-Mismatched Content
+Mutated`;

    const validatedPatch = makeValidatedPatch(failingPatch, ["src/Button.tsx"]);
    const runner = new MutationTransactionRunner({ projectRoot: tempRepo });
    const result = await runner.execute(validatedPatch, "rec-inv-5", ["src/Button.tsx"]);

    expect(result.success).toBe(false);

    const { stdout: diff } = await gitExec(["diff"]);
    expect(diff).toBe(""); // Completely clean, no partial changes left
  });

  it("INVARIANT 6: Failed rollback is surfaced as a safety-critical error", async () => {
    const fakeTx: MutationTransaction = {
      transactionId: "inv-6-tx",
      recommendationId: "rec-inv-6",
      startedAt: new Date().toISOString(),
      repositoryRoot: "/invalid/project/root/that/cannot/exist",
      transactionState: "APPLIED",
      gitHeadBefore: "abc",
      workingTreeStateBefore: {
        headCommit: "abc",
        branch: "main",
        modifiedFiles: [],
        untrackedFiles: [],
        stagedFiles: [],
        unstagedFiles: [],
      },
      stagedFilesBefore: [],
      unstagedFilesBefore: [],
      untrackedFilesBefore: [],
      filesAuthorizedForMutation: [],
      filesCreatedByMutation: [],
      filesModifiedByMutation: ["/invalid/file.tsx"],
      verificationResults: [],
      decision: "PENDING",
    };

    const rb = await rollbackTransaction("/invalid/project/root/that/cannot/exist", fakeTx);
    expect(rb.success).toBe(false);
    expect(rb.criticalError).toBe(true);
    expect(rb.error).toContain("CRITICAL");
  });
});
