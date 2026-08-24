# Model Context Protocol (MCP) Server for Elevate

Elevate exposes its automated visual refinement, layout auditing, mutation generation, and verification capabilities to AI assistants and IDEs via the official [Model Context Protocol (MCP)](https://modelcontextprotocol.io).

---

## 1. Overview

The Elevate MCP server runs locally over standard I/O (`stdio`). It acts as a secure, sandboxed interface layer that delegates all operations to Elevate's authoritative safety architecture:

```
[MCP Client (Claude / Cursor / IDE)]
               │
          (stdio JSON-RPC)
               ▼
     [Elevate MCP Server]
               │
 ┌─────────────┼─────────────┐
 ▼             ▼             ▼
[audit]    [improve]     [report]
               │
        [Improve Engine]
               │
        [PatchValidator]
               │
    [MutationTransaction]
               │
     [VerificationGate]
```

---

## 2. Starting the MCP Server

### CLI Command
```bash
elevate mcp
# or
elevate-ui mcp
```

### Example Client Configuration

#### Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "elevate": {
      "command": "npx",
      "args": ["-y", "elevate-ui", "mcp"]
    }
  }
}
```

#### Cursor IDE / VS Code MCP Extension
```json
{
  "name": "elevate",
  "type": "stdio",
  "command": "node",
  "args": ["./node_modules/elevate-ui/dist/cli/index.js", "mcp"]
}
```

---

## 3. Available Tools

### 1. `audit`
Performs multi-viewport perception (Mobile 375px, Tablet 768px, Desktop 1440px), deterministic layout/accessibility rules, heuristic analysis, and synthesis without modifying any code.
- **Inputs**:
  - `url` *(string, optional)*: Target local dev server URL (default: `http://localhost:3000`).
  - `visionProvider` *(enum: "gemini" | "claude" | "mock", optional)*: Multimodal visual provider.
  - `skipVision` *(boolean, optional)*: Skip multimodal checks and run deterministic rules only.
  - `report` *(boolean, optional)*: Automatically generate visual HTML/JSON report.
  - `reportDir` *(string, optional)*: Custom output directory.
- **Outputs**: Run ID, list of prioritized findings, synthesized mutation recommendations, and viewport metadata.

### 2. `improve`
Executes closed-loop visual feedback and refinement with AST guardrails, scope boundary limits, exact Git transaction rollbacks, and multi-gate verification.
- **Inputs**:
  - `url` *(string, optional)*: Target local dev server URL.
  - `dryRun` *(boolean, default: false)*: Generate and validate patch without applying mutations to disk.
  - `autoApprove` *(boolean, default: false)*: Allow autonomous mutation without interactive prompt.
  - `maxPasses` *(number 1-10, default: 1)*: Maximum passes to execute.
  - `patchProvider` *(enum: "claude" | "gemini" | "mock", optional)*: Patch generation LLM.
  - `maxFiles` *(number 1-5, default: 2)*: Max files allowed to touch in a single patch.
  - `maxLines` *(number 1-500, default: 150)*: Max line changes allowed in a single patch.
  - `timeoutMs` *(number 1000-300000, default: 60000)*: Execution timeout in milliseconds.
  - `report` *(boolean, default: false)*: Generate report after execution.
- **Approval Safety Model**:
  - If `dryRun: false` and `autoApprove: false`, the tool executes in dry-run mode and returns `status: "APPROVAL_REQUIRED"` along with the unified diff and recommendation details. It **never** mutates files without explicit client approval.
  - Re-calling `improve` with `autoApprove: true` authorizes mutation execution.

### 3. `verify`
Read-only layout and accessibility health check against target URL.
- **Inputs**: `url`, `typecheckCmd`, `buildCmd`, `skipBuild`, `timeoutMs`.
- **Outputs**: Health status, critical findings count, detailed findings list.

### 4. `compare`
Compares baseline vs final findings, regressions, and outcomes from a previous run or existing `report.json`.
- **Inputs**: `reportJsonPath` *(string, optional)*, `runId` *(string, optional)*.
- **Outputs**: Executive summary, resolved count, new regressions, before/after metrics.

### 5. `report`
Renders standalone visual diff HTML report and structured JSON report from existing results.
- **Inputs**: `reportJsonPath` *(string)*, `outputDir` *(string)*, `embedImages` *(boolean)*.
- **Outputs**: Paths to `summary.html`, `report.json`, and asset directory.

---

## 4. Available Resources

- `elevate://runs/latest`: Structured JSON of the most recent audit or improve run.
- `elevate://runs/{runId}`: Structured JSON for a specific run ID.
- `elevate://reports/{reportId}`: Machine-readable `ReportModel` JSON.
- `elevate://reports/{reportId}/html`: Self-contained visual diff HTML document.

---

## 5. Security & Isolation Guarantees

1. **Path Traversal Sandboxing**: All user-provided paths (`reportJsonPath`, `reportDir`, `outputDir`) are validated and canonicalized against the project root. Any attempt to traverse (`..`) or reference outside files throws a security violation (`BLOCKED`).
2. **Secret Redaction**: All tool results, diffs, gate outputs, and resource streams are scrubbed for API keys (`AIza...`, `sk-ant-...`, `sk-...`, `api_key=...`).
3. **Stdio Protocol Cleanliness**: All internal `console.log` and `console.info` output is routed to `stderr`. `stdout` is reserved strictly for JSON-RPC MCP protocol messages.
4. **No Direct Filesystem Mutation**: The MCP layer contains zero direct disk-write logic. All changes are delegated through `MutationTransactionRunner` with exact git restore rollbacks on failure.
