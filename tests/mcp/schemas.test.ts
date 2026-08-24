/**
 * Phase 4B: MCP Schemas Unit Tests
 */

import { describe, it, expect } from "vitest";
import {
  AuditInputSchema,
  ImproveInputSchema,
  VerifyInputSchema,
  CompareInputSchema,
  ReportInputSchema,
} from "../../src/mcp/schemas.js";

describe("Phase 4B: MCP Input Schemas Validation", () => {
  describe("AuditInputSchema", () => {
    it("accepts valid parameters and assigns defaults", () => {
      const parsed = AuditInputSchema.parse({});
      expect(parsed.skipVision).toBe(false);
      expect(parsed.report).toBe(false);
    });

    it("accepts valid URL and options", () => {
      const parsed = AuditInputSchema.parse({
        url: "http://localhost:3000",
        visionProvider: "gemini",
        skipVision: true,
        report: true,
        reportDir: "./my-report",
      });
      expect(parsed.url).toBe("http://localhost:3000");
      expect(parsed.visionProvider).toBe("gemini");
    });

    it("rejects invalid URL", () => {
      expect(() => AuditInputSchema.parse({ url: "not-a-url" })).toThrow();
    });
  });

  describe("ImproveInputSchema", () => {
    it("enforces strict boundaries on numeric arguments", () => {
      const valid = ImproveInputSchema.parse({
        maxPasses: 5,
        maxFiles: 3,
        maxLines: 200,
        timeoutMs: 30000,
      });
      expect(valid.maxPasses).toBe(5);
      expect(valid.maxFiles).toBe(3);
      expect(valid.maxLines).toBe(200);

      // maxPasses > 10 should fail
      expect(() => ImproveInputSchema.parse({ maxPasses: 11 })).toThrow();
      // maxPasses < 1 should fail
      expect(() => ImproveInputSchema.parse({ maxPasses: 0 })).toThrow();

      // maxFiles > 5 should fail
      expect(() => ImproveInputSchema.parse({ maxFiles: 10 })).toThrow();

      // maxLines > 500 should fail
      expect(() => ImproveInputSchema.parse({ maxLines: 1000 })).toThrow();

      // timeoutMs < 1000 should fail
      expect(() => ImproveInputSchema.parse({ timeoutMs: 500 })).toThrow();
    });

    it("defaults autoApprove and dryRun to false", () => {
      const parsed = ImproveInputSchema.parse({});
      expect(parsed.autoApprove).toBe(false);
      expect(parsed.dryRun).toBe(false);
      expect(parsed.maxPasses).toBe(1);
    });
  });

  describe("VerifyInputSchema", () => {
    it("parses valid verify options", () => {
      const parsed = VerifyInputSchema.parse({
        url: "http://localhost:4000",
        skipBuild: true,
      });
      expect(parsed.url).toBe("http://localhost:4000");
      expect(parsed.skipBuild).toBe(true);
    });
  });

  describe("CompareInputSchema", () => {
    it("accepts reportJsonPath or runId", () => {
      const parsed1 = CompareInputSchema.parse({ runId: "run-123" });
      expect(parsed1.runId).toBe("run-123");

      const parsed2 = CompareInputSchema.parse({ reportJsonPath: "./report.json" });
      expect(parsed2.reportJsonPath).toBe("./report.json");
    });
  });

  describe("ReportInputSchema", () => {
    it("assigns standard defaults for report generation", () => {
      const parsed = ReportInputSchema.parse({});
      expect(parsed.reportJsonPath).toBe("./elevate-report/report.json");
      expect(parsed.outputDir).toBe("./elevate-report");
      expect(parsed.embedImages).toBe(false);
    });
  });
});
