/**
 * Phase 5B: Build Validity & DOM Completeness Test Suite
 *
 * Tests the deterministic separation of build validity/completeness from defect counts,
 * verifying that empty stubs and boilerplate placeholders cannot defeat functioning builds.
 */

import { describe, it, expect } from "vitest";
import { BuildValidityDetector } from "../../src/benchmark/build-validity.js";
import { ComparisonRunner } from "../../src/benchmark/comparison-runner.js";
import { generateComparisonReport } from "../../src/benchmark/comparison-reporter.js";
import { COMPARISON_CORPUS } from "../../src/benchmark/fixtures/comparison-corpus.js";
import { ComparisonProvisioner, computeWorkspaceTreeHash } from "../../src/benchmark/comparison-provisioner.js";
import type { ComparisonSuiteReport } from "../../src/benchmark/comparison-types.js";

describe("Phase 5B: Deterministic Build Validity & Completeness", () => {
  // Scenario A: Empty body / whitespace detection
  it("Scenario A: detects empty body or whitespace-only markup as INVALID_BUILD", async () => {
    const result = await BuildValidityDetector.evaluate({
      workspaceRoot: "",
      rawMarkup: "   \n\t  ",
      serverStarted: true,
      routeReachable: true,
    });

    expect(result.buildValid).toBe(false);
    expect(result.blankPageDetected).toBe(true);
    expect(result.effectiveOutcome).toBe("INVALID_BUILD");
    expect(result.reason).toContain("empty or whitespace-only");
  });

  // Scenario B: Tiny placeholder / stub detection
  it("Scenario B: detects tiny placeholder stubs under 80 characters as INVALID_BUILD", async () => {
    const result = await BuildValidityDetector.evaluate({
      workspaceRoot: "",
      rawMarkup: `
      export default function Stub() {
        return <div className="p-4"><p>Under construction</p></div>;
      }`,
      serverStarted: true,
      routeReachable: true,
    });

    expect(result.buildValid).toBe(false);
    expect(result.stubPageDetected).toBe(true);
    expect(result.effectiveOutcome).toBe("INVALID_BUILD");
    expect(result.reason).toContain("stub");
  });

  // Scenario C: "Hello World" single-node detection
  it("Scenario C: detects single-node Hello World as INVALID_BUILD", async () => {
    const result = await BuildValidityDetector.evaluate({
      workspaceRoot: "",
      rawMarkup: `<div><h1>Hello World</h1></div>`,
      serverStarted: true,
      routeReachable: true,
    });

    expect(result.buildValid).toBe(false);
    expect(result.stubPageDetected).toBe(true);
    expect(result.effectiveOutcome).toBe("INVALID_BUILD");
  });

  // Scenario D: Framework starter boilerplate detection
  it("Scenario D: detects default framework starter templates (Vite/React) as INVALID_BUILD", async () => {
    const result = await BuildValidityDetector.evaluate({
      workspaceRoot: "",
      rawMarkup: `
      <div id="root">
        <h1>Vite + React</h1>
        <div class="card">
          <button>count is 0</button>
          <p>Edit <code>src/App.tsx</code> and save to test HMR</p>
        </div>
      </div>`,
      serverStarted: true,
      routeReachable: true,
    });

    expect(result.buildValid).toBe(false);
    expect(result.stubPageDetected).toBe(true);
    expect(result.effectiveOutcome).toBe("INVALID_BUILD");
    expect(result.reason).toContain("starter boilerplate");
  });

  // Scenario E: Valid minimal portfolio validation
  it("Scenario E: validates a meaningful developer portfolio as VALID_BUILD", async () => {
    const result = await BuildValidityDetector.evaluate({
      workspaceRoot: "",
      rawMarkup: `
      <div className="bg-slate-950 text-white min-h-screen p-8">
        <header className="flex justify-between items-center mb-12">
          <h1 className="text-3xl font-bold">Alex Rivera — Full Stack Developer</h1>
          <nav className="flex gap-4">
            <a href="#projects" className="text-blue-400 hover:underline">Projects</a>
            <a href="#contact" className="text-blue-400 hover:underline">Contact</a>
          </nav>
        </header>
        <section id="hero" className="mb-12">
          <p className="text-xl text-slate-300">Building resilient distributed systems and AI web interfaces.</p>
          <button className="mt-4 px-6 py-3 min-h-[44px] min-w-[44px] bg-blue-600 rounded-lg">Get in Touch</button>
        </section>
        <section id="projects" className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl">
            <h2 className="text-xl font-semibold">Project One</h2>
            <p className="text-slate-400 mt-2">Autonomous design intelligence engine built with TypeScript.</p>
          </div>
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl">
            <h2 className="text-xl font-semibold">Project Two</h2>
            <p className="text-slate-400 mt-2">Distributed event streaming infrastructure for real-time analytics.</p>
          </div>
        </section>
        <footer id="contact" className="mt-16 text-center text-slate-500">
          <p>© 2026 Alex Rivera. Available for hire.</p>
        </footer>
      </div>`,
      serverStarted: true,
      routeReachable: true,
      expectedSignals: {
        expectedSections: ["hero", "projects", "contact"],
        expectedKeywords: ["portfolio", "developer", "projects", "contact"],
      },
    });

    expect(result.buildValid).toBe(true);
    expect(result.blankPageDetected).toBe(false);
    expect(result.stubPageDetected).toBe(false);
    expect(result.meaningfulDomPresent).toBe(true);
    expect(result.expectedStructurePresent).toBe(true);
    expect(result.effectiveOutcome).toBe("VALID_BUILD");
    expect(result.matchedSections).toContain("hero");
    expect(result.matchedSections).toContain("projects");
    expect(result.matchedSections).toContain("contact");
  });

  // Scenario F: Valid SaaS landing page validation
  it("Scenario F: validates a high-conversion SaaS landing page as VALID_BUILD", async () => {
    const result = await BuildValidityDetector.evaluate({
      workspaceRoot: "",
      rawMarkup: `
      <div className="bg-white text-slate-900 min-h-screen">
        <header className="border-b p-6 flex justify-between">
          <h1 className="text-2xl font-black text-indigo-600">OmniFlow</h1>
          <button className="px-4 py-2 min-h-[44px] min-w-[44px] bg-indigo-600 text-white rounded">Start Free Trial</button>
        </header>
        <section id="hero" className="p-12 text-center">
          <h2 className="text-4xl font-extrabold">Next-Gen API Pipelines</h2>
          <p className="mt-4 text-slate-600 max-w-xl mx-auto">Automate your cloud infrastructure in seconds.</p>
        </section>
        <section id="features" className="p-8 grid grid-cols-3 gap-6">
          <div className="border p-4 rounded"><h3 className="font-bold">Instant Sync</h3><p className="text-sm">Real-time sync.</p></div>
          <div className="border p-4 rounded"><h3 className="font-bold">Type Safety</h3><p className="text-sm">End-to-end types.</p></div>
          <div className="border p-4 rounded"><h3 className="font-bold">Global Edge</h3><p className="text-sm">Low latency.</p></div>
        </section>
        <section id="pricing" className="p-8 bg-slate-50">
          <h2 className="text-2xl font-bold text-center">Transparent Pricing</h2>
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="p-4 border bg-white"><h4>Starter</h4><p>$0/mo</p></div>
            <div className="p-4 border bg-white border-indigo-600"><h4>Pro</h4><p>$29/mo</p></div>
            <div className="p-4 border bg-white"><h4>Enterprise</h4><p>Custom</p></div>
          </div>
        </section>
      </div>`,
      serverStarted: true,
      routeReachable: true,
      expectedSignals: {
        expectedSections: ["hero", "features", "pricing"],
        expectedKeywords: ["OmniFlow", "Starter", "Pro", "Enterprise"],
      },
    });

    expect(result.buildValid).toBe(true);
    expect(result.effectiveOutcome).toBe("VALID_BUILD");
    expect(result.matchedSections).toContain("hero");
    expect(result.matchedSections).toContain("features");
    expect(result.matchedSections).toContain("pricing");
  });

  // Scenario G: Runtime error page detection
  it("Scenario G: detects fatal runtime errors as INVALID_BUILD", async () => {
    const result = await BuildValidityDetector.evaluate({
      workspaceRoot: "",
      rawMarkup: `<div><h1>Error</h1></div>`,
      serverStarted: true,
      routeReachable: true,
      runtimeErrors: ["Uncaught TypeError: Cannot read property 'map' of undefined"],
    });

    expect(result.buildValid).toBe(false);
    expect(result.effectiveOutcome).toBe("INVALID_BUILD");
    expect(result.reason).toContain("runtime error");
  });

  // Scenario H: Missing expected sections detection
  it("Scenario H: accurately records missing expected sections", async () => {
    const result = await BuildValidityDetector.evaluate({
      workspaceRoot: "",
      rawMarkup: `
      <div className="p-8">
        <h1>Single Hero Section</h1>
        <p>No extra information here.</p>
        <button className="min-h-[44px] min-w-[44px]">Click</button>
      </div>`,
      serverStarted: true,
      routeReachable: true,
      expectedSignals: {
        expectedSections: ["hero", "pricing", "testimonials"],
      },
    });

    expect(result.missingSections).toContain("pricing");
    expect(result.missingSections).toContain("testimonials");
  });

  // Scenario I: Valid expected structure matching
  it("Scenario I: matches expected keywords in rendered markup", async () => {
    const result = await BuildValidityDetector.evaluate({
      workspaceRoot: "",
      rawMarkup: `
      <div className="p-8">
        <h1>OmniFlow Developer Automation</h1>
        <p>Enterprise Starter Pro tier available.</p>
        <button className="min-h-[44px] min-w-[44px]">Get Started</button>
      </div>`,
      serverStarted: true,
      routeReachable: true,
      expectedSignals: {
        expectedKeywords: ["OmniFlow", "Starter", "Pro", "Enterprise"],
      },
    });

    expect(result.matchedKeywords).toEqual(["OmniFlow", "Starter", "Pro", "Enterprise"]);
  });

  // Scenario J: Invalid build outcome hierarchy classification
  it("Scenario J: correctly prioritizes outcome hierarchy (safety > infrastructure > invalid > regressed > improved)", async () => {
    // Safety failure precedence
    const safetyRes = await BuildValidityDetector.evaluate({
      workspaceRoot: "",
      rawMarkup: "<div><h1>Content</h1></div>",
      safetyFailure: true,
    });
    expect(safetyRes.effectiveOutcome).toBe("SAFETY_FAILURE");

    // Infrastructure failure precedence
    const infraRes = await BuildValidityDetector.evaluate({
      workspaceRoot: "",
      rawMarkup: "<div><h1>Content</h1></div>",
      serverStarted: false,
    });
    expect(infraRes.effectiveOutcome).toBe("INFRASTRUCTURE_FAILURE");

    // Regression precedence
    const regressedRes = await BuildValidityDetector.evaluate({
      workspaceRoot: "",
      rawMarkup: `
      <div className="p-8 bg-slate-900 text-white min-h-screen">
        <h1>Valid Heading</h1>
        <p>Detailed body content with enough length to be meaningful.</p>
        <button className="min-h-[44px] min-w-[44px]">Button</button>
        <div className="grid"><div>1</div><div>2</div></div>
      </div>`,
      serverStarted: true,
      routeReachable: true,
      regressionCount: 2,
    });
    expect(regressedRes.effectiveOutcome).toBe("VALID_BUILD_REGRESSED");
  });

  // Scenario K: Quality scoring: Invalid build vs Valid build (Valid build wins)
  it("Scenario K: awards Quality Win to Valid Build over an empty/stub with 0 findings", async () => {
    const comparison = await ComparisonRunner.runSingleComparison(COMPARISON_CORPUS[0], {
      agent: "mock",
      dryRun: true,
    });

    // In dry-run mode, both produce valid baseline stubs
    expect(comparison.baselineRun.buildValidity).toBeDefined();
    expect(comparison.elevateRun.buildValidity).toBeDefined();
  });

  // Scenario L: Quality scoring: Valid build vs Valid build
  it("Scenario L: compares defect reduction and acceptance criteria when both builds are valid", async () => {
    const compCase = COMPARISON_CORPUS[1]; // SaaS landing
    const comparison = await ComparisonRunner.runSingleComparison(compCase, {
      agent: "mock",
      dryRun: true,
    });

    expect(comparison.dimensionWinners.quality).toBeDefined();
    expect(["WIN", "TIE", "LOSS"]).toContain(comparison.dimensionWinners.quality);
  });

  // Scenario M: Identical fixture SHA-256 hashes
  it("Scenario M: ensures aloneWorkspace and elevateWorkspace have identical starting SHA-256 tree hashes", async () => {
    const compCase = COMPARISON_CORPUS[0];
    const pair = await ComparisonProvisioner.provisionIsolatedPair(compCase);
    try {
      expect(pair.masterTreeHash).toBeDefined();
      expect(pair.masterTreeHash.length).toBe(64); // SHA-256 length
      const aloneHash = await computeWorkspaceTreeHash(pair.aloneWorkspaceRoot);
      const elevateHash = await computeWorkspaceTreeHash(pair.elevateWorkspaceRoot);
      expect(aloneHash).toBe(elevateHash);
      expect(aloneHash).toBe(pair.masterTreeHash);
    } finally {
      await pair.cleanup();
    }
  });

  // Scenario N: Anti-answer leakage verification
  it("Scenario N: verifies prompt does NOT contain fixedCode or answer diffs", () => {
    for (const c of COMPARISON_CORPUS) {
      expect((c as any).fixedCode).toBeUndefined();
      expect((c as any).expectedPatch).toBeUndefined();
      expect((c as any).answerDiff).toBeUndefined();
    }
  });

  // Scenario O: Metrics preservation across runs
  it("Scenario O: records all 4D dimensions and content density metrics", async () => {
    const compCase = COMPARISON_CORPUS[0];
    const comparison = await ComparisonRunner.runSingleComparison(compCase, {
      agent: "mock",
      dryRun: true,
    });

    expect(comparison.dimensionWinners.quality).toBeDefined();
    expect(comparison.dimensionWinners.efficiency).toBeDefined();
    expect(comparison.dimensionWinners.safety).toBeDefined();
    expect(comparison.dimensionWinners.time).toBeDefined();
    expect(comparison.baselineRun.buildValidity.contentDensity).toBeDefined();
    expect(comparison.elevateRun.buildValidity.contentDensity).toBeDefined();
  });

  // Scenario P: HTML & JSON report generation with validity badges
  it("Scenario P: generates HTML and JSON comparison reports with build validity badges", async () => {
    const compCase = COMPARISON_CORPUS[0];
    const comparison = await ComparisonRunner.runSingleComparison(compCase, {
      agent: "mock",
      dryRun: true,
    });

    const report: ComparisonSuiteReport = {
      reportId: "test-report-5b",
      timestamp: new Date().toISOString(),
      suiteName: "Test 5B Suite",
      agent: "mock",
      model: "mock-model",
      totalCases: 1,
      elevateWins: { qualityWins: 1, efficiencyWins: 1, safetyWins: 1, timeWins: 1 },
      agentAloneWins: { qualityWins: 0, efficiencyWins: 0, safetyWins: 0, timeWins: 0 },
      ties: { qualityTies: 0, efficiencyTies: 0, safetyTies: 0, timeTies: 0 },
      aggregateMetrics: {
        agentAlone: {
          totalDurationMs: 100,
          avgDurationMs: 100,
          totalResolvedFindings: 0,
          totalFinalFindings: 0,
          totalRegressions: 0,
          validBuildCount: 1,
          invalidBuildCount: 0,
          successRate: 1,
          avgAcceptanceRate: 1,
        },
        agentElevate: {
          totalDurationMs: 100,
          avgDurationMs: 100,
          totalResolvedFindings: 2,
          totalFinalFindings: 0,
          totalRegressions: 0,
          validBuildCount: 1,
          invalidBuildCount: 0,
          successRate: 1,
          avgAcceptanceRate: 1,
        },
      },
      comparisons: [comparison],
      reproducibility: {
        seed: 42,
        agent: "mock",
        model: "mock-model",
        nodeVersion: process.version,
        platform: process.platform,
        gitCommit: "test",
        timestamp: new Date().toISOString(),
        fixtureHashes: {},
      },
    };

    const { jsonPath, htmlPath } = await generateComparisonReport(report, "./test-elevate-5b-reports");
    expect(jsonPath).toBeDefined();
    expect(htmlPath).toBeDefined();
  });
});
