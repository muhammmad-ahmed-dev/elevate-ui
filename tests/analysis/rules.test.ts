import { describe, it, expect } from "vitest";
import { TouchTargetRule } from "../../src/analysis/deterministic/rules/touch-target.js";
import { BrokenImageRule } from "../../src/analysis/deterministic/rules/broken-image.js";
import { HeadingRule } from "../../src/analysis/deterministic/rules/heading.js";
import { OverflowRule } from "../../src/analysis/deterministic/rules/overflow.js";
import { CLSRule } from "../../src/analysis/deterministic/rules/cls.js";
import { AxeRule } from "../../src/analysis/deterministic/rules/axe.js";
import type { RuleInspectionContext } from "../../src/analysis/deterministic/rules/types.js";
import type { ViewportConfig, ViewportExtraction } from "../../src/browser/types.js";

function createMockContext(overrides: Partial<ViewportExtraction> = {}): RuleInspectionContext {
  const viewport: ViewportConfig = {
    name: "mobile",
    width: 375,
    height: 667,
    label: "Mobile (375px)",
  };

  const extraction: ViewportExtraction = {
    viewport,
    screenshotBuffer: Buffer.from(""),
    screenshotBase64: "",
    domHtml: "<html><body></body></html>",
    elements: [],
    overflowIssues: [],
    images: [],
    headings: [],
    clsMetrics: { isMeasurable: true, score: 0, hazardElementsCount: 0 },
    title: "Test Page",
    url: "http://localhost:3000",
    ...overrides,
  };

  return { viewport, extraction };
}

describe("Deterministic Rules", () => {
  describe("TouchTargetRule", () => {
    it("flags undersized interactive element (20x20 button)", () => {
      const rule = new TouchTargetRule({ minimumWidth: 44, minimumHeight: 44 });
      const context = createMockContext({
        elements: [
          {
            tagName: "button",
            id: "small-btn",
            role: "button",
            textContent: "Click me",
            childrenCount: 0,
            hasDirectText: true,
            boundingBox: { x: 10, y: 10, width: 20, height: 20, top: 10, right: 30, bottom: 30, left: 10 },
            computedStyle: { display: "inline-block", position: "static", fontSize: "12px", fontWeight: "400", lineHeight: "16px", color: "#000", backgroundColor: "#fff", padding: "0px", margin: "0px", width: "20px", height: "20px", overflow: "visible", zIndex: "auto", fontFamily: "sans-serif" },
          },
        ],
      });

      const findings = rule.evaluate(context);
      expect(findings.length).toBe(1);
      expect(findings[0].category).toBe("touch-target");
      expect(findings[0].severity).toBe("serious");
      expect(findings[0].evidence.actualWidth).toBe(20);
      expect(findings[0].evidence.actualHeight).toBe(20);
      expect(findings[0].selector).toBe("#small-btn");
    });

    it("passes compliant interactive element (60x60 button)", () => {
      const rule = new TouchTargetRule({ minimumWidth: 44, minimumHeight: 44 });
      const context = createMockContext({
        elements: [
          {
            tagName: "button",
            id: "large-btn",
            role: "button",
            textContent: "Get Started",
            childrenCount: 0,
            hasDirectText: true,
            boundingBox: { x: 10, y: 10, width: 60, height: 60, top: 10, right: 70, bottom: 70, left: 10 },
            computedStyle: { display: "inline-block", position: "static", fontSize: "16px", fontWeight: "600", lineHeight: "24px", color: "#fff", backgroundColor: "#000", padding: "16px", margin: "0px", width: "60px", height: "60px", overflow: "visible", zIndex: "auto", fontFamily: "sans-serif" },
          },
        ],
      });

      const findings = rule.evaluate(context);
      expect(findings.length).toBe(0);
    });

    it("does not evaluate non-interactive elements as touch targets", () => {
      const rule = new TouchTargetRule();
      const context = createMockContext({
        elements: [
          {
            tagName: "p",
            textContent: "Small text snippet",
            childrenCount: 0,
            hasDirectText: true,
            boundingBox: { x: 0, y: 0, width: 25, height: 16, top: 0, right: 25, bottom: 16, left: 0 },
            computedStyle: { display: "block", position: "static", fontSize: "14px", fontWeight: "400", lineHeight: "16px", color: "#000", backgroundColor: "transparent", padding: "0px", margin: "0px", width: "25px", height: "16px", overflow: "visible", zIndex: "auto", fontFamily: "sans-serif" },
          },
        ],
      });

      const findings = rule.evaluate(context);
      expect(findings.length).toBe(0);
    });
  });

  describe("BrokenImageRule", () => {
    it("flags broken image with valid src that completed loading with 0x0 natural dimensions", () => {
      const rule = new BrokenImageRule();
      const context = createMockContext({
        images: [
          {
            selector: "#missing-logo",
            src: "https://example.com/non-existent.png",
            alt: "Company Logo",
            complete: true,
            naturalWidth: 0,
            naturalHeight: 0,
            hasBrokenSrc: true,
            boundingBox: { x: 0, y: 0, width: 100, height: 100, top: 0, right: 100, bottom: 100, left: 0 },
          },
        ],
      });

      const findings = rule.evaluate(context);
      expect(findings.length).toBe(1);
      expect(findings[0].category).toBe("broken-image");
      expect(findings[0].severity).toBe("serious");
      expect(findings[0].selector).toBe("#missing-logo");
      expect(findings[0].evidence.src).toBe("https://example.com/non-existent.png");
    });

    it("passes valid rendered image", () => {
      const rule = new BrokenImageRule();
      const context = createMockContext({
        images: [
          {
            selector: "#hero-img",
            src: "/images/hero.png",
            alt: "Hero Image",
            complete: true,
            naturalWidth: 800,
            naturalHeight: 600,
            hasBrokenSrc: false,
            boundingBox: { x: 0, y: 0, width: 400, height: 300, top: 0, right: 400, bottom: 300, left: 0 },
          },
        ],
      });

      const findings = rule.evaluate(context);
      expect(findings.length).toBe(0);
    });
  });

  describe("HeadingRule", () => {
    it("flags missing primary h1 heading", () => {
      const rule = new HeadingRule();
      const context = createMockContext({
        headings: [
          { selector: "h2.subtitle", tagName: "h2", level: 2, textContent: "Features", boundingBox: { x: 0, y: 50, width: 200, height: 30, top: 50, right: 200, bottom: 80, left: 0 } },
        ],
      });

      const findings = rule.evaluate(context);
      expect(findings.length).toBe(1);
      expect(findings[0].category).toBe("heading-hierarchy");
      expect(findings[0].title).toContain("Missing primary <h1>");
    });

    it("flags skipped heading levels (h1 followed by h3)", () => {
      const rule = new HeadingRule();
      const context = createMockContext({
        headings: [
          { selector: "h1.hero", tagName: "h1", level: 1, textContent: "Main Title", boundingBox: { x: 0, y: 0, width: 300, height: 40, top: 0, right: 300, bottom: 40, left: 0 } },
          { selector: "h3.card-title", tagName: "h3", level: 3, textContent: "Card Header", boundingBox: { x: 0, y: 100, width: 150, height: 20, top: 100, right: 150, bottom: 120, left: 0 } },
        ],
      });

      const findings = rule.evaluate(context);
      expect(findings.length).toBe(1);
      expect(findings[0].category).toBe("heading-hierarchy");
      expect(findings[0].title).toContain("Skipped heading level (<h1");
      expect(findings[0].evidence.previousLevel).toBe(1);
      expect(findings[0].evidence.currentLevel).toBe(3);
    });

    it("flags multiple h1 headings", () => {
      const rule = new HeadingRule();
      const context = createMockContext({
        headings: [
          { selector: "h1.first", tagName: "h1", level: 1, textContent: "Title 1", boundingBox: { x: 0, y: 0, width: 200, height: 30, top: 0, right: 200, bottom: 30, left: 0 } },
          { selector: "h1.second", tagName: "h1", level: 1, textContent: "Title 2", boundingBox: { x: 0, y: 100, width: 200, height: 30, top: 100, right: 200, bottom: 130, left: 0 } },
        ],
      });

      const findings = rule.evaluate(context);
      expect(findings.length).toBe(1);
      expect(findings[0].title).toContain("Multiple <h1>");
    });
  });

  describe("OverflowRule", () => {
    it("transforms horizontal overflow issues into normalized findings", () => {
      const rule = new OverflowRule();
      const context = createMockContext({
        overflowIssues: [
          {
            element: "div.wide-table",
            selector: "div.wide-table",
            scrollWidth: 600,
            clientWidth: 375,
            overflowAmount: 225,
            boundingBox: { x: 0, y: 200, width: 600, height: 150, top: 200, right: 600, bottom: 350, left: 0 },
          },
        ],
      });

      const findings = rule.evaluate(context);
      expect(findings.length).toBe(1);
      expect(findings[0].category).toBe("overflow");
      expect(findings[0].severity).toBe("critical");
      expect(findings[0].evidence.overflowAmount).toBe(225);
      expect(findings[0].selector).toBe("div.wide-table");
    });
  });

  describe("CLSRule", () => {
    it("detects unsized image hazards", () => {
      const rule = new CLSRule();
      const context = createMockContext({
        clsMetrics: {
          isMeasurable: true,
          score: 0.0,
          hazardElementsCount: 3,
        },
      });

      const findings = rule.evaluate(context);
      expect(findings.length).toBe(1);
      expect(findings[0].category).toBe("layout-shift");
      expect(findings[0].evidence.hazardElementsCount).toBe(3);
    });
  });

  describe("AxeRule", () => {
    it("identifies missing alt attribute in fallback mode when page is not provided", async () => {
      const rule = new AxeRule();
      const context = createMockContext({
        elements: [
          {
            tagName: "img",
            id: "banner-img",
            childrenCount: 0,
            hasDirectText: false,
            boundingBox: { x: 0, y: 0, width: 300, height: 100, top: 0, right: 300, bottom: 100, left: 0 },
            computedStyle: { display: "block", position: "static", fontSize: "0px", fontWeight: "400", lineHeight: "0px", color: "#000", backgroundColor: "#fff", padding: "0px", margin: "0px", width: "300px", height: "100px", overflow: "visible", zIndex: "auto", fontFamily: "sans-serif" },
          },
        ],
        images: [
          {
            selector: "#banner-img",
            src: "/banner.jpg",
            alt: undefined,
            complete: true,
            naturalWidth: 300,
            naturalHeight: 100,
            hasBrokenSrc: false,
            boundingBox: { x: 0, y: 0, width: 300, height: 100, top: 0, right: 300, bottom: 100, left: 0 },
          },
        ],
      });

      const findings = await rule.evaluate(context);
      expect(findings.length).toBe(1);
      expect(findings[0].category).toBe("accessibility");
      expect(findings[0].title).toContain("image-alt");
    });
  });
});
