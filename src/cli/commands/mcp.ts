/**
 * Phase 4B: CLI MCP Server Command
 *
 * Runs the Elevate MCP server over standard I/O (stdio).
 */

import { Command } from "commander";
import { startStdioServer } from "../../mcp/server.js";

export function createMcpCommand(): Command {
  return new Command("mcp")
    .description("Starts the Elevate Model Context Protocol (MCP) server over stdio")
    .action(async () => {
      try {
        await startStdioServer();
      } catch (err: any) {
        console.error("Fatal MCP server error:", err);
        process.exit(1);
      }
    });
}
