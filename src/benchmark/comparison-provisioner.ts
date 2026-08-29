/**
 * Phase 5A: Benchmark Comparison Snapshot & Reset Provisioner
 *
 * Enforces strict reset isolation between Agent-Alone (Run A) and Agent+Elevate (Run B).
 * Creates a master snapshot, computes SHA-256 tree hash, and clones two 100%
 * byte-for-byte identical isolated disposable repositories.
 */

import { mkdtemp, rm, writeFile, mkdir, cp, readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import type { ComparisonCase } from "./fixtures/comparison-corpus.js";

const execFileAsync = promisify(execFile);

async function runGit(cmd: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", cmd, { cwd });
  return stdout.trim();
}

export interface ComparisonWorkspacePair {
  caseId: string;
  snapshotHash: string;
  aloneWorkspaceRoot: string;
  elevateWorkspaceRoot: string;
  cleanup: () => Promise<void>;
}

/**
 * Computes a deterministic SHA-256 hash of all tracked files in a workspace.
 */
export async function computeWorkspaceTreeHash(workspaceRoot: string): Promise<string> {
  const hash = createHash("sha256");

  async function hashDir(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        hash.update(`DIR:${entry.name}\n`);
        await hashDir(fullPath);
      } else if (entry.isFile()) {
        const content = await readFile(fullPath);
        hash.update(`FILE:${entry.name}:${content.length}\n`);
        hash.update(content);
      }
    }
  }

  await hashDir(workspaceRoot);
  return hash.digest("hex");
}

export class ComparisonProvisioner {
  /**
   * Provisions two isolated, identical workspace clones from a single master snapshot.
   */
  public static async provisionIsolatedPair(
    comparisonCase: ComparisonCase,
    customBaseDir?: string
  ): Promise<ComparisonWorkspacePair> {
    const base = customBaseDir || join(tmpdir(), "elevate-benchmarks");
    await mkdir(base, { recursive: true });

    // 1. Create master snapshot repository
    const masterRoot = await mkdtemp(join(base, `master-${comparisonCase.id}-`));

    try {
      await runGit(["init"], masterRoot);
      await runGit(["config", "user.name", "Elevate Benchmark Bot"], masterRoot);
      await runGit(["config", "user.email", "benchmark@elevate.local"], masterRoot);

      // Package JSON
      const packageJson = {
        name: `benchmark-${comparisonCase.id}`,
        version: "0.1.0",
        private: true,
        scripts: {
          dev: "next dev",
          build: "echo 'build ok'",
          typecheck: "echo 'typecheck ok'",
        },
      };
      await writeFile(join(masterRoot, "package.json"), JSON.stringify(packageJson, null, 2), "utf8");

      // TypeScript config
      const tsConfig = {
        compilerOptions: {
          target: "es2022",
          module: "esnext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          strict: true,
          skipLibCheck: true,
        },
        include: ["src/**/*"],
      };
      await writeFile(join(masterRoot, "tsconfig.json"), JSON.stringify(tsConfig, null, 2), "utf8");

      // Scoped permissions for coding agents
      const scopedPermissions = {
        permissions: {
          allow: [
            "read_file",
            "read_file(*)",
            "edit_file",
            "edit_file(*)",
            "write_file",
            "write_file(*)",
            "write_to_file",
            "write_to_file(*)",
            "replace_file_content",
            "replace_file_content(*)",
            "view_file",
            "view_file(*)",
            "run_command",
            "run_command(*)",
            "command",
            "command(*)",
            "list_dir",
            "list_dir(*)",
            "grep_search",
            "grep_search(*)",
            "file_search",
            "file_search(*)",
          ],
        },
      };
      await mkdir(join(masterRoot, ".gemini"), { recursive: true });
      await writeFile(
        join(masterRoot, ".gemini", "settings.json"),
        JSON.stringify(scopedPermissions, null, 2),
        "utf8"
      );
      await mkdir(join(masterRoot, ".agents"), { recursive: true });
      await writeFile(
        join(masterRoot, ".agents", "settings.json"),
        JSON.stringify(scopedPermissions, null, 2),
        "utf8"
      );

      // .gitignore
      await writeFile(
        join(masterRoot, ".gitignore"),
        "node_modules\n.next\n.elevate\n",
        "utf8"
      );

      // Write initial component file
      const compAbsPath = join(masterRoot, comparisonCase.componentPath);
      await mkdir(dirname(compAbsPath), { recursive: true });
      await writeFile(compAbsPath, comparisonCase.initialComponentCode, "utf8");

      // Baseline commit
      await runGit(["add", "."], masterRoot);
      await runGit(["commit", "-m", "Initial baseline snapshot"], masterRoot);

      // Compute master SHA-256 tree hash
      const snapshotHash = await computeWorkspaceTreeHash(masterRoot);

      // 2. Clone Run A workspace (Agent Alone)
      const aloneRoot = await mkdtemp(join(base, `case-${comparisonCase.id}-alone-`));
      await cp(masterRoot, aloneRoot, { recursive: true });

      // 3. Clone Run B workspace (Agent + Elevate)
      const elevateRoot = await mkdtemp(join(base, `case-${comparisonCase.id}-elevate-`));
      await cp(masterRoot, elevateRoot, { recursive: true });

      // Verify hashes match
      const aloneHash = await computeWorkspaceTreeHash(aloneRoot);
      const elevateHash = await computeWorkspaceTreeHash(elevateRoot);

      if (aloneHash !== snapshotHash || elevateHash !== snapshotHash) {
        throw new Error(
          `Snapshot isolation failure: Cloned workspaces do not match master snapshot hash ${snapshotHash}.`
        );
      }

      return {
        caseId: comparisonCase.id,
        snapshotHash,
        aloneWorkspaceRoot: aloneRoot,
        elevateWorkspaceRoot: elevateRoot,
        cleanup: async () => {
          await rm(masterRoot, { recursive: true, force: true }).catch(() => {});
          await rm(aloneRoot, { recursive: true, force: true }).catch(() => {});
          await rm(elevateRoot, { recursive: true, force: true }).catch(() => {});
        },
      };
    } catch (err: any) {
      await rm(masterRoot, { recursive: true, force: true }).catch(() => {});
      throw new Error(`Failed to provision isolated pair for ${comparisonCase.id}: ${err.message}`);
    }
  }
}
