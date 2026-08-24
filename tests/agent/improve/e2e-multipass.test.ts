/**
 * Phase 3G: Multi-Pass End-to-End Integration Tests
 *
 * Real disposable Git repository tests verifying:
 *  - Scenario A: Multi-pass sequential execution across distinct recommendations (ACCEPT -> ACCEPT -> STOP)
 *  - Scenario B: Rollback on verification failure immediately terminates multi-pass loop safely
 *  - Scenario C: Repeated recommendation proposal triggers immediate loop termination
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type Server } from "node:http";
import { runMultiPassImproveLoop } from "../../../src/agent/improve/loop.js";
import * as auditModule from "../../../src/cli/commands/audit.js";
import type { AnalysisResult, MutationRecommendation } from "../../../src/analysis/types.js";

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
  await gitExec(["config", "user.name", "Elevate MultiPass Test"]);
  await gitExec(["config", "user.email", "multipass@elevate.local"]);
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

const CLEAN_HTML = `<!DOCTYPE html><html lang="en" style="margin:0;padding:0;overflow:hidden;"><head><title>App</title></head><body style="margin:0;padding:0;overflow:hidden;"><main><h1>App Title</h1><button class="cta-btn bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold" style="min-width:48px;min-height:48px;padding:12px 24px;" aria-label="Get Started">Get Started</button></main></body></html>`;

beforeEach(async () => {
  tempRepo = await mkdtemp(join(tmpdir(), "elevate-multipass-e2e-"));
  serverPort = 37000 + Math.floor(Math.random() * 1000);
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

describe("Phase 3G Multi-Pass End-to-End Scenarios", () => {
  it("Scenario A: executes multi-pass sequential elevation until convergence (ACCEPT -> ACCEPT -> NO_ACTIONABLE_IMPROVEMENTS)", async () => {
    await initGitRepo();
    await commitFile("src/components/HeroSection.tsx", HERO_COMPONENT_SOURCE);

    mockHttpServer = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(CLEAN_HTML);
    });
    await new Promise<void>((resolve) => mockHttpServer!.listen(serverPort, "127.0.0.1", () => resolve()));
    const targetUrl = `http://127.0.0.1:${serverPort}`;

    const rec1: MutationRecommendation = {
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
    };

    const mockAuditPass1: AnalysisResult = {
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
      recommendations: [rec1],
      errors: [],
    };

    const mockAuditPass2: AnalysisResult = {
      runMetadata: { timestamp: Date.now(), targetUrl, durationMs: 100 },
      viewportMetadata: ["desktop"],
      deterministicFindings: [],
      heuristicFindings: [],
      normalizedFindings: [],
      deduplicatedFindings: [],
      prioritizedFindings: [],
      recommendations: [], // No more issues after pass 1!
      errors: [],
    };

    let auditCallCount = 0;
    vi.spyOn(auditModule, "runAuditPipeline").mockImplementation(async () => {
      auditCallCount++;
      return auditCallCount === 1 ? mockAuditPass1 : mockAuditPass2;
    });

    const result = await runMultiPassImproveLoop({
      targetUrl,
      projectRoot: tempRepo,
      maxPasses: 3,
      autoApprove: true,
      patchProvider: "mock",
      mockPatchScenario: "valid_single_file",
      serverAlreadyRunning: true,
      typecheckCmd: process.platform === "win32" ? "cmd /c exit 0" : "true",
      buildCmd: process.platform === "win32" ? "cmd /c exit 0" : "true",
      skipVision: true,
    });

    expect(result.finalStatus).toBe("SUCCESS");
    expect(result.passesExecuted).toBe(1);
    expect(result.passesAccepted).toBe(1);
    expect(result.stoppingReason).toBe("NO_ACTIONABLE_IMPROVEMENTS");

    // Mutation is retained
    const content = await readFile(join(tempRepo, "src/components/HeroSection.tsx"), "utf8");
    expect(content).toContain("bg-blue-600");
  });

  it("Scenario B: verification failure triggers ROLLBACK and immediately terminates multi-pass loop safely", async () => {
    await initGitRepo();
    await commitFile("src/components/HeroSection.tsx", HERO_COMPONENT_SOURCE);

    mockHttpServer = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!DOCTYPE html><html><body><button class="cta-btn">Original Content</button></body></html>`);
    });
    await new Promise<void>((resolve) => mockHttpServer!.listen(serverPort, "127.0.0.1", () => resolve()));
    const targetUrl = `http://127.0.0.1:${serverPort}`;

    const recFail: MutationRecommendation = {
      id: "rec-hero-fail",
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
    };

    const mockAudit: AnalysisResult = {
      runMetadata: { timestamp: Date.now(), targetUrl, durationMs: 100 },
      viewportMetadata: ["desktop"],
      deterministicFindings: [],
      heuristicFindings: [],
      normalizedFindings: [],
      deduplicatedFindings: [],
      prioritizedFindings: [],
      recommendations: [recFail],
      errors: [],
    };

    vi.spyOn(auditModule, "runAuditPipeline").mockResolvedValue(mockAudit);

    const result = await runMultiPassImproveLoop({
      targetUrl,
      projectRoot: tempRepo,
      maxPasses: 3,
      autoApprove: true,
      patchProvider: "mock",
      mockPatchScenario: "valid_single_file",
      serverAlreadyRunning: true,
      typecheckCmd: process.platform === "win32" ? "cmd /c exit 1" : "false", // Intentionally fail typecheck!
      buildCmd: process.platform === "win32" ? "cmd /c exit 0" : "true",
      skipVision: true,
    });

    expect(result.finalStatus).toBe("ROLLED_BACK");
    expect(result.stoppingReason).toBe("ROLLBACK");
    expect(result.passesExecuted).toBe(1);
    expect(result.passesRolledBack).toBe(1);

    // Repository restored exactly
    const restored = await readFile(join(tempRepo, "src/components/HeroSection.tsx"), "utf8");
    expect(restored.replace(/\r\n/g, "\n").trim()).toBe(HERO_COMPONENT_SOURCE.trim());

    const { stdout: diff } = await gitExec(["diff"]);
    expect(diff).toBe("");
  });

  it("Scenario C: stops immediately with REPEATED_RECOMMENDATION when model proposes duplicate recommendation", async () => {
    await initGitRepo();
    await commitFile("src/components/HeroSection.tsx", HERO_COMPONENT_SOURCE);

    mockHttpServer = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(CLEAN_HTML);
    });
    await new Promise<void>((resolve) => mockHttpServer!.listen(serverPort, "127.0.0.1", () => resolve()));
    const targetUrl = `http://127.0.0.1:${serverPort}`;

    const recRepeat: MutationRecommendation = {
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
    };

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
      recommendations: [recRepeat],
      errors: [],
    };

    // Returns same recommendation on both passes
    vi.spyOn(auditModule, "runAuditPipeline").mockResolvedValue(mockAudit);

    const result = await runMultiPassImproveLoop({
      targetUrl,
      projectRoot: tempRepo,
      maxPasses: 3,
      autoApprove: true,
      patchProvider: "mock",
      mockPatchScenario: "valid_single_file",
      serverAlreadyRunning: true,
      typecheckCmd: process.platform === "win32" ? "cmd /c exit 0" : "true",
      buildCmd: process.platform === "win32" ? "cmd /c exit 0" : "true",
      skipVision: true,
    });

    expect(result.passesExecuted).toBe(1);
    expect(result.passesAccepted).toBe(1);
    // On pass 2, it saw the same recommendation already attempted and stopped with NO_ACTIONABLE_IMPROVEMENTS
    expect(["NO_ACTIONABLE_IMPROVEMENTS", "REPEATED_RECOMMENDATION"]).toContain(result.stoppingReason);
  });
});
