#!/usr/bin/env node
import { Command } from "commander";
import { createAuditCommand } from "./commands/audit.js";
import { createImproveCommand } from "./commands/improve.js";
import { createVerifyCommand } from "./commands/verify.js";
import { createCompareCommand } from "./commands/compare.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("elevate")
    .description("Elevate: Web Design Refinement Engine for Next.js & Tailwind CSS")
    .version("0.1.0");

  program.addCommand(createAuditCommand());
  program.addCommand(createImproveCommand());
  program.addCommand(createVerifyCommand());
  program.addCommand(createCompareCommand());

  return program;
}

// Auto-run if executed directly as entrypoint
const normalizedArgv1 = process.argv[1]?.replace(/\\/g, "/") || "";
if (
  normalizedArgv1.endsWith("cli/index.js") ||
  normalizedArgv1.endsWith("cli/index.ts") ||
  normalizedArgv1.endsWith("elevate") ||
  normalizedArgv1.endsWith("elevate-ui")
) {
  const program = createCli();
  program.parseAsync(process.argv).catch((err) => {
    console.error("Elevate CLI encountered an unexpected error:", err);
    process.exit(1);
  });
}
