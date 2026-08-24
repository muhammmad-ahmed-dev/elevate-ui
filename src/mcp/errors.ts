/**
 * Phase 4B: MCP Error & Response Mapping
 */

import type { McpExecutionStatus, McpToolResponse } from "./types.js";
import { sanitizeMcpOutput } from "./security.js";

export class McpError extends Error {
  constructor(
    public readonly status: McpExecutionStatus,
    message: string,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = "McpError";
  }
}

export function formatMcpSuccess(
  status: McpExecutionStatus,
  summary: string,
  extra: Partial<McpToolResponse> = {}
): { content: Array<{ type: "text"; text: string }> } {
  const response: McpToolResponse = sanitizeMcpOutput({
    status,
    summary,
    ...extra,
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(response, null, 2),
      },
    ],
  };
}

export function formatMcpError(
  err: any,
  fallbackStatus: McpExecutionStatus = "ERROR"
): { content: Array<{ type: "text"; text: string }>; isError: true } {
  let status: McpExecutionStatus = fallbackStatus;
  let message = "An unexpected error occurred.";
  let details: Record<string, any> | undefined;

  if (err instanceof McpError) {
    status = err.status;
    message = err.message;
    details = err.details;
  } else if (err instanceof Error) {
    message = err.message;
    if (message.includes("Security violation") || message.includes("escapes")) {
      status = "BLOCKED";
    }
  } else if (typeof err === "string") {
    message = err;
  }

  const response: McpToolResponse = sanitizeMcpOutput({
    status,
    summary: message,
    details,
    error: message,
  });

  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(response, null, 2),
      },
    ],
  };
}
