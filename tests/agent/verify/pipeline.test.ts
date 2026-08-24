/**
 * Phase 3E: End-to-End Verification Pipeline & Integration Tests
 *
 * Demonstrates:
 *  1. Start with a known visual/deterministic problem in a disposable Git repo.
 *  2. Create a ValidatedPatch and apply via Phase 3D to reach APPLIED.
 *  3. Run Phase 3E VerificationPipeline.
 *  4. On verified improvement → ACCEPT → transaction reaches COMPLETED → mutation kept.
 *  5. On deliberate breakage / hard gate failure → ROLLBACK → transaction reaches ROLLED_BACK → repo restored exactly.
 *  6. Browser capture and route smoke test integration.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type Server } from "node:http";
import { MutationTransactionRunner } from "../../../src/agent/patch/transaction/transaction.js";
import { parseDiff } from "../../../src/agent/patch/validate/parser.js";
import { hashPatch } from "../../../src/agent/patch/hash.js";
import { VerificationPipeline } from "../../../src/agent/patch/verify/index.js";
import type { ValidatedPatch } from "../../../src/agent/patch/validate/types.js";
import type { Finding, MutationRecommendation } from "../../../src/analysis/types.js";

const execFileAsync = promisify(execFile);

let tempRepo: string;
let mockHttpServer: Server | null = null;
let serverPort: number;

async function gitExec(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd: tempRepo,
    windowsHide: true,
  });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

async function initGitRepo(): Promise<void> {
  await gitExec(["init"]);
  await gitExec(["config", "user.name", "Elevate E2E Test"]);
  await gitExec(["config", "user.email", "e2e@elevate.local"]);
}

async function commitFile(relPath: string, content: string): Promise<void> {
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
  tempRepo = await mkdtemp(join(tmpdir(), "elevate-verify-pipeline-"));
  serverPort = 35000 + Math.floor(Math.random() * 1000);
});

afterEach(async () => {
  if (mockHttpServer) {
    mockHttpServer.close();
    mockHttpServer = null;
  }
  try {
    await rm(tempRepo, { recursive: true, force: true });
  } catch {
    // Ignore cleanup error on Windows
  }
});

describe("Phase 3E Full Pipeline & Disposable E2E Integration (Scenarios Z, AA, 19)", () => {
  it("APPLIED transaction → passes verification → ACCEPT → COMPLETED (Scenario AA & 19 - success path)", async () => {
    await initGitRepo();
    await commitFile(
      "src/Button.tsx",
      `export function Button() { return <button className="unlabeled">Click</button>; }`
    );

    // Start a mock server serving the page with proper HTML baseline structure
    mockHttpServer = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!DOCTYPE html><html lang="en" style="margin:0;padding:0;overflow:hidden;"><head><title>App</title></head><body style="margin:0;padding:0;overflow:hidden;"><main><h1>App Title</h1><button class="bg-blue-600" style="min-width:48px;min-height:48px;padding:12px 24px;" aria-label="Submit Form">Click</button></main></body></html>`);
    });
    await new Promise<void>((resolve) => mockHttpServer!.listen(serverPort, "127.0.0.1", () => resolve()));

    const targetUrl = `http://127.0.0.1:${serverPort}`;

    // 1. Known issue before
    const beforeFindings: Finding[] = [
      {
        id: "finding-btn-unlabeled",
        category: "accessibility",
        severity: "serious",
        title: "Missing button accessible label",
        description: "Button has no accessible name",
        evidence: { selector: "button.unlabeled" },
        selector: "button.unlabeled",
        viewport: "desktop",
        source: "deterministic",
        deterministic: true,
        confidence: 1.0,
      },
    ];

    const recommendation: MutationRecommendation = {
      id: "rec-add-aria-label",
      problem: "Missing accessible label on button",
      evidence: { selector: "button.unlabeled" },
      affectedSelector: "button.unlabeled",
      affectedViewports: ["desktop"],
      proposedImprovement: "Add aria-label to button",
      rationale: "Fix WCAG compliance",
      confidence: 1.0,
      estimatedMutationScope: "single-element",
      risk: "low",
      sourceFindingIds: ["finding-btn-unlabeled"],
    };

    // 2. Validated patch
    const patch = `--- a/src/Button.tsx
+++ b/src/Button.tsx
@@ -1,1 +1,1 @@
-export function Button() { return <button className="unlabeled">Click</button>; }
+export function Button() { return <button className="bg-blue-600" aria-label="Submit Form">Click</button>; }`;

    const validatedPatch = makeValidatedPatch(patch, ["src/Button.tsx"]);

    // 3. Phase 3D execution → APPLIED
    const txRunner = new MutationTransactionRunner({ projectRoot: tempRepo });
    const txResult = await txRunner.execute(validatedPatch, recommendation.id, ["src/Button.tsx"]);

    expect(txResult.success).toBe(true);
    expect(txResult.transaction.transactionState).toBe("APPLIED");

    // 4. Run Phase 3E verification pipeline
    const pipeline = new VerificationPipeline({
      projectRoot: tempRepo,
      targetUrl,
      serverAlreadyRunning: true,
      typecheckCmd: process.platform === "win32" ? "cmd /c exit 0" : "true",
      buildCmd: process.platform === "win32" ? "cmd /c exit 0" : "true",
      enableVisualReanalysis: false,
    });

    const verifyResult = await pipeline.run(
      txResult.transaction,
      beforeFindings,
      recommendation
    );

    // 5. Assert ACCEPT & COMPLETED
    expect(verifyResult.decision).toBe("ACCEPT");
    expect(txResult.transaction.transactionState).toBe("COMPLETED");
    expect(txResult.transaction.decision).toBe("ACCEPT");

    // Mutation is KEPT on disk
    const content = await readFile(join(tempRepo, "src/Button.tsx"), "utf8");
    expect(content).toContain("aria-label=\"Submit Form\"");
  });

  it("APPLIED transaction → fails typecheck → ROLLBACK → repo exactly restored (Scenario Z & 19 - rollback path)", async () => {
    await initGitRepo();
    await commitFile(
      "src/Button.tsx",
      `export function Button() { return <button>Original Button</button>; }`
    );

    // 1. Validated patch that introduces a broken change
    const patch = `--- a/src/Button.tsx
+++ b/src/Button.tsx
@@ -1,1 +1,1 @@
-export function Button() { return <button>Original Button</button>; }
+export function Button() { return <button>Broken Syntax`;

    const validatedPatch = makeValidatedPatch(patch, ["src/Button.tsx"]);

    // 2. Apply patch via Phase 3D
    const txRunner = new MutationTransactionRunner({ projectRoot: tempRepo });
    const txResult = await txRunner.execute(validatedPatch, "rec-fail", ["src/Button.tsx"]);

    expect(txResult.success).toBe(true);
    expect(txResult.transaction.transactionState).toBe("APPLIED");

    const recommendation: MutationRecommendation = {
      id: "rec-fail",
      problem: "Some issue",
      evidence: {},
      affectedViewports: ["desktop"],
      proposedImprovement: "Improve button",
      rationale: "Rationale",
      confidence: 1.0,
      estimatedMutationScope: "single-element",
      risk: "low",
      sourceFindingIds: [],
    };

    // 3. Run Phase 3E with a failing typecheck command
    const pipeline = new VerificationPipeline({
      projectRoot: tempRepo,
      targetUrl: "http://localhost:3000",
      serverAlreadyRunning: false,
      typecheckCmd: process.platform === "win32" ? "cmd /c exit 1" : "false", // Fails!
      buildCmd: process.platform === "win32" ? "cmd /c exit 0" : "true",
      enableVisualReanalysis: false,
    });

    const verifyResult = await pipeline.run(
      txResult.transaction,
      [],
      recommendation
    );

    // 4. Assert ROLLBACK & ROLLED_BACK
    expect(verifyResult.decision).toBe("ROLLBACK");
    expect(txResult.transaction.transactionState).toBe("ROLLED_BACK");
    expect(txResult.transaction.decision).toBe("ROLLBACK");
    expect(verifyResult.rollbackResult?.success).toBe(true);

    // 5. Repository is restored to EXACT prior state
    const restoredContent = await readFile(join(tempRepo, "src/Button.tsx"), "utf8");
    expect(restoredContent.trim()).toBe("export function Button() { return <button>Original Button</button>; }");

    const { stdout: diff } = await gitExec(["diff"]);
    expect(diff).toBe("");
  });
});
