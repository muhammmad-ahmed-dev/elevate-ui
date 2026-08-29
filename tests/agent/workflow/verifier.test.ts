/**
 * Phase 4E: Workflow Verifier Tests
 * Scenarios N, O, P
 */

import { describe, it, expect } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentDirector } from "../../../src/agent/design/director.js";
import { WorkflowVerifier } from "../../../src/agent/workflow/verifier.js";
import type { UserRequest } from "../../../src/agent/design/types.js";
import type { WorkflowOptions } from "../../../src/agent/workflow/types.js";

describe("Phase 4E: Workflow Verifier & Multi-Viewport Perception", () => {
  it("Scenario N & O: starts preview server and verifies multi-viewport perception on created markup", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "elevate-verifier-test-"));

    try {
      const request: UserRequest = {
        prompt: "Make a minimal dark portfolio for a 3D artist",
      };
      const plan = AgentDirector.plan(request);

      // Create component markup file
      const compDir = join(tempDir, "src", "components");
      await mkdir(compDir, { recursive: true });
      const heroCode = `
export default function HeroSection() {
  return (
    <div className="p-8 bg-slate-950 text-white min-h-[400px]">
      <h1 className="text-4xl font-bold">3D Artist Portfolio</h1>
      <p className="text-slate-400 mt-2">Crafting digital worlds and real-time CGI</p>
      <button className="mt-4 px-6 py-3 min-h-[44px] min-w-[44px] bg-blue-600 text-white rounded-lg">
        View Selected Work
      </button>
    </div>
  );
}
`;
      await writeFile(join(compDir, "HeroSection.tsx"), heroCode, "utf8");

      const options: WorkflowOptions = {
        prompt: request.prompt,
        skipVision: true,
      };

      const verification = await WorkflowVerifier.verify(tempDir, plan, options);

      expect(verification.hardGatesPassed).toBe(true);
      expect(verification.viewportsCaptured).toBeGreaterThanOrEqual(3);
      expect(verification.acceptanceCriteriaEvaluations.length).toBeGreaterThan(0);

      // Verify acceptance criteria evaluations
      const viewportAc = verification.acceptanceCriteriaEvaluations.find(
        (e) => e.id === "ac-responsive-viewports"
      );
      expect(viewportAc?.passed).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("Scenario P: detects and categorizes visual findings and acceptance criteria violations", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "elevate-verifier-defect-"));

    try {
      const request: UserRequest = {
        prompt: "Online shop for ceramic mugs",
      };
      const plan = AgentDirector.plan(request);

      // Create component with undersized button
      const compDir = join(tempDir, "src", "components");
      await mkdir(compDir, { recursive: true });
      const defectiveCode = `
export default function ProductCard() {
  return (
    <div className="p-4 bg-white text-black">
      <h2>Handmade Mug</h2>
      <button className="text-[9px] p-0 min-h-0 min-w-0" style={{ width: "20px", height: "20px" }}>
        +
      </button>
    </div>
  );
}
`;
      await writeFile(join(compDir, "ProductCard.tsx"), defectiveCode, "utf8");

      const options: WorkflowOptions = {
        prompt: request.prompt,
        skipVision: true,
      };

      const verification = await WorkflowVerifier.verify(tempDir, plan, options);

      expect(verification.touchTargetFailures).toBeGreaterThanOrEqual(1);
      const touchAc = verification.acceptanceCriteriaEvaluations.find(
        (e) => e.id === "ac-touch-target-size"
      );
      expect(touchAc?.passed).toBe(false);
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
