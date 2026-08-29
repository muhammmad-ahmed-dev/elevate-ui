/**
 * Phase 4C.5: Coding Agent Security Guard & Process Isolation
 *
 * Enforces strict security boundaries, prevents mutation of the host Elevate
 * repository, strips all API keys/secrets from child process environments,
 * and ensures process tree cleanup on timeout.
 */

import { resolve, normalize } from "node:path";
import { existsSync } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const SENSITIVE_KEY_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /token/i,
  /password/i,
  /gemini/i,
  /anthropic/i,
  /openai/i,
  /elevate_patch/i,
  /aws_/i,
];

const AUTH_REQUIRED_PATTERNS = [
  /authentication[- ]required/i,
  /login[- ]required/i,
  /not[- ]authenticated/i,
  /unauthenticated/i,
  /please[- ]sign[- ]in/i,
  /please[- ]log[- ]in/i,
  /run\s+['"]?agy\s+auth['"]?/i,
  /run\s+['"]?antigravity\s+auth['"]?/i,
  /session\s+expired/i,
  /invalid\s+credentials/i,
  /401\s+unauthorized/i,
  /credentials\s+missing/i,
];

const INFRASTRUCTURE_FAILURE_PATTERNS = [
  /model is currently unreachable/i,
  /model unreachable/i,
  /service unavailable/i,
  /503 unavailable/i,
  /503 service unavailable/i,
  /resource exhausted/i,
  /quota exceeded/i,
  /rate limit/i,
  /429 too many requests/i,
  /connection refused/i,
  /network error/i,
  /socket hang up/i,
  /econnreset/i,
  /etimedout/i,
  /backend unavailable/i,
  /not eligible/i,
];

export class AgentSecurityGuard {
  /**
   * Validates that the target workspace is an isolated disposable repository
   * and strictly NOT the host Elevate repository or a system root.
   */
  public static validateWorkspace(workspaceRoot: string): void {
    if (!workspaceRoot || typeof workspaceRoot !== "string") {
      throw new Error("Security violation: Workspace root must be a non-empty string path.");
    }

    const absWorkspace = resolve(workspaceRoot);
    const absHost = resolve(process.cwd());

    // Invariant 1: Cannot be the host Elevate repository
    if (normalize(absWorkspace).toLowerCase() === normalize(absHost).toLowerCase()) {
      throw new Error(
        `Security violation: Cannot execute coding agent against host Elevate repository (${absWorkspace}). Must use isolated disposable repository.`
      );
    }

    // Invariant 2: Cannot be a parent directory of the host repo or root
    if (absHost.startsWith(absWorkspace) && absHost !== absWorkspace) {
      throw new Error(
        `Security violation: Target workspace (${absWorkspace}) is an ancestor of host repository.`
      );
    }

    // Invariant 3: Must contain a .git folder
    const gitDir = resolve(absWorkspace, ".git");
    if (!existsSync(gitDir)) {
      throw new Error(
        `Security violation: Workspace root (${absWorkspace}) is not a Git repository. Coding agents require Git-tracked disposable repositories.`
      );
    }
  }

  /**
   * Sanitizes environment variables for agent child processes.
   * Strips all API keys, sensitive tokens, and credentials.
   */
  public static sanitizeEnvironment(
    baseEnv: NodeJS.ProcessEnv = process.env,
    extraEnv: Record<string, string> = {}
  ): NodeJS.ProcessEnv {
    const sanitized: NodeJS.ProcessEnv = {};

    for (const [key, value] of Object.entries(baseEnv)) {
      if (!value) continue;

      // Allow Antigravity system runtime metadata variables (non-secret endpoint & session markers)
      if (key.startsWith("ANTIGRAVITY_LS_") || key.startsWith("ANTIGRAVITY_EDITOR_") || key === "ANTIGRAVITY_AGENT") {
        sanitized[key] = value;
        continue;
      }

      // Check if key matches sensitive patterns
      const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
      if (isSensitive) {
        continue; // Strip sensitive key
      }

      sanitized[key] = value;
    }

    // Explicitly strip any GEMINI_API_KEY or ANTHROPIC_API_KEY
    delete sanitized.GEMINI_API_KEY;
    delete sanitized.ANTHROPIC_API_KEY;
    delete sanitized.OPENAI_API_KEY;
    delete sanitized.ELEVATE_PATCH_API_KEY;

    // Apply safe extra environment variables
    for (const [k, v] of Object.entries(extraEnv)) {
      const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(k));
      if (!isSensitive) {
        sanitized[k] = v;
      }
    }

    // Ensure standard agy install directory is in PATH
    const userProfile = process.env.USERPROFILE || "";
    const localAppData = process.env.LOCALAPPDATA || (userProfile ? `${userProfile}\\AppData\\Local` : "");
    if (localAppData) {
      const agyBin = `${localAppData}\\agy\\bin`;
      if (sanitized.PATH && !sanitized.PATH.includes(agyBin)) {
        sanitized.PATH = `${agyBin};${sanitized.PATH}`;
      } else if (!sanitized.PATH) {
        sanitized.PATH = agyBin;
      }
    }

    return sanitized;
  }

  /**
   * Detects if process output indicates that authentication is required.
   */
  public static isAuthenticationRequired(text: string): boolean {
    if (!text) return false;
    return AUTH_REQUIRED_PATTERNS.some((pattern) => pattern.test(text));
  }

  /**
   * Detects if process output or error indicates backend infrastructure failure
   * (unreachable model, 503, quota, rate limit, socket hang up).
   */
  public static isInfrastructureFailure(text: string): boolean {
    if (!text) return false;
    return INFRASTRUCTURE_FAILURE_PATTERNS.some((pattern) => pattern.test(text));
  }

  /**
   * Safely terminates a process and its child process tree to prevent orphaned processes.
   */
  public static async killProcessTree(pid: number): Promise<void> {
    if (!pid || pid <= 0) return;

    try {
      if (process.platform === "win32") {
        await execAsync(`taskkill /F /T /PID ${pid}`).catch(() => {
          // Process may have already exited
        });
      } else {
        process.kill(-pid, "SIGKILL");
      }
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // ignore
      }
    }
  }
}
