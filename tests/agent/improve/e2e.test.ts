/**
 * Phase 3F: End-to-End Disposable Project Integration Tests
 *
 * Tests Scenario Z (and Scenarios 21 & 22):
 *  1. Disposable Git repo with known component.
 *  2. Mock HTTP server serving the page.
 *  3. Dry-run execution: validates diff, no mutations applied.
 *  4. Approved execution: reaches APPLIED, passes verification, ACCEPT, mutation kept.
 *  5. Failing verification execution: reaches APPLIED, fails typecheck/build, ROLLBACK, repo exactly restored.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type Server } from "node:http";
import { runImprovePass } from "../../../src/agent/improve/engine.js";
import * as auditModule from "../../../src/cli/commands/audit.js";
import type { AnalysisResult } from "../../../src/analysis/types.js";

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

const HERO_COMPONENT_SOURCE = `export function HeroSection() {
  return (
    <section className="hero-section py-12">
      <button className="cta-btn bg-gray-400 text-white px-6">Get Started</button>
    </section>
  );
}`;

beforeEach(async () => {
  tempRepo = await mkdtemp(join(tmpdir(), "elevate-improve-e2e-"));
  serverPort = 36000 + Math.floor(Math.random() * 1000);
});

afterEach(async () => {
  vi.restoreAllMocks();
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

describe("Phase 3F End-to-End Disposable Lifecycle (Scenario Z)", () => {
  it("executes full successful improve pass: Audit → Plan → Generate → Validate → Auto-Approve → Apply → Verify → ACCEPT (kept on disk)", async () => {
    await initGitRepo();
    await commitFile("src/components/HeroSection.tsx", HERO_COMPONENT_SOURCE);

    // Mock HTTP server baseline
    mockHttpServer = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!DOCTYPE html><html lang="en" style="margin:0;padding:0;overflow:hidden;"><head><title>App</title></head><body style="margin:0;padding:0;overflow:hidden;"><main><h1>App Title</h1><button class="cta-btn bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold" style="min-width:48px;min-height:48px;padding:12px 24px;" aria-label="Get Started">Get Started</button></main></body></html>`);
    });
    await new Promise<void>((resolve) => mockHttpServer!.listen(serverPort, "127.0.0.1", () => resolve()));
    const targetUrl = `http://127.0.0.1:${serverPort}`;

    const mockAudit: AnalysisResult = {
      runMetadata: { timestamp: Date.now(), targetUrl, durationMs: 100 },
      viewportMetadata: ["desktop"],
      deterministicFindings: [],
      heuristicFindings: [],
      normalizedFindings: [],
      deduplicatedFindings: [
        {
          id: "f-hero-cta-contrast",
          category: "accessibility",
          severity: "serious",
          title: "Low CTA button contrast",
          description: "Contrast is insufficient",
          evidence: { selector: "button.cta-btn" },
          selector: "button.cta-btn",
          viewport: "desktop",
          source: "deterministic",
          deterministic: true,
          confidence: 1.0,
        },
      ],
      prioritizedFindings: [],
      recommendations: [
        {
          id: "rec-hero-cta",
          problem: "Low CTA button contrast",
          evidence: { selector: "button.cta-btn" },
          affectedSelector: "button.cta-btn",
          affectedViewports: ["desktop"],
          proposedImprovement: "Improve CTA button contrast and typography",
          rationale: "Fix WCAG AA compliance",
          confidence: 0.95,
          estimatedMutationScope: "single-element",
          risk: "low",
          sourceFindingIds: ["f-hero-cta-contrast"],
        },
      ],
      errors: [],
    };

    vi.spyOn(auditModule, "runAuditPipeline").mockResolvedValue(mockAudit);

    const result = await runImprovePass({
      targetUrl,
      projectRoot: tempRepo,
      autoApprove: true,
      patchProvider: "mock",
      mockPatchScenario: "valid_single_file",
      serverAlreadyRunning: true,
      typecheckCmd: process.platform === "win32" ? "cmd /c exit 0" : "true",
      buildCmd: process.platform === "win32" ? "cmd /c exit 0" : "true",
      skipVision: true,
    });

    expect(result.status).toBe("SUCCESS");
    expect(result.decision).toBe("ACCEPT");
    expect(result.transaction?.transactionState).toBe("COMPLETED");

    // Mutation is retained on disk
    const content = await readFile(join(tempRepo, "src/components/HeroSection.tsx"), "utf8");
    expect(content).toContain("bg-blue-600");
  });

  it("executes full failing improve pass: Audit → Plan → Generate → Validate → Apply → Verify Failure → ROLLBACK (repo exactly restored)", async () => {
    await initGitRepo();
    await commitFile("src/components/HeroSection.tsx", HERO_COMPONENT_SOURCE);

    mockHttpServer = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!DOCTYPE html><html><body><button class="cta-btn">Original Content</button></body></html>`);
    });
    await new Promise<void>((resolve) => mockHttpServer!.listen(serverPort, "127.0.0.1", () => resolve()));
    const targetUrl = `http://127.0.0.1:${serverPort}`;

    const mockAudit: AnalysisResult = {
      runMetadata: { timestamp: Date.now(), targetUrl, durationMs: 100 },
      viewportMetadata: ["desktop"],
      deterministicFindings: [],
      heuristicFindings: [],
      normalizedFindings: [],
      deduplicatedFindings: [],
      prioritizedFindings: [],
      recommendations: [
        {
          id: "rec-hero-cta-fail",
          problem: "Button styling",
          evidence: { selector: "button.cta-btn" },
          affectedSelector: "button.cta-btn",
          affectedViewports: ["desktop"],
          proposedImprovement: "Improve styling",
          rationale: "Visual",
          confidence: 0.9,
          estimatedMutationScope: "single-element",
          risk: "low",
          sourceFindingIds: [],
        },
      ],
      errors: [],
    };

    vi.spyOn(auditModule, "runAuditPipeline").mockResolvedValue(mockAudit);

    const result = await runImprovePass({
      targetUrl,
      projectRoot: tempRepo,
      autoApprove: true,
      patchProvider: "mock",
      mockPatchScenario: "valid_single_file",
      serverAlreadyRunning: true,
      typecheckCmd: process.platform === "win32" ? "cmd /c exit 1" : "false", // Intentionally fail typecheck!
      buildCmd: process.platform === "win32" ? "cmd /c exit 0" : "true",
      skipVision: true,
    });

    expect(result.status).toBe("ROLLED_BACK");
    expect(result.decision).toBe("ROLLBACK");
    expect(result.transaction?.transactionState).toBe("ROLLED_BACK");

    // Exact restoration
    const restored = await readFile(join(tempRepo, "src/components/HeroSection.tsx"), "utf8");
    expect(restored.replace(/\r\n/g, "\n").trim()).toBe(HERO_COMPONENT_SOURCE.trim());

    const { stdout: diff } = await gitExec(["diff"]);
    expect(diff).toBe("");
  });
});
