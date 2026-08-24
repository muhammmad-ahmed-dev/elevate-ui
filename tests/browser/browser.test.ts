import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as http from "node:http";
import { BrowserRunner } from "../../src/browser/runner.js";
import { DEFAULT_VIEWPORTS } from "../../src/browser/viewports.js";

describe("BrowserRunner & PageExtractor", () => {
  let server: http.Server;
  let serverUrl: string;
  let runner: BrowserRunner;

  beforeAll(async () => {
    // Spin up a simple local HTTP server with test HTML
    server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>Elevate Test Target</title>
          <style>
            body { margin: 0; font-family: sans-serif; }
            h1 { font-size: 32px; color: #111827; }
            .hero { padding: 24px; background-color: #f3f4f6; }
            .btn { background: #3b82f6; color: white; padding: 8px 16px; border: none; }
            /* Deliberate mobile horizontal overflow */
            .wide-box { width: 600px; height: 100px; background: #e5e7eb; }
          </style>
        </head>
        <body>
          <main class="hero">
            <h1>Elevate Hero Section</h1>
            <p>Refining web design with closed-loop browser feedback.</p>
            <button class="btn">Get Started</button>
            <div class="wide-box">Wide Box Element</div>
          </main>
        </body>
        </html>
      `);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address() as any;
        serverUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    runner = new BrowserRunner({ headless: true });
  });

  afterAll(async () => {
    if (runner) {
      await runner.close();
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("captures perception across all 3 viewports and extracts DOM/CSS/overflow", async () => {
    const result = await runner.captureAllViewports(serverUrl, DEFAULT_VIEWPORTS);

    expect(result.targetUrl).toBe(serverUrl);
    expect(result.captures.mobile).toBeDefined();
    expect(result.captures.tablet).toBeDefined();
    expect(result.captures.desktop).toBeDefined();

    // Check Mobile Capture (375px)
    const mobile = result.captures.mobile;
    expect(mobile.title).toBe("Elevate Test Target");
    expect(mobile.screenshotBuffer.length).toBeGreaterThan(0);
    expect(mobile.screenshotBase64.length).toBeGreaterThan(0);
    expect(mobile.elements.length).toBeGreaterThan(0);

    // Elements should include H1, P, BUTTON
    const tagNames = mobile.elements.map((e) => e.tagName);
    expect(tagNames).toContain("h1");
    expect(tagNames).toContain("p");
    expect(tagNames).toContain("button");

    // The 600px wide box on 375px viewport should trigger horizontal overflow detection
    expect(mobile.overflowIssues.length).toBeGreaterThan(0);
    const wideBoxIssue = mobile.overflowIssues.find((i) => i.scrollWidth >= 600 || i.element === "div");
    expect(wideBoxIssue).toBeDefined();

    // Check Desktop Capture (1440px)
    const desktop = result.captures.desktop;
    expect(desktop.viewport.width).toBe(1440);
    expect(desktop.elements.length).toBeGreaterThan(0);
  });

  it("handles unavailable target server gracefully with helpful error", async () => {
    const deadRunner = new BrowserRunner({ headless: true, timeout: 2000 });
    try {
      await expect(
        deadRunner.captureViewport("http://127.0.0.1:59999", DEFAULT_VIEWPORTS[0])
      ).rejects.toThrow(/Failed to reach local server/i);
    } finally {
      await deadRunner.close();
    }
  });

  it("preserves absolute document coordinates for elements below viewport when scrolled", async () => {
    // Create a server with tall content
    let tallServerUrl = "";
    const tallServer = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Tall Page</title>
          <style>
            body { margin: 0; padding: 0; }
            .spacer { height: 1800px; background: #fafafa; }
            .deep-button { height: 50px; background: #000; color: #fff; margin: 0; }
          </style>
        </head>
        <body>
          <div class="spacer">Spacer Top</div>
          <button class="deep-button">Deep Action Button</button>
        </body>
        </html>
      `);
    });

    await new Promise<void>((resolve) => {
      tallServer.listen(0, "127.0.0.1", () => {
        const address = tallServer.address() as any;
        tallServerUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    const tallRunner = new BrowserRunner({ headless: true });
    try {
      const extraction = await tallRunner.captureViewport(tallServerUrl, DEFAULT_VIEWPORTS[0]);
      
      const deepButton = extraction.elements.find((e) => e.tagName === "button" && e.textContent?.includes("Deep Action Button"));
      expect(deepButton).toBeDefined();
      
      // The button is below 1800px spacer, so its absolute Y and top must be >= 1800
      expect(deepButton?.boundingBox.y).toBeGreaterThanOrEqual(1800);
      expect(deepButton?.boundingBox.top).toBeGreaterThanOrEqual(1800);
    } finally {
      await tallRunner.close();
      await new Promise<void>((resolve) => tallServer.close(() => resolve()));
    }
  });
});
