/**
 * Phase 4C.5: Coding Agent Adapter Architecture — Type Definitions
 *
 * Defines the contracts, models, and options for orchestrating external
 * autonomous coding agents (e.g. Antigravity CLI, Claude Code, Mock) on
 * isolated disposable benchmark repositories.
 */

export type AgentErrorCode =
  | "AGENT_AUTHENTICATION_REQUIRED"
  | "AGENT_TIMEOUT"
  | "AGENT_CRASH"
  | "INFRASTRUCTURE_FAILURE"
  | "SECURITY_VIOLATION"
  | "NO_EDITS_PRODUCED"
  | "CLI_NOT_FOUND"
  | "UNKNOWN";

/**
 * Task specification provided to a CodingAgentAdapter.
 *
 * CRITICAL SAFETY RAIL:
 * This task must NEVER contain the benchmark solution (`fixedCode`) or internal secrets.
 */
export interface AgentTask {
  /** Unique task identifier. */
  taskId: string;

  /** Benchmark case identifier (e.g. "bench-accessibility-01"). */
  caseId: string;

  /** Benchmark case human-readable title. */
  caseName: string;

  /** Visual defect category (e.g. "accessibility", "touch-targets"). */
  category: string;

  /** Relative paths of allowed target files to inspect and edit (e.g. ["src/components/Button.tsx"]). */
  targetFiles: string[];

  /** Human-readable description of the detected defect and issue evidence. */
  problemDescription: string;

  /** Expected visual/code improvement description. */
  expectedVisualImprovement?: string;

  /** Grounded DOM/CSS evidence (sanitized, no secrets). */
  relevantEvidence?: Record<string, unknown>;

  /** Absolute path to the isolated disposable benchmark repository. */
  workspaceRoot: string;

  /** Model identifier requested for the coding agent (e.g. "gemini-3.7-flash-high"). */
  model?: string;

  /** Reasoning/thinking effort level requested (e.g. "high"). */
  effort?: "low" | "medium" | "high";

  /** Maximum execution duration in milliseconds before child process termination. */
  timeoutMs?: number;

  /** Optional custom instructions or constraints for the task. */
  customInstructions?: string;
}

/**
 * Execution outcome returned by a CodingAgentAdapter.
 */
export interface AgentRunResult {
  /** Whether the agent process completed without critical crash or security violation. */
  success: boolean;

  /** Identifier of the executing adapter (e.g. "antigravity", "mock"). */
  agentName: string;

  /** Model identifier used during execution. */
  modelName: string;

  /** Absolute path to the disposable repository workspace. */
  workspaceRoot: string;

  /** Process exit code from the agent executable (if applicable). */
  exitCode?: number;

  /** Raw standard output captured from the agent process. */
  stdout?: string;

  /** Raw standard error captured from the agent process. */
  stderr?: string;

  /** Relative file paths the agent claimed to modify. */
  modifiedFilesClaimed?: string[];

  /** Actual modified relative file paths detected on disk via git status. */
  actualModifiedFiles?: string[];

  /** Raw unified git diff produced on disk in the disposable repository. */
  gitDiffProduced?: string;

  /** Wall-clock execution time in milliseconds. */
  durationMs: number;

  /** Structured error message if execution failed. */
  errorMessage?: string;

  /** Specific error classification code (e.g. "AGENT_AUTHENTICATION_REQUIRED"). */
  errorCode?: AgentErrorCode;

  /** Whether the agent run was terminated due to timeout. */
  timedOut?: boolean;

  /** Structured raw output parsed from agent JSON stream (if available). */
  rawOutput?: unknown;
}

/**
 * Common interface for all coding agent adapters.
 */
export interface CodingAgentAdapter {
  /** Stable identifier (e.g. "antigravity", "mock", "claude-code"). */
  readonly name: string;

  /** List of model names supported by this adapter. */
  readonly supportedModels: string[];

  /** Checks if the underlying agent CLI or runtime is available and usable. */
  isAvailable(): Promise<boolean>;

  /**
   * Executes a task against the designated disposable benchmark repository.
   *
   * CONTRACT:
   * - Must ONLY operate within task.workspaceRoot.
   * - Must NEVER modify the host Elevate repository.
   * - Must terminate all spawned child processes upon completion or timeout.
   * - Must detect authentication requirements and report AGENT_AUTHENTICATION_REQUIRED.
   * - Must NEVER switch to a direct API provider or fall back to Mock silently.
   */
  executeTask(task: AgentTask): Promise<AgentRunResult>;
}

/**
 * Configuration options for AntigravityCodingAgentAdapter.
 */
export interface AntigravityAdapterOptions {
  /** CLI executable name or path (default: "agy"). */
  cliCommand?: string;

  /** Whether to run the CLI in headless mode (default: true). */
  headless?: boolean;

  /** Effort level to pass via `--effort` (default: "high"). */
  effort?: "low" | "medium" | "high";

  /** Output format to pass via `--output-format` (default: "json"). */
  outputFormat?: "json" | "text" | "stream-json";

  /** Mode flag to pass via `--mode` (default: undefined). */
  mode?: "accept-edits" | "plan";

  /** Maximum execution timeout in milliseconds (default: 120000). */
  timeoutMs?: number;

  /** Whether to dangerously skip permission prompts (default: false - scoped permissions enforced). */
  dangerouslySkipPermissions?: boolean;

  /** Additional environment variables to pass to the process. */
  extraEnv?: Record<string, string>;
}

/**
 * Configuration options for MockCodingAgentAdapter.
 */
export type MockAgentScenario =
  | "valid_fix"
  | "syntax_error"
  | "out_of_scope"
  | "no_edits"
  | "timeout"
  | "crash"
  | "auth_required"
  | "custom_patch";

export interface MockAgentOptions {
  scenario?: MockAgentScenario;
  customPatch?: string;
  delayMs?: number;
  errorMessage?: string;
}
