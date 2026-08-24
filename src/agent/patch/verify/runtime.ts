/**
 * Phase 3E: Runtime Startup + Route Smoke Test
 *
 * Starts the target application's dev server, polls for readiness,
 * and verifies the target route loads successfully.
 *
 * SAFETY REQUIREMENTS:
 * - Enforces startup timeout — never hangs indefinitely.
 * - Prevents orphan processes: always terminates the spawned process tree.
 * - Platform-aware: uses `taskkill /T /F /PID` on Windows as ultimate fallback.
 * - Does not kill unrelated processes.
 */

import { spawn } from "node:child_process";
import { logger } from "../../../utils/logger.js";
import type { RuntimeHandle, RuntimeStartResult, VerificationGateResult } from "./types.js";

const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_NAVIGATION_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Process lifecycle helpers
// ---------------------------------------------------------------------------

/**
 * Kill a process tree by PID.
 * On Windows uses `taskkill /T /F`, on POSIX sends SIGKILL to the process group.
 */
async function killProcessTree(pid: number): Promise<void> {
  try {
    if (process.platform === "win32") {
      // Windows: terminate entire process tree
      spawn("taskkill", ["/T", "/F", "/PID", String(pid)], {
        windowsHide: true,
        detached: false,
      });
    } else {
      // POSIX: kill the process group
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        process.kill(pid, "SIGKILL");
      }
    }
    // Brief wait for the OS to clean up
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
  } catch {
    // Process may have already exited — not an error
  }
}

/** Poll a URL until it responds with HTTP 200 or timeout. */
async function pollReadiness(
  url: string,
  timeoutMs: number,
  pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS
): Promise<{ ready: boolean; durationMs: number }> {
  const start = Date.now();
  const deadline = start + timeoutMs;

  while (Date.now() < deadline) {
    try {
      // Use the built-in fetch (Node ≥ 18)
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok || res.status < 500) {
        return { ready: true, durationMs: Date.now() - start };
      }
    } catch {
      // Not ready yet — keep polling
    }
    await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return { ready: false, durationMs: Date.now() - start };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the dev server and wait until the target URL is reachable.
 * Returns a handle that Phase 3E must call shutdown() on when done.
 */
export async function startRuntime(options: {
  cwd: string;
  command: string;
  targetUrl: string;
  startupTimeoutMs?: number;
}): Promise<RuntimeStartResult> {
  const start = Date.now();
  const timeoutMs = options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;

  logger.step("VERIFY", `Starting runtime: ${options.command}`);

  const parts = options.command.split(/\s+/);
  const executable = parts[0];
  const args = parts.slice(1);

  const child = spawn(executable, args, {
    cwd: options.cwd,
    stdio: "pipe",
    windowsHide: true,
    // Start in a new process group so we can kill the whole tree
    detached: process.platform !== "win32",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      NODE_ENV: "development",
      // Suppress Next.js telemetry
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });

  let processExited = false;
  let exitError: string | undefined;

  child.on("error", (err) => {
    logger.error(`Runtime spawn error: ${err.message}`);
    exitError = err.message;
    processExited = true;
  });

  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      exitError = `Process exited with code ${code}`;
    }
    processExited = true;
  });

  // Build the handle object before polling so it can be returned even on failure
  const handle: RuntimeHandle = {
    pid: child.pid ?? 0,
    async shutdown(): Promise<void> {
      if (processExited) return;
      try {
        child.kill("SIGTERM");
        await new Promise<void>((resolve) => setTimeout(resolve, 1500));
      } catch {
        // SIGTERM failed
      }
      if (!processExited && child.pid) {
        await killProcessTree(child.pid);
      }
    },
  };

  // Poll until ready or timeout
  const { ready, durationMs } = await pollReadiness(options.targetUrl, timeoutMs);

  if (!ready || processExited) {
    const error = exitError ?? `Runtime did not become ready within ${timeoutMs}ms`;
    logger.error(`Runtime startup FAILED: ${error}`);
    // Clean up the orphan process
    await handle.shutdown();
    return {
      success: false,
      url: options.targetUrl,
      error,
      durationMs: Date.now() - start,
    };
  }

  logger.success(`Runtime ready at ${options.targetUrl} (${durationMs}ms)`);
  return {
    success: true,
    handle,
    url: options.targetUrl,
    durationMs: Date.now() - start,
  };
}

/**
 * Route smoke test: navigate to the target URL and verify it loads without fatal errors.
 * Uses the Playwright page already opened by BrowserRunner where possible,
 * or falls back to a plain HTTP GET.
 */
export async function runRouteSmoke(options: {
  targetUrl: string;
  navigationTimeoutMs?: number;
}): Promise<VerificationGateResult> {
  const start = Date.now();
  const timeoutMs = options.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS;

  logger.step("VERIFY", `Route smoke test: ${options.targetUrl}`);

  try {
    const res = await fetch(options.targetUrl, {
      signal: AbortSignal.timeout(timeoutMs),
    });

    const durationMs = Date.now() - start;

    if (!res.ok && res.status >= 500) {
      return {
        name: "Route Smoke Test",
        passed: false,
        output: `HTTP ${res.status} ${res.statusText}`,
        error: `Route returned HTTP ${res.status}`,
        exitCode: res.status,
        durationMs,
        mandatory: true,
      };
    }

    // Try to read the body to confirm there is content
    const text = await res.text();
    const hasDocument = text.includes("<html") || text.includes("<!DOCTYPE");

    if (!hasDocument) {
      return {
        name: "Route Smoke Test",
        passed: false,
        output: `HTTP ${res.status}: Response body does not contain HTML document`,
        error: "No HTML document in response",
        exitCode: res.status,
        durationMs,
        mandatory: true,
      };
    }

    logger.success(`Route smoke test passed (HTTP ${res.status}, ${durationMs}ms)`);
    return {
      name: "Route Smoke Test",
      passed: true,
      output: `HTTP ${res.status} — document verified`,
      exitCode: res.status,
      durationMs,
      mandatory: true,
    };
  } catch (err: any) {
    const durationMs = Date.now() - start;
    logger.error(`Route smoke test FAILED: ${err.message}`);
    return {
      name: "Route Smoke Test",
      passed: false,
      output: err.message,
      error: `Route navigation failed: ${err.message}`,
      durationMs,
      mandatory: true,
    };
  }
}
