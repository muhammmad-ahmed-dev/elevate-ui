import type { ViewportConfig } from "./types.js";

export const DEFAULT_VIEWPORTS: ViewportConfig[] = [
  {
    name: "mobile",
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    label: "Mobile (375px)",
  },
  {
    name: "tablet",
    width: 768,
    height: 1024,
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: false,
    label: "Tablet (768px)",
  },
  {
    name: "desktop",
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    label: "Desktop (1440px)",
  },
];
