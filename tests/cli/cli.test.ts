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
});
