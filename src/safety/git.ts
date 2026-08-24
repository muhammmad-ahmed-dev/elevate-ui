import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitStatus, Checkpoint, RollbackResult } from "./types.js";
import { logger } from "../utils/logger.js";

const execFileAsync = promisify(execFile);

export class GitManager {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  private async execGit(args: string[]): Promise<{ stdout: string; stderr: string }> {
    try {
      const { stdout, stderr } = await execFileAsync("git", args, {
        cwd: this.cwd,
        windowsHide: true,
      });
      return { stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (err: any) {
      throw new Error(`Git command failed (git ${args.join(" ")}): ${err.stderr || err.message}`);
    }
  }

  public async isGitRepo(): Promise<boolean> {
    try {
      const { stdout } = await this.execGit(["rev-parse", "--is-inside-work-tree"]);
      return stdout === "true";
    } catch {
      return false;
    }
  }

  public async getStatus(): Promise<GitStatus> {
    const isRepo = await this.isGitRepo();
    if (!isRepo) {
      return {
        isRepo: false,
        isClean: false,
        branch: "",
        headCommit: "",
        modifiedFiles: [],
        untrackedFiles: [],
      };
    }

    let branch = "";
    try {
      const { stdout: branchName } = await this.execGit(["rev-parse", "--abbrev-ref", "HEAD"]);
      branch = branchName;
    } catch {
      // In empty repo with no commits yet, HEAD is an unborn branch
      try {
        const { stdout: symbolic } = await this.execGit(["symbolic-ref", "--short", "HEAD"]);
        branch = symbolic;
      } catch {
        branch = "main";
      }
    }

    let headCommit = "";
    try {
      const { stdout: commit } = await this.execGit(["rev-parse", "HEAD"]);
      headCommit = commit;
    } catch {
      // Empty repo with no commits yet
      headCommit = "EMPTY_HEAD";
    }

    const { stdout: statusOutput } = await this.execGit(["status", "--porcelain"]);
    const lines = statusOutput ? statusOutput.split("\n") : [];

    const modifiedFiles: string[] = [];
    const untrackedFiles: string[] = [];

    for (const line of lines) {
      if (!line) continue;
      const status = line.substring(0, 2);
      const file = line.substring(2).trim();

      if (status.includes("?")) {
        untrackedFiles.push(file);
      } else {
        modifiedFiles.push(file);
      }
    }

    const isClean = modifiedFiles.length === 0 && untrackedFiles.length === 0;

    return {
      isRepo: true,
      isClean,
      branch,
      headCommit,
      modifiedFiles,
      untrackedFiles,
    };
  }

  public async createCheckpoint(description: string = "Elevate pre-mutation checkpoint"): Promise<Checkpoint> {
    const status = await this.getStatus();
    if (!status.isRepo) {
      throw new Error("Cannot create checkpoint: Not inside a Git repository. Git is mandatory for Elevate safety.");
    }

    if (status.headCommit === "EMPTY_HEAD") {
      throw new Error(
        "Cannot create checkpoint: Git repository has no commits (empty HEAD). An initial commit is required before Elevate can perform safety checkpoints."
      );
    }

    const checkpointId = `checkpoint-${Date.now()}`;
    let stashed = false;
    let stashId: string | undefined;

    // If working tree is dirty before Elevate mutation, stash changes or record checkpoint
    if (!status.isClean) {
      logger.warn("Working tree has uncommitted modifications. Creating git stash checkpoint...");
      try {
        await this.execGit(["stash", "push", "-u", "-m", `elevate-auto-${checkpointId}`]);
        stashed = true;
        stashId = `elevate-auto-${checkpointId}`;
      } catch (err: any) {
        logger.error(`Failed to create stash checkpoint: ${err.message}`);
      }
    }

    return {
      id: checkpointId,
      timestamp: Date.now(),
      headCommit: status.headCommit,
      stashed,
      stashId,
      description,
      untrackedFilesBaseline: [...status.untrackedFiles],
    };
  }

  /**
   * @deprecated DO NOT USE in Phase 3E+. This legacy method uses `git clean -fd`.
   * Use `MutationTransactionRunner.rollback()` from `src/agent/patch/transaction/` instead.
   */
  public async rollback(checkpoint: Checkpoint): Promise<RollbackResult> {
    try {
      logger.warn(`Triggering rollback to checkpoint ${checkpoint.id} (HEAD: ${checkpoint.headCommit})...`);
      
      // 1. Discard working tree changes
      await this.execGit(["checkout", "."]);
      await this.execGit(["clean", "-fd"]);

      // 2. If we stashed user changes during checkpoint creation, pop the stash preserving index
      if (checkpoint.stashed) {
        try {
          await this.execGit(["stash", "pop", "--index"]);
        } catch (err: any) {
          logger.warn(`Stash pop --index failed (${err.message}). Falling back to standard stash pop...`);
          try {
            await this.execGit(["stash", "pop"]);
          } catch (popErr: any) {
            logger.error(`Standard stash pop also failed: ${popErr.message}`);
            throw popErr;
          }
        }
      }

      logger.success("Rollback complete. Working tree cleanly restored.");
      return {
        success: true,
        restoredCommit: checkpoint.headCommit,
      };
    } catch (err: any) {
      const errorMsg = `Rollback failed: ${err.message}`;
      logger.error(errorMsg);
      return {
        success: false,
        restoredCommit: checkpoint.headCommit,
        error: errorMsg,
      };
    }
  }

  public async getDiff(): Promise<string> {
    try {
      const { stdout } = await this.execGit(["diff"]);
      return stdout;
    } catch (err: any) {
      return `Failed to get diff: ${err.message}`;
    }
  }
}
