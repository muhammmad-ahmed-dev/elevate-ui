/**
 * Phase 4C: Benchmark Provisioner Unit Tests
 */

import { describe, it, expect } from "vitest";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { provisionBenchmarkRepository } from "../../src/benchmark/fixtures/provisioner.js";
import { getBenchmarkCaseById } from "../../src/benchmark/fixtures/catalogue.js";
import { GitManager } from "../../src/safety/git.js";

describe("Phase 4C: Benchmark Disposable Provisioner", () => {
  it("provisions an isolated disposable git repository with initial commit", async () => {
    const benchCase = getBenchmarkCaseById("bench-accessibility-01");
    expect(benchCase).toBeDefined();

    const provisioned = await provisionBenchmarkRepository(benchCase!);

    try {
      // Check project files exist
      const pkgJsonStat = await stat(join(provisioned.projectRoot, "package.json"));
      expect(pkgJsonStat.isFile()).toBe(true);

      const compStat = await stat(join(provisioned.projectRoot, benchCase!.componentPath));
      expect(compStat.isFile()).toBe(true);

      // Verify git baseline is clean
      const git = new GitManager(provisioned.projectRoot);
      const status = await git.getStatus();
      expect(status.isRepo).toBe(true);
      expect(status.isClean).toBe(true);
    } finally {
      await provisioned.cleanup();
    }

    // Verify cleanup deleted the directory
    await expect(stat(provisioned.projectRoot)).rejects.toThrow();
  });
});
