/**
 * Phase 3D: Pre-Mutation Preflight Checks
 *
 * Runs comprehensive preflight validation before any mutation or checkpointing:
 * 1. Validates repository existence and root path.
 * 2. Ensures HEAD is not empty.
 * 3. Captures exact staged, unstaged, untracked, and ignored state.
 * 4. Verifies all paths are within project root and not protected.
 * 5. Verifies patch hash integrity and ValidatedPatch validity.
 * 6. Computes baseline hashes for target files.
 */

import { isAbsolute, resolve } from "node:path";
import { stat, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { GitManager } from "../../../safety/git.js";
import { isProtectedPath } from "../../protected-paths.js";
import { hashPatch } from "../hash.js";
import type { ValidatedPatch } from "../validate/types.js";
import type { PreflightCheckResult } from "./types.js";

const execFileAsync = promisify(execFile);

export async function execGitInDir(
  cwd: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err: any) {
    throw new Error(
      `Git command failed (git ${args.join(" ")}): ${err.stderr || err.message}`
    );
  }
}

/** Compute SHA-256 hash of a string or buffer. */
function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export async function runPreflightChecks(
  projectRoot: string,
  validatedPatch: ValidatedPatch
): Promise<PreflightCheckResult> {
  const errors: string[] = [];

  // Default empty result structure for failure returns
  const emptyResult: PreflightCheckResult = {
    valid: false,
    errors,
    gitStatus: {
      isRepo: false,
      isClean: false,
      branch: "",
      headCommit: "",
      modifiedFiles: [],
      untrackedFiles: [],
    },
    headCommit: "",
    stagedFiles: [],
    unstagedFiles: [],
    untrackedFiles: [],
    ignoredFiles: [],
    preExistingStashCount: 0,
    targetFileHashes: {},
  };

  // 1. Verify projectRoot is absolute and exists
  if (!isAbsolute(projectRoot)) {
    errors.push(`Project root must be an absolute path: '${projectRoot}'`);
    return { ...emptyResult, errors };
  }

  try {
    const stats = await stat(projectRoot);
    if (!stats.isDirectory()) {
      errors.push(`Project root is not a directory: '${projectRoot}'`);
      return { ...emptyResult, errors };
    }
  } catch {
    errors.push(`Project root does not exist: '${projectRoot}'`);
    return { ...emptyResult, errors };
  }

  // 2. Verify ValidatedPatch validity
  if (!validatedPatch.valid) {
    errors.push(
      `Cannot execute mutation with invalid patch (violations: ${validatedPatch.violations.map((v) => v.message).join("; ")})`
    );
    return { ...emptyResult, errors };
  }

  // 3. Verify patch hash
  const computedHash = hashPatch(validatedPatch.rawPatch);
  if (
    validatedPatch.originalPatchHash &&
    computedHash !== validatedPatch.originalPatchHash
  ) {
    errors.push(
      `Patch integrity violation: computed hash (${computedHash}) does not match original (${validatedPatch.originalPatchHash})`
    );
    return { ...emptyResult, errors };
  }

  // 4. Verify Git repository and HEAD
  const git = new GitManager(projectRoot);
  const isRepo = await git.isGitRepo();
  if (!isRepo) {
    errors.push("Not inside a Git repository. Git is mandatory for Elevate safety.");
    return { ...emptyResult, errors };
  }

  const gitStatus = await git.getStatus();
  if (gitStatus.headCommit === "EMPTY_HEAD" || !gitStatus.headCommit) {
    errors.push(
      "Git repository has no commits (empty HEAD). An initial commit is required before mutation transactions can proceed."
    );
    return { ...emptyResult, gitStatus, errors };
  }

  // 5. Query exact staged and unstaged state
  let stagedFiles: string[] = [];
  try {
    const { stdout } = await execGitInDir(projectRoot, ["diff", "--cached", "--name-only"]);
    stagedFiles = stdout ? stdout.split(/\r?\n/).filter(Boolean) : [];
  } catch (err: any) {
    errors.push(`Failed to query staged files: ${err.message}`);
  }

  let unstagedFiles: string[] = [];
  try {
    const { stdout } = await execGitInDir(projectRoot, ["diff", "--name-only"]);
    unstagedFiles = stdout ? stdout.split(/\r?\n/).filter(Boolean) : [];
  } catch (err: any) {
    errors.push(`Failed to query unstaged files: ${err.message}`);
  }

  // Query untracked files
  const untrackedFiles = [...gitStatus.untrackedFiles];

  // Query ignored files
  let ignoredFiles: string[] = [];
  try {
    const { stdout } = await execGitInDir(projectRoot, [
      "ls-files",
      "--others",
      "--ignored",
      "--exclude-standard",
    ]);
    ignoredFiles = stdout ? stdout.split(/\r?\n/).filter(Boolean) : [];
  } catch {
    // Non-fatal if ignored query fails
    ignoredFiles = [];
  }

  // Count pre-existing stashes
  let preExistingStashCount = 0;
  try {
    const { stdout } = await execGitInDir(projectRoot, ["stash", "list"]);
    preExistingStashCount = stdout ? stdout.split(/\r?\n/).filter(Boolean).length : 0;
  } catch {
    preExistingStashCount = 0;
  }

  // 6. Verify target files and check for protected paths
  const targetFileHashes: Record<string, string> = {};

  for (const relFile of validatedPatch.normalizedFiles) {
    const absPath = resolve(projectRoot, relFile);

    // Verify it doesn't escape project root
    const normalizedRoot = projectRoot.replace(/\\/g, "/");
    const normalizedAbs = absPath.replace(/\\/g, "/");
    if (!normalizedAbs.startsWith(normalizedRoot + "/") && normalizedAbs !== normalizedRoot) {
      errors.push(`Authorized file '${relFile}' resolves outside project root`);
      continue;
    }

    // Verify not a protected path
    const protectedCheck = isProtectedPath(absPath, projectRoot);
    if (protectedCheck.protected) {
      errors.push(
        `Authorized file '${relFile}' is a protected path: ${protectedCheck.reason}`
      );
      continue;
    }

    // If file exists, record baseline hash
    try {
      const content = await readFile(absPath, "utf8");
      targetFileHashes[relFile] = sha256(content);
    } catch {
      // File does not exist (e.g. will be created by patch)
    }
  }

  const valid = errors.length === 0;

  return {
    valid,
    errors,
    gitStatus,
    headCommit: gitStatus.headCommit,
    stagedFiles,
    unstagedFiles,
    untrackedFiles,
    ignoredFiles,
    preExistingStashCount,
    targetFileHashes,
  };
}
