/**
 * Phase 3E: Visual Re-Analysis Tests
 *
 * Tests Scenarios R through T:
 *  R. Visual provider success
 *  S. Visual provider unavailable (does not block deterministic verification)
 *  T. Malformed visual result handling
 */

import { describe, it, expect } from "vitest";
import { VisualEvaluator } from "../../../src/analysis/heuristic/evaluator.js";
import { MockVisionProvider } from "../../../src/analysis/heuristic/providers/mock.js";
import type { VisionProvider } from "../../../src/analysis/heuristic/types.js";
import type { MultiViewportResult } from "../../../src/browser/types.js";

const mockMultiViewport: MultiViewportResult = {
  targetUrl: "http://localhost:3000",
  timestamp: Date.now(),
  captures: {
    desktop: {
      viewport: { name: "desktop", width: 1440, height: 900, label: "Desktop" },
      screenshotBuffer: Buffer.from("dummy"),
      screenshotBase64: "ZHVtbXk=",
      elements: [
        {
          tagName: "h1",
          id: "hero-title",
          textContent: "Hello World",
          boundingBox: { x: 0, y: 0, width: 200, height: 40, top: 0, right: 200, bottom: 40, left: 0 },
          computedStyle: {
            display: "block",
            position: "static",
            fontSize: "24px",
            fontWeight: "bold",
            lineHeight: "32px",
            color: "#000000",
            backgroundColor: "transparent",
            padding: "0px",
            margin: "0px",
            width: "200px",
            height: "40px",
            overflow: "visible",
            zIndex: "auto",
            fontFamily: "sans-serif",
          },
          childrenCount: 0,
          hasDirectText: true,
        },
      ],
      overflowIssues: [],
      title: "Test",
      url: "http://localhost:3000",
    },
  } as any,
  durationMs: 100,
};

describe("Visual Re-Analysis (Scenarios R, S, T)", () => {
  it("evaluates visual improvements with mock provider (R)", async () => {
    const mockProvider = new MockVisionProvider();
    const evaluator = new VisualEvaluator({ provider: mockProvider });

    const result = await evaluator.evaluateVisual("http://localhost:3000", mockMultiViewport, []);

    expect(result.errors).toHaveLength(0);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].source).toBe("heuristic");
  });

  it("handles unavailable visual provider gracefully without failing deterministic flow (S)", async () => {
    const brokenProvider: VisionProvider = {
      name: "UnavailableProvider",
      async evaluateVisual() {
        throw new Error("API key invalid or provider unreachable");
      },
    };

    const evaluator = new VisualEvaluator({ provider: brokenProvider });
    const result = await evaluator.evaluateVisual("http://localhost:3000", mockMultiViewport, []);

    // Returns empty findings and records error, but doesn't throw
    expect(result.findings).toHaveLength(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("API key invalid");
  });

  it("handles malformed visual result safely without throwing (T)", async () => {
    const malformedProvider: VisionProvider = {
      name: "MalformedProvider",
      async evaluateVisual() {
        return {
          findings: [
            {
              // Missing required fields
              category: "invalid-category" as any,
              title: "",
              description: "",
              evidence: null as any,
              viewport: "desktop",
              confidence: NaN,
            },
          ],
        };
      },
    };

    const evaluator = new VisualEvaluator({ provider: malformedProvider });
    const result = await evaluator.evaluateVisual("http://localhost:3000", mockMultiViewport, []);

    // Normalizes or handles safely
    expect(result.errors).toHaveLength(0);
    expect(result.findings).toHaveLength(1);
  });
});
