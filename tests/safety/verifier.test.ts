import { describe, it, expect } from "vitest";
import { SafetyVerifier } from "../../src/safety/verifier.js";

describe("SafetyVerifier", () => {
  it("passes when commands exit with code 0", async () => {
    const verifier = new SafetyVerifier({
      typecheckCmd: "node -e \"process.exit(0)\"",
      buildCmd: "node -e \"process.exit(0)\"",
    });

    const result = await verifier.verify();
    expect(result.passed).toBe(true);
    expect(result.typecheckPassed).toBe(true);
    expect(result.buildPassed).toBe(true);
    expect(result.gates.length).toBe(2);
    expect(result.errors.length).toBe(0);
  });

  it("fails verification when typecheck exits with non-zero code", async () => {
    const verifier = new SafetyVerifier({
      typecheckCmd: "node -e \"console.error('Syntax error'); process.exit(1)\"",
      buildCmd: "node -e \"process.exit(0)\"",
    });

    const result = await verifier.verify();
    expect(result.passed).toBe(false);
    expect(result.typecheckPassed).toBe(false);
    expect(result.buildPassed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("skips framework build when skipBuild is true", async () => {
    const verifier = new SafetyVerifier({
      typecheckCmd: "node -e \"process.exit(0)\"",
      skipBuild: true,
    });

    const result = await verifier.verify();
    expect(result.passed).toBe(true);
    expect(result.typecheckPassed).toBe(true);
    expect(result.buildPassed).toBe(true);
    expect(result.gates.length).toBe(1);
    expect(result.gates[0].name).toBe("Typecheck");
  });

  it("fails when framework build fails", async () => {
    const verifier = new SafetyVerifier({
      typecheckCmd: "node -e \"process.exit(0)\"",
      buildCmd: "node -e \"console.error('Build failure'); process.exit(1)\"",
      skipBuild: false,
    });

    const result = await verifier.verify();
    expect(result.passed).toBe(false);
    expect(result.typecheckPassed).toBe(true);
    expect(result.buildPassed).toBe(false);
    expect(result.errors.some((e) => e.includes("Framework build failed"))).toBe(true);
  });
});
