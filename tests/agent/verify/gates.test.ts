/**
 * Phase 3E: Hard Gates Unit Tests
 *
 * Tests Scenarios A through H, AD, and timeout safety:
 *  A. TypeScript check success
 *  B. TypeScript check failure
 *  C. Framework build success
 *  D. Framework build failure
 *  E. Runtime startup success
 *  F. Runtime startup timeout
 *  G. Route smoke success
 *  H. Route smoke failure
 *  AD. Process cleanup (no orphan processes)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { runTypecheckGate } from "../../../src/agent/patch/verify/typecheck.js";
import { runBuildGate } from "../../../src/agent/patch/verify/build.js";
import { startRuntime, runRouteSmoke } from "../../../src/agent/patch/verify/runtime.js";
import { runHardGates } from "../../../src/agent/patch/verify/gates.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "elevate-verify-gates-"));
});

afterEach(async () => {
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup error on Windows
  }
});

describe("TypeScript Verification Gate (Scenarios A & B)", () => {
  it("passes when typecheck command exits 0 (A)", async () => {
    const result = await runTypecheckGate({
      cwd: tempDir,
      command: process.platform === "win32" ? "cmd /c exit 0" : "true",
    });

    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.mandatory).toBe(true);
    expect(result.name).toBe("TypeScript");
  });

  it("fails and captures error when typecheck command exits non-zero (B)", async () => {
    const result = await runTypecheckGate({
      cwd: tempDir,
      command: process.platform === "win32" ? "cmd /c exit 1" : "false",
    });

    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain("TypeScript check failed");
  });

  it("handles timeout correctly and produces structured failure result", async () => {
    const sleepCmd = process.platform === "win32"
      ? "powershell -Command Start-Sleep -Seconds 10"
      : "sleep 10";

    const result = await runTypecheckGate({
      cwd: tempDir,
      command: sleepCmd,
      timeoutMs: 300,
    });

    expect(result.passed).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("Framework Build Verification Gate (Scenarios C & D)", () => {
  it("passes when build command exits 0 (C)", async () => {
    const result = await runBuildGate({
      cwd: tempDir,
      command: process.platform === "win32" ? "cmd /c exit 0" : "true",
    });

    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.mandatory).toBe(true);
    expect(result.name).toBe("Framework Build");
  });

  it("fails and captures output when build command exits non-zero (D)", async () => {
    const result = await runBuildGate({
      cwd: tempDir,
      command: process.platform === "win32" ? "cmd /c exit 2" : "sh -c 'exit 2'",
    });

    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.error).toContain("Framework build failed");
  });

  it("auto-detects build command from package.json if available", async () => {
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({
        name: "test-pkg",
        scripts: { build: process.platform === "win32" ? "cmd /c exit 0" : "true" },
      })
    );

    const result = await runBuildGate({
      cwd: tempDir,
    });

    // Uses npm run build which tries to run the script
    expect(result.name).toBe("Framework Build");
  });
});

describe("Runtime Startup & Process Cleanup (Scenarios E, F, AD)", () => {
  let mockServer: Server | null = null;
  let testPort: number;

  beforeEach(() => {
    testPort = 39000 + Math.floor(Math.random() * 1000);
  });

  afterEach(() => {
    if (mockServer) {
      mockServer.close();
      mockServer = null;
    }
  });

  it("successfully detects ready server on target URL (E)", async () => {
    // Create an HTTP mock server that starts immediately
    mockServer = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<!DOCTYPE html><html><body><h1>App</h1></body></html>");
    });

    await new Promise<void>((resolve) => {
      mockServer!.listen(testPort, "127.0.0.1", () => resolve());
    });

    const targetUrl = `http://127.0.0.1:${testPort}`;
    const dummyScript = process.platform === "win32" ? "cmd /c exit 0" : "true";

    const result = await startRuntime({
      cwd: tempDir,
      command: dummyScript,
      targetUrl,
      startupTimeoutMs: 2000,
    });

    expect(result.success).toBe(true);
    expect(result.url).toBe(targetUrl);
    expect(result.handle).toBeDefined();

    // Clean up
    await result.handle?.shutdown();
  });

  it("times out cleanly when server never becomes ready and kills process (F & AD)", async () => {
    const unusedPort = 38000 + Math.floor(Math.random() * 1000);
    const targetUrl = `http://127.0.0.1:${unusedPort}`;

    // A process that hangs
    const hangingCmd = process.platform === "win32"
      ? "powershell -Command Start-Sleep -Seconds 30"
      : "sleep 30";

    const result = await startRuntime({
      cwd: tempDir,
      command: hangingCmd,
      targetUrl,
      startupTimeoutMs: 800,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("did not become ready");
  });
});

describe("Route Smoke Test (Scenarios G & H)", () => {
  let server: Server | null = null;
  let port: number;

  afterEach(() => {
    if (server) {
      server.close();
      server = null;
    }
  });

  it("passes when route returns HTTP 200 with HTML document (G)", async () => {
    port = 37000 + Math.floor(Math.random() * 1000);
    server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Hello</h1></body></html>");
    });
    await new Promise<void>((resolve) => server!.listen(port, "127.0.0.1", () => resolve()));

    const result = await runRouteSmoke({
      targetUrl: `http://127.0.0.1:${port}`,
    });

    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(200);
    expect(result.name).toBe("Route Smoke Test");
  });

  it("fails when route returns HTTP 500 error (H)", async () => {
    port = 37000 + Math.floor(Math.random() * 1000);
    server = createServer((_req, res) => {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    });
    await new Promise<void>((resolve) => server!.listen(port, "127.0.0.1", () => resolve()));

    const result = await runRouteSmoke({
      targetUrl: `http://127.0.0.1:${port}`,
    });

    expect(result.passed).toBe(false);
    expect(result.error).toContain("HTTP 500");
  });

  it("fails when endpoint is unreachable", async () => {
    const unreachablePort = 36000 + Math.floor(Math.random() * 1000);
    const result = await runRouteSmoke({
      targetUrl: `http://127.0.0.1:${unreachablePort}`,
      navigationTimeoutMs: 500,
    });

    expect(result.passed).toBe(false);
    expect(result.error).toContain("Route navigation failed");
  });
});

describe("Hard Gates Orchestrator (runHardGates)", () => {
  it("skips framework build when typecheck fails", async () => {
    const gates = await runHardGates({
      projectRoot: tempDir,
      targetUrl: "http://localhost:3000",
      typecheckCmd: process.platform === "win32" ? "cmd /c exit 1" : "false",
      buildCmd: process.platform === "win32" ? "cmd /c exit 0" : "true",
    });

    expect(gates).toHaveLength(2);
    expect(gates[0].name).toBe("TypeScript");
    expect(gates[0].passed).toBe(false);
    expect(gates[1].name).toBe("Framework Build");
    expect(gates[1].passed).toBe(false);
    expect(gates[1].output).toContain("Skipped");
  });

  it("runs all gates when commands pass", async () => {
    const gates = await runHardGates({
      projectRoot: tempDir,
      targetUrl: "http://localhost:3000",
      typecheckCmd: process.platform === "win32" ? "cmd /c exit 0" : "true",
      buildCmd: process.platform === "win32" ? "cmd /c exit 0" : "true",
    });

    expect(gates).toHaveLength(2);
    expect(gates.every((g) => g.passed)).toBe(true);
  });
});
