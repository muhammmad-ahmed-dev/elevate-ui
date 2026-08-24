import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GitManager } from "../../src/safety/git.js";

const execFileAsync = promisify(execFile);

describe("GitManager", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "elevate-git-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error on Windows
    }
  });

  it("identifies non-git directory correctly", async () => {
    const git = new GitManager(tempDir);
    const isRepo = await git.isGitRepo();
    expect(isRepo).toBe(false);

    const status = await git.getStatus();
    expect(status.isRepo).toBe(false);
    expect(status.isClean).toBe(false);
  });

  it("handles git repository status, checkpoints, and rollback", async () => {
    // 1. Initialize git repo
    await execFileAsync("git", ["init"], { cwd: tempDir });
    await execFileAsync("git", ["config", "user.name", "Elevate Test"], { cwd: tempDir });
    await execFileAsync("git", ["config", "user.email", "test@elevate.local"], { cwd: tempDir });

    const git = new GitManager(tempDir);
    expect(await git.isGitRepo()).toBe(true);

    // 2. Create initial commit
    const initialFile = path.join(tempDir, "test.txt");
    await fs.writeFile(initialFile, "Initial Content\n");
    await execFileAsync("git", ["add", "."], { cwd: tempDir });
    await execFileAsync("git", ["commit", "-m", "Initial commit"], { cwd: tempDir });

    const cleanStatus = await git.getStatus();
    expect(cleanStatus.isRepo).toBe(true);
    expect(cleanStatus.isClean).toBe(true);
    expect(cleanStatus.modifiedFiles.length).toBe(0);

    // 3. Create checkpoint
    const checkpoint = await git.createCheckpoint("Pre-mutation test checkpoint");
    expect(checkpoint.headCommit).toBe(cleanStatus.headCommit);
    expect(checkpoint.stashed).toBe(false);

    // 4. Mutate file
    await fs.writeFile(initialFile, "Modified Bad Content\n");
    const dirtyStatus = await git.getStatus();
    expect(dirtyStatus.isClean).toBe(false);
    expect(dirtyStatus.modifiedFiles).toContain("test.txt");

    // 5. Trigger rollback
    const rollbackResult = await git.rollback(checkpoint);
    expect(rollbackResult.success).toBe(true);

    // 6. Verify restored state
    const restoredContent = await fs.readFile(initialFile, "utf-8");
    expect(restoredContent.replace(/\r\n/g, "\n")).toBe("Initial Content\n");

    const postRollbackStatus = await git.getStatus();
    expect(postRollbackStatus.isClean).toBe(true);
  });

  it("stashes uncommitted changes during checkpoint and restores on rollback", async () => {
    // 1. Initialize git repo with commit
    await execFileAsync("git", ["init"], { cwd: tempDir });
    await execFileAsync("git", ["config", "user.name", "Elevate Test"], { cwd: tempDir });
    await execFileAsync("git", ["config", "user.email", "test@elevate.local"], { cwd: tempDir });

    const initialFile = path.join(tempDir, "base.txt");
    await fs.writeFile(initialFile, "Base commit\n");
    await execFileAsync("git", ["add", "."], { cwd: tempDir });
    await execFileAsync("git", ["commit", "-m", "Base commit"], { cwd: tempDir });

    const git = new GitManager(tempDir);

    // 2. Make uncommitted modification before checkpoint
    await fs.writeFile(initialFile, "User work in progress\n");

    // 3. Create checkpoint (should stash)
    const checkpoint = await git.createCheckpoint("Checkpoint with dirty tree");
    expect(checkpoint.stashed).toBe(true);

    // 4. Introduce agent mutation
    await fs.writeFile(initialFile, "Agent corrupted content\n");

    // 5. Rollback (should discard agent mutation and pop stash)
    const rollbackResult = await git.rollback(checkpoint);
    expect(rollbackResult.success).toBe(true);

    // 6. Verify user work in progress is restored
    const finalContent = await fs.readFile(initialFile, "utf-8");
    expect(finalContent.replace(/\r\n/g, "\n")).toBe("User work in progress\n");
  });

  it("handles empty repository with EMPTY_HEAD and rejects checkpoint with clear error", async () => {
    // 1. Initialize git repo with no commits
    await execFileAsync("git", ["init"], { cwd: tempDir });
    const git = new GitManager(tempDir);

    const status = await git.getStatus();
    expect(status.isRepo).toBe(true);
    expect(status.headCommit).toBe("EMPTY_HEAD");

    // 2. Expect createCheckpoint to throw descriptive error
    await expect(git.createCheckpoint("Test on empty repo")).rejects.toThrow(
      /empty HEAD.*initial commit/i
    );
  });

  it("preserves staged index during rollback using stash pop --index", async () => {
    // 1. Initialize git repo with commit
    await execFileAsync("git", ["init"], { cwd: tempDir });
    await execFileAsync("git", ["config", "user.name", "Elevate Test"], { cwd: tempDir });
    await execFileAsync("git", ["config", "user.email", "test@elevate.local"], { cwd: tempDir });

    const stagedFile = path.join(tempDir, "staged.txt");
    await fs.writeFile(stagedFile, "Base staged content\n");
    await execFileAsync("git", ["add", "."], { cwd: tempDir });
    await execFileAsync("git", ["commit", "-m", "Base commit"], { cwd: tempDir });

    const git = new GitManager(tempDir);

    // 2. Make tracked file modification and stage it
    await fs.writeFile(stagedFile, "User staged work in progress\n");
    await execFileAsync("git", ["add", "staged.txt"], { cwd: tempDir });

    // Verify file is staged before checkpoint
    const { stdout: statusBefore } = await execFileAsync("git", ["status", "--porcelain"], { cwd: tempDir });
    expect(statusBefore).toMatch(/^M /);

    // 3. Create checkpoint (should stash both index and working tree)
    const checkpoint = await git.createCheckpoint("Checkpoint with staged changes");
    expect(checkpoint.stashed).toBe(true);

    // 4. Introduce agent mutation
    await fs.writeFile(stagedFile, "Agent corrupted content\n");

    // 5. Rollback (should discard mutation and pop stash with --index)
    const rollbackResult = await git.rollback(checkpoint);
    expect(rollbackResult.success).toBe(true);

    // 6. Verify contents and staged status are preserved
    const restoredContent = await fs.readFile(stagedFile, "utf-8");
    expect(restoredContent.replace(/\r\n/g, "\n")).toBe("User staged work in progress\n");

    const { stdout: statusAfter } = await execFileAsync("git", ["status", "--porcelain"], { cwd: tempDir });
    // Status in porcelain for staged file must start with 'M ' (staged in index)
    expect(statusAfter).toMatch(/^M /);
  });
});
