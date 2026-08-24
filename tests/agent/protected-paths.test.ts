/**
 * Phase 3A Tests — Protected Paths Registry
 *
 * Verifies the protected-path lookup logic against all categories:
 * exact paths, prefix patterns, substring patterns, path-escape attempts.
 */

import { describe, it, expect } from "vitest";
import {
  isProtectedPath,
  mergeProtectedPathConfig,
  DEFAULT_PROTECTED_PATH_CONFIG,
} from "../../src/agent/protected-paths.js";
import { join } from "node:path";

const ROOT = "/project";

describe("isProtectedPath — exact paths", () => {
  it("rejects package.json", () => {
    const result = isProtectedPath(join(ROOT, "package.json"), ROOT);
    expect(result.protected).toBe(true);
    expect(result.reason).toMatch(/package\.json/i);
  });

  it("rejects package-lock.json", () => {
    expect(isProtectedPath(join(ROOT, "package-lock.json"), ROOT).protected).toBe(true);
  });

  it("rejects tsconfig.json", () => {
    expect(isProtectedPath(join(ROOT, "tsconfig.json"), ROOT).protected).toBe(true);
  });

  it("rejects next.config.ts", () => {
    expect(isProtectedPath(join(ROOT, "next.config.ts"), ROOT).protected).toBe(true);
  });

  it("rejects tailwind.config.js", () => {
    expect(isProtectedPath(join(ROOT, "tailwind.config.js"), ROOT).protected).toBe(true);
  });

  it("rejects .gitignore", () => {
    expect(isProtectedPath(join(ROOT, ".gitignore"), ROOT).protected).toBe(true);
  });

  it("allows a normal component file", () => {
    const result = isProtectedPath(join(ROOT, "src/components/Hero.tsx"), ROOT);
    expect(result.protected).toBe(false);
  });
});

describe("isProtectedPath — prefix patterns", () => {
  it("rejects .env file", () => {
    expect(isProtectedPath(join(ROOT, ".env"), ROOT).protected).toBe(true);
  });

  it("rejects .env.local", () => {
    expect(isProtectedPath(join(ROOT, ".env.local"), ROOT).protected).toBe(true);
  });

  it("rejects .env.production", () => {
    expect(isProtectedPath(join(ROOT, ".env.production"), ROOT).protected).toBe(true);
  });

  it("rejects src/app/api/ route", () => {
    expect(
      isProtectedPath(join(ROOT, "src/app/api/users/route.ts"), ROOT).protected
    ).toBe(true);
  });

  it("rejects pages/api/ route", () => {
    expect(
      isProtectedPath(join(ROOT, "pages/api/auth.ts"), ROOT).protected
    ).toBe(true);
  });

  it("rejects .github/ CI config", () => {
    expect(
      isProtectedPath(join(ROOT, ".github/workflows/ci.yml"), ROOT).protected
    ).toBe(true);
  });

  it("rejects prisma/ database schema", () => {
    expect(
      isProtectedPath(join(ROOT, "prisma/schema.prisma"), ROOT).protected
    ).toBe(true);
  });
});

describe("isProtectedPath — substring patterns", () => {
  it("rejects yarn.lock via substring .lock", () => {
    expect(isProtectedPath(join(ROOT, "yarn.lock"), ROOT).protected).toBe(true);
  });

  it("rejects pnpm-lock.yaml", () => {
    expect(isProtectedPath(join(ROOT, "pnpm-lock.yaml"), ROOT).protected).toBe(true);
  });

  it("rejects middleware.ts", () => {
    expect(
      isProtectedPath(join(ROOT, "src/middleware.ts"), ROOT).protected
    ).toBe(true);
  });

  it("rejects server actions file", () => {
    expect(
      isProtectedPath(join(ROOT, "src/app/checkout/actions.ts"), ROOT).protected
    ).toBe(true);
  });

  it("rejects auth.ts by substring auth", () => {
    expect(
      isProtectedPath(join(ROOT, "src/lib/auth.ts"), ROOT).protected
    ).toBe(true);
  });
});

describe("isProtectedPath — path escape / safety", () => {
  it("rejects relative paths (non-absolute)", () => {
    const result = isProtectedPath("src/components/Hero.tsx", ROOT);
    expect(result.protected).toBe(true);
    expect(result.reason).toMatch(/not absolute/i);
  });

  it("rejects paths that escape the project root", () => {
    const result = isProtectedPath("/other-project/src/Hero.tsx", ROOT);
    expect(result.protected).toBe(true);
    expect(result.reason).toMatch(/escapes project root/i);
  });
});

describe("mergeProtectedPathConfig", () => {
  it("adds user exactPaths on top of defaults", () => {
    const merged = mergeProtectedPathConfig({ exactPaths: ["custom-config.json"] });
    expect(merged.exactPaths).toContain("package.json"); // default preserved
    expect(merged.exactPaths).toContain("custom-config.json"); // user addition
  });

  it("adds user prefixPatterns on top of defaults", () => {
    const merged = mergeProtectedPathConfig({ prefixPatterns: ["src/payments/"] });
    expect(merged.prefixPatterns).toContain("src/app/api/"); // default preserved
    expect(merged.prefixPatterns).toContain("src/payments/"); // user addition
  });

  it("defaults are never reduced by user config", () => {
    // Passing an empty user config must preserve all defaults
    const merged = mergeProtectedPathConfig({});
    expect(merged.exactPaths.length).toBeGreaterThanOrEqual(
      DEFAULT_PROTECTED_PATH_CONFIG.exactPaths.length
    );
  });
});
