import type { VisionProvider, VisualEvaluationRequest, VisualEvaluationResponse, RawVisualFinding } from "../types.js";

export interface MockVisionProviderOptions {
  findings?: RawVisualFinding[];
  rawResponse?: string;
  simulateError?: Error;
}

export class MockVisionProvider implements VisionProvider {
  public readonly name = "mock";
  private options: MockVisionProviderOptions;

  constructor(options: MockVisionProviderOptions = {}) {
    this.options = options;
  }

  public async evaluateVisual(request: VisualEvaluationRequest): Promise<VisualEvaluationResponse> {
    if (this.options.simulateError) {
      throw this.options.simulateError;
    }

    if (this.options.rawResponse) {
      const { parseAndValidateVisionResponse } = await import("./base.js");
      const findings = parseAndValidateVisionResponse(this.options.rawResponse);
      return {
        findings,
        rawOutput: this.options.rawResponse,
        modelUsed: "mock-model",
        providerName: this.name,
      };
    }

    if (this.options.findings) {
      return {
        findings: this.options.findings,
        rawOutput: JSON.stringify({ findings: this.options.findings }),
        modelUsed: "mock-model",
        providerName: this.name,
      };
    }

    // Default heuristic sample findings based on captured DOM
    const sampleFindings: RawVisualFinding[] = [];
    for (const [name, capture] of Object.entries(request.multiViewportResult.captures)) {
      const heroH1 = capture.elements.find((e) => e.tagName === "h1");
      if (heroH1) {
        sampleFindings.push({
          category: "visual-hierarchy",
          title: "Headline lacks sufficient visual hierarchy and negative space",
          description: `The headline "${heroH1.textContent?.slice(0, 30) || ""}" on ${capture.viewport.label} has cramped surrounding whitespace, competing with adjacent CTA elements.`,
          evidence: {
            fontSize: heroH1.computedStyle.fontSize,
            lineHeight: heroH1.computedStyle.lineHeight,
            padding: heroH1.computedStyle.padding,
          },
          selector: heroH1.id ? `#${heroH1.id}` : "h1",
          boundingBox: heroH1.boundingBox,
          viewport: name as any,
          confidence: 0.85,
          proposedImprovement: "Increase vertical padding (py-6 to py-10) and enhance headline typography scaling.",
        });
      }
    }

    return {
      findings: sampleFindings,
      rawOutput: JSON.stringify({ findings: sampleFindings }),
      modelUsed: "mock-model",
      providerName: this.name,
    };
  }
}
