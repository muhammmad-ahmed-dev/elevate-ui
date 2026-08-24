import type { VisualEvaluationRequest, RawVisualFinding } from "../types.js";
import type { FindingCategory } from "../../types.js";

export const VALID_CATEGORIES: Set<FindingCategory> = new Set([
  "accessibility",
  "touch-target",
  "broken-image",
  "heading-hierarchy",
  "overflow",
  "layout-shift",
  "visual-hierarchy",
  "typography",
  "spacing",
  "color-contrast",
  "brand-rhythm",
  "cta-prominence",
  "composition",
  "responsive-integrity",
]);

export function buildVisualAnalysisPrompt(request: VisualEvaluationRequest): string {
  const viewportsSummary = Object.entries(request.multiViewportResult.captures).map(([name, capture]) => {
    const topElements = capture.elements.slice(0, 30).map((el) => ({
      tag: el.tagName,
      id: el.id,
      classes: el.className,
      text: el.textContent?.slice(0, 40),
      box: `${Math.round(el.boundingBox.x)},${Math.round(el.boundingBox.y)} (${Math.round(el.boundingBox.width)}x${Math.round(el.boundingBox.height)})`,
      style: {
        fontSize: el.computedStyle.fontSize,
        fontWeight: el.computedStyle.fontWeight,
        color: el.computedStyle.color,
        bg: el.computedStyle.backgroundColor,
      },
    }));

    return `Viewport: ${capture.viewport.label} (${name})\nSample Extracted Elements (${topElements.length}):\n${JSON.stringify(topElements, null, 2)}`;
  }).join("\n\n");

  const deterministicSummary = request.deterministicFindings.map((f) => `- [${f.category}] ${f.title} on ${f.viewport} (${f.selector || "general"})`).join("\n");

  return `You are Elevate's Senior Visual Design Heuristic Evaluator.
Analyze the attached multi-viewport screenshots (Mobile 375px, Tablet 768px, Desktop 1440px) and DOM layout metrics for the local web application at ${request.targetUrl}.

Already Identified Deterministic Issues:
${deterministicSummary || "None"}

DOM / Layout Breakdown by Viewport:
${viewportsSummary}

Your task: Perform a qualitative heuristic visual design review focusing on:
1. Visual Hierarchy & Focal Clarity: Is there an obvious visual anchor? Does headline compete with secondary copy?
2. Typographic Contrast & Rhythm: Inadequate hierarchy between H1/H2/body, poor line-height or readability.
3. Spacing, Padding & Repetition: Inconsistent margin rhythm, cramped containers, or awkward whitespace.
4. CTA Prominence & Polish: Low contrast buttons, lost action items, or unrefined "AI slop" styling.
5. Responsive Visual Integrity: Awkward stacking, uneven card grids, or squished columns across breakpoints.

Output Format Requirements:
Return ONLY a valid JSON object matching the following schema without markdown formatting or conversational prose:
{
  "findings": [
    {
      "category": "visual-hierarchy" | "typography" | "spacing" | "color-contrast" | "brand-rhythm" | "cta-prominence" | "composition" | "responsive-integrity",
      "title": "Short concise headline describing the visual issue",
      "description": "Specific, evidence-based description of what is visually unrefined and why",
      "evidence": { "visualDetail": "string", "competingElements": "string", "observation": "string" },
      "selector": "CSS selector or element tag (e.g. '.hero h1', 'button.cta', 'main section:first-of-type')",
      "viewport": "mobile" | "tablet" | "desktop",
      "confidence": 0.85,
      "proposedImprovement": "Concrete actionable recommendation for styling / layout change"
    }
  ]
}`;
}

export function parseAndValidateVisionResponse(rawJson: string): RawVisualFinding[] {
  let cleaned = rawJson.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "").trim();
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```/, "").replace(/```$/, "").trim();
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err: any) {
    throw new Error(`Vision response is not valid JSON: ${err.message}. Raw output snippet: ${cleaned.slice(0, 100)}`);
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.findings)) {
    throw new Error("Vision response missing required 'findings' array in top-level object.");
  }

  const validFindings: RawVisualFinding[] = [];

  for (const item of parsed.findings) {
    if (!item || typeof item !== "object") continue;

    const category: FindingCategory = VALID_CATEGORIES.has(item.category) ? item.category : "visual-hierarchy";
    const title = typeof item.title === "string" && item.title.trim() ? item.title.trim() : "Visual Design Finding";
    const description = typeof item.description === "string" ? item.description.trim() : "";
    const viewport = ["mobile", "tablet", "desktop"].includes(item.viewport) ? item.viewport : "desktop";
    const confidence = typeof item.confidence === "number" && !isNaN(item.confidence)
      ? Math.max(0.1, Math.min(1.0, item.confidence))
      : 0.8;

    validFindings.push({
      category,
      title,
      description,
      evidence: typeof item.evidence === "object" && item.evidence ? item.evidence : { raw: String(item.evidence || "") },
      selector: typeof item.selector === "string" ? item.selector : undefined,
      boundingBox: item.boundingBox,
      viewport: viewport as any,
      confidence,
      proposedImprovement: typeof item.proposedImprovement === "string" ? item.proposedImprovement : undefined,
    });
  }

  return validFindings;
}
