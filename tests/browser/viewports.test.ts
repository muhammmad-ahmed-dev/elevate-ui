import { describe, it, expect } from "vitest";
import { DEFAULT_VIEWPORTS } from "../../src/browser/viewports.js";

describe("Viewports Configuration", () => {
  it("defines standard breakpoints 375px, 768px, 1440px", () => {
    expect(DEFAULT_VIEWPORTS.length).toBe(3);

    const mobile = DEFAULT_VIEWPORTS.find((v) => v.name === "mobile");
    expect(mobile).toBeDefined();
    expect(mobile?.width).toBe(375);
    expect(mobile?.isMobile).toBe(true);

    const tablet = DEFAULT_VIEWPORTS.find((v) => v.name === "tablet");
    expect(tablet).toBeDefined();
    expect(tablet?.width).toBe(768);

    const desktop = DEFAULT_VIEWPORTS.find((v) => v.name === "desktop");
    expect(desktop).toBeDefined();
    expect(desktop?.width).toBe(1440);
  });
});
