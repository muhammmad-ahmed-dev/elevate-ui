/**
 * Phase 4B: MCP Security & Sandboxing Unit Tests
 */

import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { assertWithinAllowedDirectory, sanitizeMcpOutput } from "../../src/mcp/security.js";

describe("Phase 4B: MCP Security & Sandboxing", () => {
  it("allows paths strictly inside the base directory", () => {
    const baseDir = resolve("/workspace/project");
    const allowed = assertWithinAllowedDirectory("subfolder/report.json", baseDir);
    expect(allowed).toBe(resolve(baseDir, "subfolder/report.json"));
  });

  it("rejects path traversal attempts with ..", () => {
    const baseDir = resolve("/workspace/project");
    expect(() => assertWithinAllowedDirectory("../secret.env", baseDir)).toThrow(
      /Security violation/
    );
    expect(() => assertWithinAllowedDirectory("sub/../../etc/passwd", baseDir)).toThrow(
      /Security violation/
    );
  });

  it("rejects absolute paths outside the base directory", () => {
    const baseDir = resolve("/workspace/project");
    expect(() => assertWithinAllowedDirectory("/etc/shadow", baseDir)).toThrow(
      /Security violation/
    );
  });

  it("deeply sanitizes secrets across objects and arrays", () => {
    const dirtyData = {
      apiKey: "AIzaSyD-123456789012345678901234567890",
      nested: {
        token: "sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890",
        clean: "normal text",
        list: ["sk-123456789012345678901234567890", "ok item"],
      },
    };

    const cleanData = sanitizeMcpOutput(dirtyData);

    expect(cleanData.apiKey).toBe("[REDACTED_SECRET]");
    expect(cleanData.nested.token).toBe("[REDACTED_SECRET]");
    expect(cleanData.nested.clean).toBe("normal text");
    expect(cleanData.nested.list[0]).toBe("[REDACTED_SECRET]");
    expect(cleanData.nested.list[1]).toBe("ok item");
  });
});
