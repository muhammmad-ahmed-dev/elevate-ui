import { describe, it, expect } from "vitest";
import { createCli } from "../../src/cli/index.js";

describe("Elevate CLI Scaffold", () => {
  it("initializes CLI with standard program name and commands", () => {
    const program = createCli();

    expect(program.name()).toBe("elevate");
    
    const commandNames = program.commands.map((cmd) => cmd.name());
    expect(commandNames).toContain("audit");
    expect(commandNames).toContain("improve");
    expect(commandNames).toContain("verify");
    expect(commandNames).toContain("compare");
    expect(commandNames).toContain("report");
  });

  it("configures audit command with default targetUrl and options", () => {
    const program = createCli();
    const auditCmd = program.commands.find((c) => c.name() === "audit");
    expect(auditCmd).toBeDefined();
    
    const options = auditCmd?.options.map((o) => o.long);
    expect(options).toContain("--screenshots-dir");
  });

  it("configures verify command with gate options", () => {
    const program = createCli();
    const verifyCmd = program.commands.find((c) => c.name() === "verify");
    expect(verifyCmd).toBeDefined();

    const options = verifyCmd?.options.map((o) => o.long);
    expect(options).toContain("--skip-build");
    expect(options).toContain("--typecheck-cmd");
    expect(options).toContain("--build-cmd");
  });

  it("configures improve command with Phase 3F single-pass options", () => {
    const program = createCli();
    const improveCmd = program.commands.find((c) => c.name() === "improve");
    expect(improveCmd).toBeDefined();

    const options = improveCmd?.options.map((o) => o.long);
    expect(options).toContain("--dry-run");
    expect(options).toContain("--auto-approve");
    expect(options).toContain("--vision-provider");
    expect(options).toContain("--patch-provider");
    expect(options).toContain("--max-files");
    expect(options).toContain("--max-lines");
    expect(options).toContain("--max-passes");
  });
});
