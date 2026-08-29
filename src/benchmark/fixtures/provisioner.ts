/**
 * Phase 4C: Benchmark Disposable Repository Provisioner
 *
 * Sets up and manages isolated, disposable Git workspaces and lightweight
 * preview HTTP servers for executing benchmark cases without modifying the host project.
 */

import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { BenchmarkCase } from "../types.js";

const execFileAsync = promisify(execFile);

export interface ProvisionedRepository {
  projectRoot: string;
  caseId: string;
  cleanup: () => Promise<void>;
}

export interface FixtureServerInstance {
  server: Server;
  url: string;
  close: () => Promise<void>;
}

async function runGit(cmd: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", cmd, { cwd });
  return stdout.trim();
}

export async function provisionBenchmarkRepository(
  benchCase: BenchmarkCase,
  customBaseDir?: string
): Promise<ProvisionedRepository> {
  const base = customBaseDir || join(tmpdir(), "elevate-benchmarks");
  await mkdir(base, { recursive: true });
  const projectRoot = await mkdtemp(join(base, `case-${benchCase.id}-`));

  try {
    // 1. Initialize git
    await runGit(["init"], projectRoot);
    await runGit(["config", "user.name", "Elevate Benchmark Bot"], projectRoot);
    await runGit(["config", "user.email", "benchmark@elevate.local"], projectRoot);

    // 2. Scaffold standard Next.js / React project layout
    const packageJson = {
      name: `bench-${benchCase.id}`,
      version: "0.1.0",
      private: true,
      scripts: {
        typecheck: "tsc --noEmit",
        build: "echo 'build ok'",
      },
    };
    await writeFile(join(projectRoot, "package.json"), JSON.stringify(packageJson, null, 2), "utf8");

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
    await writeFile(join(projectRoot, "tsconfig.json"), JSON.stringify(tsConfig, null, 2), "utf8");

    // 3. Write component file
    const compAbsPath = join(projectRoot, benchCase.componentPath);
    await mkdir(dirname(compAbsPath), { recursive: true });
    await writeFile(compAbsPath, benchCase.componentCode, "utf8");

    // 4. Write .gitignore
    await writeFile(
      join(projectRoot, ".gitignore"),
      "node_modules\n.next\n.elevate\n.gemini\n.agents\n",
      "utf8"
    );

    // 4b. Write scoped tool permissions for coding agent adapters
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
    await mkdir(join(projectRoot, ".gemini"), { recursive: true });
    await writeFile(
      join(projectRoot, ".gemini", "settings.json"),
      JSON.stringify(scopedPermissions, null, 2),
      "utf8"
    );
    await mkdir(join(projectRoot, ".agents"), { recursive: true });
    await writeFile(
      join(projectRoot, ".agents", "settings.json"),
      JSON.stringify(scopedPermissions, null, 2),
      "utf8"
    );

    // 5. Initial Git commit
    await runGit(["add", "."], projectRoot);
    await runGit(["commit", "-m", "Initial benchmark baseline"], projectRoot);

    return {
      projectRoot,
      caseId: benchCase.id,
      cleanup: async () => {
        try {
          await rm(projectRoot, { recursive: true, force: true });
        } catch {
          // ignore cleanup failures
        }
      },
    };
  } catch (err: any) {
    try {
      await rm(projectRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
    throw new Error(`Failed to provision benchmark repository for ${benchCase.id}: ${err.message}`);
  }
}

/**
 * Starts a lightweight preview HTTP server serving the component HTML.
 */
export async function startBenchmarkFixtureServer(
  projectRoot: string,
  componentPath: string
): Promise<FixtureServerInstance> {
  const server = createServer(async (_req, res) => {
    try {
      const fullPath = join(projectRoot, componentPath);
      let content = "";
      try {
        content = await readFile(fullPath, "utf8");
      } catch {
        content = "<div>Component not found</div>";
      }

      // Extract JSX body markup
      let htmlBody = content;
      const returnMatch = content.match(/return\s*\(\s*([\s\S]*?)\s*\);/);
      if (returnMatch) {
        htmlBody = returnMatch[1]
          .replace(/className=/g, "class=")
          .replace(/{\/\*[\s\S]*?\*\/}/g, "");
      }

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Elevate Benchmark Preview</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #ffffff; color: #1e293b; }
    .w-\\[650px\\] { width: 650px; min-width: 650px; }
    .w-\\[600px\\] { width: 600px; min-width: 600px; }
    .w-\\[580px\\] { width: 580px; min-width: 580px; }
    .w-\\[550px\\] { width: 550px; min-width: 550px; }
    .w-\\[520px\\] { width: 520px; min-width: 520px; }
    .w-\\[500px\\] { width: 500px; min-width: 500px; }
    .max-w-\\[650px\\] { max-width: 650px; }
    .max-w-\\[600px\\] { max-width: 600px; }
    .max-w-\\[580px\\] { max-width: 580px; }
    .max-w-\\[550px\\] { max-width: 550px; }
    .max-w-\\[520px\\] { max-width: 520px; }
    .max-w-\\[500px\\] { max-width: 500px; }
    .text-\\[9px\\] { font-size: 9px; line-height: 1.1; }
    .min-h-\\[44px\\] { min-height: 44px; }
    .min-w-\\[44px\\] { min-width: 44px; }
    .h-6 { height: 24px; min-height: 24px; }
    .w-6 { width: 24px; min-width: 24px; }
    .w-full { width: 100%; }
    .w-1\\/2 { width: 50%; }
    .h-auto { height: auto; }
    .bg-white { background-color: #ffffff; }
    .bg-slate-50 { background-color: #f8fafc; }
    .bg-slate-100 { background-color: #f1f5f9; }
    .bg-slate-200 { background-color: #e2e8f0; }
    .bg-gray-200 { background-color: #e5e7eb; }
    .bg-blue-600 { background-color: #2563eb; color: #ffffff; }
    .bg-blue-700 { background-color: #1d4ed8; color: #ffffff; }
    .bg-transparent { background-color: transparent; }
    .text-gray-400 { color: #9ca3af; }
    .text-slate-600 { color: #475569; }
    .text-slate-700 { color: #334155; }
    .text-white { color: #ffffff; }
    .text-xs { font-size: 12px; }
    .text-sm { font-size: 14px; }
    .text-lg { font-size: 18px; }
    .text-xl { font-size: 20px; }
    .text-2xl { font-size: 24px; }
    .font-medium { font-weight: 500; }
    .font-semibold { font-weight: 600; }
    .font-bold { font-weight: 700; }
    .p-0 { padding: 0; }
    .p-2 { padding: 8px; }
    .p-3 { padding: 12px; }
    .p-4 { padding: 16px; }
    .p-6 { padding: 24px; }
    .px-4 { padding-left: 16px; padding-right: 16px; }
    .py-2 { padding-top: 8px; padding-bottom: 8px; }
    .mt-0 { margin-top: 0; }
    .mt-4 { margin-top: 16px; }
    .mb-0 { margin-bottom: 0; }
    .mb-2 { margin-bottom: 8px; }
    .rounded { border-radius: 6px; }
    .border { border: 1px solid #cbd5e1; }
    .border-slate-300 { border-color: #cbd5e1; }
    .shadow-sm { box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); }
    .flex { display: flex; }
    .flex-row { flex-direction: row; }
    .flex-col { flex-direction: column; }
    .items-center { align-items: center; }
    .justify-center { justify-content: center; }
    .gap-0 { gap: 0; }
    .gap-4 { gap: 16px; }
    .gap-6 { gap: 24px; }
    @media (min-width: 768px) {
      .md\\:flex-row { flex-direction: row; }
      .md\\:w-1\\/2 { width: 50%; }
    }
  </style>
</head>
<body>
  ${htmlBody}
</body>
</html>`;

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      res.writeHead(500);
      res.end("Server error");
    }
  });

  await new Promise<void>((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => resolvePromise());
  });

  const port = (server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}`;

  return {
    server,
    url,
    close: () =>
      new Promise<void>((resolveClose) => {
        server.close(() => resolveClose());
      }),
  };
}
