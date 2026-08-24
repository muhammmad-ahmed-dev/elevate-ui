import { describe, it, expect } from "vitest";
import { VisualEvaluator } from "../../src/analysis/heuristic/evaluator.js";
import { MockVisionProvider } from "../../src/analysis/heuristic/providers/mock.js";
import { parseAndValidateVisionResponse, buildVisualAnalysisPrompt } from "../../src/analysis/heuristic/providers/base.js";
import type { MultiViewportResult } from "../../src/browser/types.js";

function createMockMultiViewportResult(): MultiViewportResult {
  return {
    targetUrl: "http://localhost:3000",
    timestamp: Date.now(),
    durationMs: 100,
    captures: {
      mobile: {
        viewport: { name: "mobile", width: 375, height: 667, label: "Mobile (375px)" },
        screenshotBuffer: Buffer.from("fake-img"),
        screenshotBase64: "ZmFrZS1pbWc=",
        domHtml: "<html><body><h1>Welcome to Elevate</h1></body></html>",
        elements: [
          {
            tagName: "h1",
            id: "hero-title",
            textContent: "Welcome to Elevate",
            childrenCount: 0,
            hasDirectText: true,
            boundingBox: { x: 20, y: 40, width: 335, height: 48, top: 40, right: 355, bottom: 88, left: 20 },
            computedStyle: { display: "block", position: "static", fontSize: "32px", fontWeight: "700", lineHeight: "40px", color: "#111", backgroundColor: "transparent", padding: "0px", margin: "0px", width: "335px", height: "48px", overflow: "visible", zIndex: "auto", fontFamily: "sans-serif" },
          },
        ],
        overflowIssues: [],
        images: [],
        headings: [{ selector: "#hero-title", tagName: "h1", level: 1, textContent: "Welcome to Elevate", boundingBox: { x: 20, y: 40, width: 335, height: 48, top: 40, right: 355, bottom: 88, left: 20 } }],
        clsMetrics: { isMeasurable: true, score: 0, hazardElementsCount: 0 },
        title: "Test Page",
        url: "http://localhost:3000",
      },
      tablet: {
        viewport: { name: "tablet", width: 768, height: 1024, label: "Tablet" },
        screenshotBuffer: Buffer.from("fake-img"),
        screenshotBase64: "ZmFrZS1pbWc=",
        domHtml: "<html><body><h1>Welcome to Elevate</h1></body></html>",
        elements: [],
        overflowIssues: [],
        images: [],
        headings: [],
        clsMetrics: { isMeasurable: true, score: 0, hazardElementsCount: 0 },
        title: "Test Page",
        url: "http://localhost:3000",
      },
      desktop: {
        viewport: { name: "desktop", width: 1440, height: 900, label: "Desktop" },
        screenshotBuffer: Buffer.from("fake-img"),
        screenshotBase64: "ZmFrZS1pbWc=",
        domHtml: "<html><body><h1>Welcome to Elevate</h1></body></html>",
        elements: [],
        overflowIssues: [],
        images: [],
        headings: [],
        clsMetrics: { isMeasurable: true, score: 0, hazardElementsCount: 0 },
        title: "Test Page",
        url: "http://localhost:3000",
      },
    },
  };
}

describe("Visual Heuristic Evaluator & Providers", () => {
  it("builds visual analysis prompt containing viewport DOM breakdowns", () => {
    const multiResult = createMockMultiViewportResult();
    const prompt = buildVisualAnalysisPrompt({
      targetUrl: multiResult.targetUrl,
      multiViewportResult: multiResult,
      deterministicFindings: [],
    });

    expect(prompt).toContain("Senior Visual Design Heuristic Evaluator");
    expect(prompt).toContain("Mobile (375px)");
    expect(prompt).toContain("Welcome to Elevate");
  });

  it("parses valid JSON response into RawVisualFinding[]", () => {
    const validJson = JSON.stringify({
      findings: [
        {
          category: "visual-hierarchy",
          title: "Headline lacks visual anchor",
          description: "No strong focal hierarchy",
          evidence: { focalScore: "weak" },
          selector: "h1.hero",
          viewport: "mobile",
          confidence: 0.85,
          proposedImprovement: "Enlarge hero font size to 40px",
        },
      ],
    });

    const parsed = parseAndValidateVisionResponse(validJson);
    expect(parsed.length).toBe(1);
    expect(parsed[0].category).toBe("visual-hierarchy");
    expect(parsed[0].title).toBe("Headline lacks visual anchor");
    expect(parsed[0].viewport).toBe("mobile");
    expect(parsed[0].confidence).toBe(0.85);
  });

  it("handles malformed JSON gracefully with helpful error", () => {
    expect(() => parseAndValidateVisionResponse("INVALID_NOT_JSON")).toThrow(/not valid JSON/i);
    expect(() => parseAndValidateVisionResponse(JSON.stringify({ notFindings: [] }))).toThrow(/missing required 'findings'/i);
  });

  it("evaluates visual heuristics with MockVisionProvider", async () => {
    const evaluator = new VisualEvaluator({
      provider: new MockVisionProvider(),
    });

    const multiResult = createMockMultiViewportResult();
    const result = await evaluator.evaluateVisual(multiResult.targetUrl, multiResult, []);

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.errors.length).toBe(0);
    expect(result.findings[0].source).toBe("heuristic");
    expect(result.findings[0].deterministic).toBe(false);
  });

  it("handles provider failure safely without crashing the evaluation pipeline", async () => {
    const evaluator = new VisualEvaluator({
      provider: new MockVisionProvider({
        simulateError: new Error("Simulated network timeout connecting to vision API"),
      }),
    });

    const multiResult = createMockMultiViewportResult();
    const result = await evaluator.evaluateVisual(multiResult.targetUrl, multiResult, []);

    // Returns empty findings and records error instead of throwing uncaught exception
    expect(result.findings).toEqual([]);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("Simulated network timeout");
  });
});
