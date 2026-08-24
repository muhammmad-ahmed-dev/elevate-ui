import type { DeterministicRule, RuleInspectionContext } from "./types.js";
import type { Finding } from "../../types.js";

export class BrokenImageRule implements DeterministicRule {
  public readonly name = "BrokenImageRule";

  public evaluate(context: RuleInspectionContext): Finding[] {
    const findings: Finding[] = [];
    const images = context.extraction.images || [];

    for (const img of images) {
      // An image is broken if it has completed loading with a valid src attribute, but has 0 natural dimensions
      const hasSrc = Boolean(img.src && img.src.trim().length > 0);
      const isBroken = hasSrc && img.complete && (img.naturalWidth === 0 || img.naturalHeight === 0);

      if (isBroken) {
        findings.push({
          id: `broken-image-${context.viewport.name}-${findings.length + 1}`,
          category: "broken-image",
          severity: "serious",
          title: "Broken or unrenderable image asset",
          description: `Image element with src "${img.src.slice(0, 100)}" finished loading with 0x0 natural dimensions on ${context.viewport.label}.`,
          evidence: {
            src: img.src,
            alt: img.alt,
            complete: img.complete,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            selector: img.selector,
          },
          selector: img.selector,
          boundingBox: img.boundingBox,
          viewport: context.viewport.name,
          source: "deterministic",
          deterministic: true,
          confidence: 1.0,
          proposedImprovement: `Verify the image source path "${img.src}" points to an existing accessible static file or provide a fallback asset.`,
        });
      }
    }

    return findings;
  }
}
