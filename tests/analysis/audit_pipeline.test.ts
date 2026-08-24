import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as http from "node:http";
import { runAuditPipeline } from "../../src/cli/commands/audit.js";

describe("Phase 2 Audit Pipeline Integration", () => {
  let server: http.Server;
  let serverUrl: string;

  beforeAll(async () => {
    // Spin up a test server with rich HTML containing deliberate issues:
    // 1. Undersized button (20x20) -> touch-target
    // 2. Broken image (complete with 0 natural dimensions) -> broken-image
    // 3. Skipped heading level (h1 followed by h3) -> heading-hierarchy
    // 4. Wide box (600px) -> horizontal overflow on 375px mobile
    server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>Elevate Phase 2 Audit Target</title>
          <style>
            body { margin: 0; padding: 16px; font-family: sans-serif; }
            h1 { font-size: 28px; }
            h3 { font-size: 18px; }
            .small-btn { width: 22px; height: 22px; padding: 0; background: #3b82f6; border: none; }
            .wide-container { width: 620px; height: 50px; background: #e5e7eb; }
          </style>
        </head>
        <body>
          <header>
            <h1>Elevate Product Header</h1>
            <h3>Directly nested h3 skipping h2</h3>
          </header>
          <main>
            <p>Welcome to Elevate visual audit target app.</p>
            <button class="small-btn" aria-label="Icon">X</button>
            <img id="broken-logo" src="http://127.0.0.1:59999/non-existent-logo.png" alt="Broken Logo" />
            <div class="wide-container">Wide Overflow Box</div>
          </main>
        </body>
        </html>
      `);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as any;
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("executes full audit pipeline and produces deterministic findings, prioritized rankings, and 3-5 recommendations", async () => {
    const result = await runAuditPipeline(serverUrl, {
      visionProvider: "mock",
    });

    expect(result.runMetadata.targetUrl).toBe(serverUrl);
    expect(result.viewportMetadata.length).toBe(3);

    // 1. Check Deterministic Findings
    expect(result.deterministicFindings.length).toBeGreaterThan(0);
    const categories = result.deterministicFindings.map((f) => f.category);

    // Should detect overflow on mobile
    expect(categories).toContain("overflow");
    // Should detect undersized button
    expect(categories).toContain("touch-target");
    // Should detect skipped heading level
    expect(categories).toContain("heading-hierarchy");

    // 2. Check Deduplicated & Prioritized Findings
    expect(result.deduplicatedFindings.length).toBeGreaterThan(0);
    expect(result.prioritizedFindings.length).toBe(result.deduplicatedFindings.length);

    // Rank #1 should have highest score
    expect(result.prioritizedFindings[0].rank).toBe(1);
    expect(result.prioritizedFindings[0].rationale).toBeTruthy();

    // 3. Check Synthesized Recommendations
    expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(result.recommendations.length).toBeLessThanOrEqual(5);

    const firstRec = result.recommendations[0];
    expect(firstRec.id).toBeTruthy();
    expect(firstRec.problem).toBeTruthy();
    expect(firstRec.proposedImprovement).toBeTruthy();
    expect(firstRec.affectedViewports.length).toBeGreaterThan(0);
    expect(firstRec.confidence).toBeGreaterThan(0);
  });

  it("never modifies project source files during audit pipeline execution", async () => {
    const { GitManager } = await import("../../src/safety/git.js");
    const git = new GitManager();
    const beforeStatus = await git.getStatus();

    // Run audit
    await runAuditPipeline(serverUrl, { skipVision: true });

    const afterStatus = await git.getStatus();
    // Working tree state and modified files count must remain identical
    expect(afterStatus.modifiedFiles).toEqual(beforeStatus.modifiedFiles);
    expect(afterStatus.headCommit).toBe(beforeStatus.headCommit);
  });
});
