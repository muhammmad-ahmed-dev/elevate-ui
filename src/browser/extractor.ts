import type { Page } from "playwright";
import type { DOMNodeSummary, OverflowIssue, ImageSummary, HeadingSummary, CLSMetricSummary } from "./types.js";

export class PageExtractor {
  public static async extractDOMAndStyles(page: Page): Promise<{
    elements: DOMNodeSummary[];
    overflowIssues: OverflowIssue[];
    images: ImageSummary[];
    headings: HeadingSummary[];
    clsMetrics: CLSMetricSummary;
    title: string;
  }> {
    const title = await page.title();

    const data = await page.evaluate(() => {
      const getSelector = (el: Element): string => {
        if (el.id) return `#${el.id}`;
        let path = el.tagName.toLowerCase();
        if (el.className && typeof el.className === "string") {
          const classes = el.className.trim().split(/\s+/).slice(0, 2).join(".");
          if (classes) path += `.${classes}`;
        }
        return path;
      };

      const elements: any[] = [];
      const overflowIssues: any[] = [];
      const images: any[] = [];
      const headings: any[] = [];

      const docWidth = document.documentElement.clientWidth;
      const scrollX = window.scrollX || window.pageXOffset || 0;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const allElements = Array.from(document.querySelectorAll("*"));

      // Extract images specifically
      const allImgs = Array.from(document.querySelectorAll("img"));
      for (const img of allImgs) {
        const rect = img.getBoundingClientRect();
        const src = img.getAttribute("src") || img.src || "";
        const complete = img.complete;
        const naturalWidth = img.naturalWidth;
        const naturalHeight = img.naturalHeight;
        const hasBrokenSrc = Boolean(src) && complete && (naturalWidth === 0 || naturalHeight === 0);

        images.push({
          selector: getSelector(img),
          src,
          alt: img.getAttribute("alt") || undefined,
          complete,
          naturalWidth,
          naturalHeight,
          hasBrokenSrc,
          boundingBox: {
            x: rect.x + scrollX,
            y: rect.y + scrollY,
            width: rect.width,
            height: rect.height,
            top: rect.top + scrollY,
            right: rect.right + scrollX,
            bottom: rect.bottom + scrollY,
            left: rect.left + scrollX,
          },
        });
      }

      // Extract headings (h1 - h6)
      const allHeadings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"));
      for (const h of allHeadings) {
        const rect = h.getBoundingClientRect();
        const tag = h.tagName.toLowerCase();
        const level = parseInt(tag.replace("h", ""), 10) || 1;
        headings.push({
          selector: getSelector(h),
          tagName: tag,
          level,
          textContent: h.textContent?.trim() || "",
          boundingBox: {
            x: rect.x + scrollX,
            y: rect.y + scrollY,
            width: rect.width,
            height: rect.height,
            top: rect.top + scrollY,
            right: rect.right + scrollX,
            bottom: rect.bottom + scrollY,
            left: rect.left + scrollX,
          },
        });
      }

      // Measure potential CLS layout hazards (images without dimensions, dynamic containers)
      let hazardElementsCount = 0;
      for (const img of allImgs) {
        if (!img.getAttribute("width") && !img.getAttribute("height") && !img.style.width && !img.style.height) {
          hazardElementsCount++;
        }
      }

      for (const el of allElements) {
        const rect = el.getBoundingClientRect();
        const scrollWidth = el.scrollWidth;
        const clientWidth = el.clientWidth;

        // 1. Check if element spills beyond the viewport or has internal horizontal overflow
        if (rect.right > docWidth + 1 || (scrollWidth > clientWidth && clientWidth > 0 && (el as HTMLElement).style.overflow !== "hidden")) {
          overflowIssues.push({
            element: el.tagName.toLowerCase(),
            selector: getSelector(el),
            scrollWidth,
            clientWidth,
            overflowAmount: Math.max(rect.right - docWidth, scrollWidth - clientWidth),
            boundingBox: {
              x: rect.x + scrollX,
              y: rect.y + scrollY,
              width: rect.width,
              height: rect.height,
              top: rect.top + scrollY,
              right: rect.right + scrollX,
              bottom: rect.bottom + scrollY,
              left: rect.left + scrollX,
            },
          });
        }

        // Filter meaningful UI elements for style extraction
        const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== "hidden" && window.getComputedStyle(el).display !== "none";
        const isSemanticTag = ["H1", "H2", "H3", "H4", "H5", "H6", "P", "BUTTON", "A", "NAV", "SECTION", "HEADER", "MAIN", "CARD", "IMG", "INPUT", "SELECT", "TEXTAREA"].includes(el.tagName);
        const isInteractive = ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) || el.getAttribute("role") === "button" || el.getAttribute("role") === "link" || el.getAttribute("role") === "menuitem";
        const hasText = el.childNodes.length > 0 && Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent || "").trim().length > 0);

        if (isVisible && (isSemanticTag || isInteractive || hasText)) {
          const style = window.getComputedStyle(el);
          elements.push({
            tagName: el.tagName.toLowerCase(),
            id: el.id || undefined,
            className: typeof el.className === "string" ? el.className : undefined,
            role: el.getAttribute("role") || undefined,
            ariaLabel: el.getAttribute("aria-label") || undefined,
            textContent: el.textContent?.trim().slice(0, 100) || undefined,
            hasDirectText: hasText,
            childrenCount: el.children.length,
            boundingBox: {
              x: rect.x + scrollX,
              y: rect.y + scrollY,
              width: rect.width,
              height: rect.height,
              top: rect.top + scrollY,
              right: rect.right + scrollX,
              bottom: rect.bottom + scrollY,
              left: rect.left + scrollX,
            },
            computedStyle: {
              display: style.display,
              position: style.position,
              fontSize: style.fontSize,
              fontWeight: style.fontWeight,
              lineHeight: style.lineHeight,
              color: style.color,
              backgroundColor: style.backgroundColor,
              padding: style.padding,
              margin: style.margin,
              width: style.width,
              height: style.height,
              overflow: style.overflow,
              zIndex: style.zIndex,
              fontFamily: style.fontFamily,
            },
          });
        }
      }

      return {
        elements: elements.slice(0, 200),
        overflowIssues: overflowIssues.slice(0, 50),
        images: images.slice(0, 50),
        headings: headings.slice(0, 50),
        clsMetrics: {
          isMeasurable: true,
          score: 0.0,
          hazardElementsCount,
        },
      };
    });

    return {
      elements: data.elements,
      overflowIssues: data.overflowIssues,
      images: data.images,
      headings: data.headings,
      clsMetrics: data.clsMetrics,
      title,
    };
  }
}
