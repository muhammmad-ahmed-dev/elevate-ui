/**
 * Phase 3D: Safe Patch Application
 *
 * Enforces atomic git apply --check (dry run) before real application.
 * Computes exact sets of modified and created files from Git status post-apply.
 */

import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execGitInDir } from "./preflight.js";
import type { ValidatedPatch } from "../validate/types.js";
import type { PatchApplyResult } from "./types.js";

/**
 * Check if a patch can be cleanly applied using `git apply --check`.
 * Does not modify any files.
 */
export async function checkPatchDryRun(
  projectRoot: string,
  rawPatch: string
): Promise<{ success: boolean; error?: string }> {
  const tempDir = await mkdtemp(join(tmpdir(), "elevate-patch-check-"));
  const patchFile = join(tempDir, "patch.diff");

  try {
    const formattedPatch = rawPatch.endsWith("\n") ? rawPatch : rawPatch + "\n";
    await writeFile(patchFile, formattedPatch, "utf8");
    await execGitInDir(projectRoot, ["apply", "--check", patchFile]);
    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: `git apply --check failed: ${err.message}`,
    };
  } finally {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore temp cleanup error
    }
  }
}

/**
 * Apply a validated patch safely to the repository.
 * Runs `git apply --check` first, then applies, then queries post-apply Git state.
 */
export async function applyValidatedPatch(
  projectRoot: string,
  validatedPatch: ValidatedPatch,
  untrackedFilesBaseline: string[]
): Promise<PatchApplyResult> {
  const tempDir = await mkdtemp(join(tmpdir(), "elevate-patch-apply-"));
  const patchFile = join(tempDir, "patch.diff");

  try {
    const formattedPatch = validatedPatch.rawPatch.endsWith("\n")
      ? validatedPatch.rawPatch
      : validatedPatch.rawPatch + "\n";
    await writeFile(patchFile, formattedPatch, "utf8");

    // 1. Dry run check
    try {
      await execGitInDir(projectRoot, ["apply", "--check", patchFile]);
    } catch (err: any) {
      return {
        success: false,
        filesModified: [],
        filesCreated: [],
        error: `Patch dry-run verification failed (git apply --check): ${err.message}`,
      };
    }

    // 2. Real application
    try {
      await execGitInDir(projectRoot, ["apply", patchFile]);
    } catch (err: any) {
      return {
        success: false,
        filesModified: [],
        filesCreated: [],
        error: `Patch application failed (git apply): ${err.message}`,
      };
    }

    // 3. Inspect Git state to record actual modified and created files
    const baselineUntrackedSet = new Set(untrackedFilesBaseline);

    // Tracked modified files
    const { stdout: diffStdout } = await execGitInDir(projectRoot, ["diff", "--name-only"]);
    const modifiedRelFiles = diffStdout
      ? diffStdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
      : [];

    // All status entries to find new untracked or added files
    const { stdout: statusStdout } = await execGitInDir(projectRoot, ["status", "--porcelain"]);
    const statusLines = statusStdout
      ? statusStdout.split(/\r?\n/).filter(Boolean)
      : [];

    const createdRelFiles: string[] = [];

    for (const line of statusLines) {
      const code = line.substring(0, 2);
      const file = line.substring(2).trim();

      // Newly created file will appear as ?? (untracked) or A (added)
      // and must not have existed in baseline untracked set
      if ((code.includes("?") || code.includes("A")) && !baselineUntrackedSet.has(file)) {
        createdRelFiles.push(file);
      }
    }

    const filesModified = modifiedRelFiles.map((f) => resolve(projectRoot, f));
    const filesCreated = createdRelFiles.map((f) => resolve(projectRoot, f));

    return {
      success: true,
      filesModified,
      filesCreated,
    };
  } finally {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore temp cleanup error
    }
  }
}
