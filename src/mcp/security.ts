/**
 * Phase 4B: MCP Security & Sandboxing Utilities
 *
 * Enforces strict path traversal prevention and secret sanitization
 * across all MCP tool inputs, outputs, and resource streams.
 */

import { resolve, normalize, relative, isAbsolute } from "node:path";
import { sanitizeReportText } from "../reports/builder.js";

/**
 * Validates and canonicalizes a path, ensuring it stays strictly within the allowed base directory.
 * Throws an error if path traversal or escape is detected.
 */
export function assertWithinAllowedDirectory(
  targetPath: string,
  baseDir = process.cwd()
): string {
  if (!targetPath || typeof targetPath !== "string") {
    throw new Error("Invalid target path provided.");
  }

  const canonicalBase = resolve(baseDir);
  const resolvedTarget = resolve(canonicalBase, normalize(targetPath));

  const rel = relative(canonicalBase, resolvedTarget);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(
      `Security violation: Path '${targetPath}' escapes the allowed workspace boundary ('${canonicalBase}').`
    );
  }

  return resolvedTarget;
}

/**
 * Recursively sanitizes data structures to redact API keys and secrets.
 */
export function sanitizeMcpOutput<T>(data: T): T {
  if (typeof data === "string") {
    return sanitizeReportText(data) as unknown as T;
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeMcpOutput(item)) as unknown as T;
  }
  if (data !== null && typeof data === "object") {
    const cleanObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      cleanObj[key] = sanitizeMcpOutput(value);
    }
    return cleanObj as T;
  }
  return data;
}
