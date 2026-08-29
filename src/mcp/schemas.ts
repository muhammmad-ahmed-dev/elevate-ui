/**
 * Phase 4B: MCP Tool Input Schemas (Zod)
 *
 * Enforces strict, bounded input validation for all Elevate MCP tools.
 */

import { z } from "zod";

export const AuditInputSchema = z.object({
  url: z
    .string()
    .url()
    .optional()
    .describe("Target local dev server URL (e.g. http://localhost:3000)"),
  visionProvider: z
    .enum(["gemini", "claude", "mock"])
    .optional()
    .describe("Multimodal vision analysis provider"),
  visionModel: z.string().optional().describe("Vision model name"),
  skipVision: z
    .boolean()
    .optional()
    .default(false)
    .describe("Skip multimodal visual heuristic checks and run deterministic audit only"),
  report: z
    .boolean()
    .optional()
    .default(false)
    .describe("Automatically generate visual diff HTML and JSON report"),
  reportDir: z
    .string()
    .optional()
    .describe("Directory to save generated report artifacts"),
  screenshotsDir: z
    .string()
    .optional()
    .describe("Directory to save perception screenshots"),
});

export type AuditInput = z.infer<typeof AuditInputSchema>;

export const ImproveInputSchema = z.object({
  url: z
    .string()
    .url()
    .optional()
    .describe("Target local dev server URL (e.g. http://localhost:3000)"),
  dryRun: z
    .boolean()
    .optional()
    .default(false)
    .describe("Generate and validate patch without applying mutations to disk"),
  autoApprove: z
    .boolean()
    .optional()
    .default(false)
    .describe("Skip interactive human approval and proceed with mutation automatically"),
  maxPasses: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(1)
    .describe("Maximum number of improvement passes to execute (1-10)"),
  visionProvider: z
    .enum(["gemini", "claude", "mock"])
    .optional()
    .describe("Multimodal visual evaluation provider"),
  visionModel: z.string().optional().describe("Vision model name"),
  skipVision: z
    .boolean()
    .optional()
    .default(false)
    .describe("Skip multimodal visual analysis"),
  patchProvider: z
    .enum(["claude", "gemini", "mock"])
    .optional()
    .describe("Patch generation LLM provider"),
  patchModel: z.string().optional().describe("Patch generation model name"),
  maxFiles: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .default(2)
    .describe("Maximum files allowed to touch in a single patch (1-5)"),
  maxLines: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .default(150)
    .describe("Maximum lines allowed to modify in a single patch (1-500)"),
  timeoutMs: z
    .number()
    .int()
    .min(1000)
    .max(300000)
    .optional()
    .default(60000)
    .describe("External provider timeout in milliseconds (1000-300000)"),
  report: z
    .boolean()
    .optional()
    .default(false)
    .describe("Automatically generate HTML and JSON report"),
  reportDir: z
    .string()
    .optional()
    .describe("Directory for report output"),
  devServerCmd: z
    .string()
    .optional()
    .describe("Optional command to start target dev server"),
  typecheckCmd: z
    .string()
    .optional()
    .describe("Optional command to run TypeScript verification"),
  buildCmd: z
    .string()
    .optional()
    .describe("Optional command to run build verification"),
});

export type ImproveInput = z.infer<typeof ImproveInputSchema>;

export const VerifyInputSchema = z.object({
  url: z
    .string()
    .url()
    .optional()
    .describe("Target local dev server URL"),
  typecheckCmd: z
    .string()
    .optional()
    .describe("Optional command to run TypeScript verification"),
  buildCmd: z
    .string()
    .optional()
    .describe("Optional command to run framework build verification"),
  skipBuild: z
    .boolean()
    .optional()
    .default(false)
    .describe("Skip framework build gate"),
  timeoutMs: z
    .number()
    .int()
    .min(1000)
    .max(300000)
    .optional()
    .default(60000)
    .describe("Timeout in milliseconds"),
  report: z
    .boolean()
    .optional()
    .default(false)
    .describe("Generate verification report"),
  reportDir: z
    .string()
    .optional()
    .describe("Directory for report output"),
});

export type VerifyInput = z.infer<typeof VerifyInputSchema>;

export const CompareInputSchema = z.object({
  reportJsonPath: z
    .string()
    .optional()
    .describe("Path to report.json file to compare"),
  runId: z
    .string()
    .optional()
    .describe("Run ID of a previously executed run in the current session"),
});

export type CompareInput = z.infer<typeof CompareInputSchema>;

export const ReportInputSchema = z.object({
  reportJsonPath: z
    .string()
    .optional()
    .default("./elevate-report/report.json")
    .describe("Path to report.json file"),
  outputDir: z
    .string()
    .optional()
    .default("./elevate-report")
    .describe("Output directory for HTML report"),
  embedImages: z
    .boolean()
    .optional()
    .default(false)
    .describe("Embed screenshots directly as base64 in HTML"),
});

export type ReportInput = z.infer<typeof ReportInputSchema>;

export const PlanDesignInputSchema = z.object({
  prompt: z
    .string()
    .optional()
    .describe("User request or design description (e.g. 'Make a dark portfolio for a 3D artist')"),
  references: z
    .array(z.string())
    .optional()
    .describe("Optional paths or URLs to reference screenshots"),
  url: z
    .string()
    .url()
    .optional()
    .describe("Optional live URL of an existing website to analyze or improve"),
  dir: z
    .string()
    .optional()
    .describe("Optional path to an existing repository directory"),
  mode: z
    .enum(["BUILD_FROM_SCRATCH", "REFERENCE_DRIVEN", "EXISTING_SITE", "HYBRID"])
    .optional()
    .describe("Explicit planning mode override"),
});

export type PlanDesignInput = z.infer<typeof PlanDesignInputSchema>;

export const BuildDesignInputSchema = z.object({
  prompt: z
    .string()
    .optional()
    .describe("User goal or design description (e.g. 'Make me a portfolio website')"),
  references: z
    .array(z.string())
    .optional()
    .describe("Optional paths or URLs to reference screenshots"),
  url: z
    .string()
    .url()
    .optional()
    .describe("Optional live URL of an existing website to analyze or improve"),
  dir: z
    .string()
    .optional()
    .describe("Optional path to an existing repository directory"),
  workspace: z
    .string()
    .optional()
    .describe("Destination workspace root directory"),
  mode: z
    .enum(["BUILD_FROM_SCRATCH", "REFERENCE_DRIVEN", "EXISTING_SITE", "HYBRID"])
    .optional()
    .describe("Explicit workflow mode override"),
  agent: z
    .enum(["antigravity", "mock"])
    .optional()
    .default("antigravity")
    .describe("Coding agent adapter to execute the task"),
  model: z
    .string()
    .optional()
    .describe("Model identifier for coding agent (default: 'gemini-3.7-flash-high')"),
  autoApprove: z
    .boolean()
    .optional()
    .default(false)
    .describe("Auto-approve coding agent execution without interactive terminal prompt"),
  dryRun: z
    .boolean()
    .optional()
    .default(false)
    .describe("Generate design plan and agent task context without launching agent or mutating files"),
  timeoutMs: z
    .number()
    .int()
    .min(1000)
    .optional()
    .describe("Timeout in milliseconds"),
});

export type BuildDesignInput = z.infer<typeof BuildDesignInputSchema>;
