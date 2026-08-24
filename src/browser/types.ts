export type ViewportName = "mobile" | "tablet" | "desktop";

export interface ViewportConfig {
  name: ViewportName;
  width: number;
  height: number;
  deviceScaleFactor?: number;
  isMobile?: boolean;
  hasTouch?: boolean;
  label: string;
}

export interface ElementBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ElementComputedStyle {
  display: string;
  position: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  color: string;
  backgroundColor: string;
  padding: string;
  margin: string;
  width: string;
  height: string;
  overflow: string;
  zIndex: string;
  fontFamily: string;
}

export interface DOMNodeSummary {
  tagName: string;
  id?: string;
  className?: string;
  role?: string;
  ariaLabel?: string;
  textContent?: string;
  boundingBox: ElementBoundingBox;
  computedStyle: ElementComputedStyle;
  childrenCount: number;
  hasDirectText: boolean;
}

export interface OverflowIssue {
  element: string;
  selector: string;
  scrollWidth: number;
  clientWidth: number;
  overflowAmount: number;
  boundingBox: ElementBoundingBox;
}

export interface ImageSummary {
  selector: string;
  src: string;
  alt?: string;
  complete: boolean;
  naturalWidth: number;
  naturalHeight: number;
  boundingBox: ElementBoundingBox;
  hasBrokenSrc: boolean;
}

export interface HeadingSummary {
  selector: string;
  tagName: string;
  level: number;
  textContent: string;
  boundingBox: ElementBoundingBox;
}

export interface CLSMetricSummary {
  isMeasurable: boolean;
  score?: number;
  hazardElementsCount?: number;
}

export interface ViewportExtraction {
  viewport: ViewportConfig;
  screenshotBuffer: Buffer;
  screenshotBase64: string;
  screenshotPath?: string;
  domHtml: string;
  elements: DOMNodeSummary[];
  overflowIssues: OverflowIssue[];
  images?: ImageSummary[];
  headings?: HeadingSummary[];
  clsMetrics?: CLSMetricSummary;
  title: string;
  url: string;
}

export interface MultiViewportResult {
  targetUrl: string;
  timestamp: number;
  captures: Record<ViewportName, ViewportExtraction>;
  durationMs: number;
}

export interface BrowserRunnerOptions {
  headless?: boolean;
  timeout?: number;
  screenshotDir?: string;
  customViewports?: ViewportConfig[];
  waitUntil?: "domcontentloaded" | "load" | "networkidle" | "commit";
}
