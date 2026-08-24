/**
 * Phase 4B: MCP Server Factory and Stdio Transport Runner
 */

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { registerMcpTools } from "./tools.js";
import { registerMcpResources } from "./resources.js";
import { McpRunStore } from "./store.js";
import type { McpServerOptions } from "./types.js";

export interface ElevateMcpInstance {
  server: McpServer;
  store: McpRunStore;
}

/**
 * Creates and configures an Elevate MCP server instance with all tools and resources registered.
 */
export function createElevateMcpServer(
  _options: McpServerOptions = {}
): ElevateMcpInstance {
  const server = new McpServer(
    {
      name: "elevate-ui",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: true },
      },
    }
  );

  const store = new McpRunStore();

  registerMcpTools(server, store);
  registerMcpResources(server, store);

  return { server, store };
}

/**
 * Starts the MCP server using standard I/O transport for local AI assistant connections.
 * Automatically routes all console output to stderr to keep stdout strictly JSON-RPC clean.
 */
export async function startStdioServer(
  instance?: ElevateMcpInstance
): Promise<void> {
  // CRITICAL STDIO ISOLATION:
  // Redirect stdout console logging to stderr so JSON-RPC framing is never broken.
  console.log = (...args: any[]) => console.error(...args);
  console.info = (...args: any[]) => console.error(...args);

  const activeInstance = instance || createElevateMcpServer();
  const transport = new StdioServerTransport();

  await activeInstance.server.connect(transport);

  console.error("Elevate MCP server started on stdio transport.");

  process.on("SIGINT", async () => {
    console.error("Shutting down Elevate MCP server (SIGINT)...");
    await activeInstance.server.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.error("Shutting down Elevate MCP server (SIGTERM)...");
    await activeInstance.server.close();
    process.exit(0);
  });
}
