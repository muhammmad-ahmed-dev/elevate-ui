import { chromium, type Browser, type Page } from "playwright";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  ViewportConfig,
  ViewportExtraction,
  MultiViewportResult,
  BrowserRunnerOptions,
  ViewportName,
} from "./types.js";
import { DEFAULT_VIEWPORTS } from "./viewports.js";
import { PageExtractor } from "./extractor.js";
import { logger } from "../utils/logger.js";

export class BrowserRunner {
  private browser: Browser | null = null;
  private options: BrowserRunnerOptions;

  constructor(options: BrowserRunnerOptions = {}) {
    this.options = {
      headless: true,
      timeout: 15000,
      ...options,
    };
  }

  public async initialize(): Promise<Browser> {
    if (!this.browser) {
      try {
        this.browser = await chromium.launch({
          headless: this.options.headless ?? true,
        });
      } catch (err: any) {
        logger.error(`Failed to launch Chromium: ${err.message}`);
        throw new Error(
          `Playwright Chromium launch failed. Ensure Playwright browsers are installed (run 'npx playwright install chromium'): ${err.message}`
        );
      }
    }
    return this.browser;
  }

  public async captureViewport(
    url: string,
    viewport: ViewportConfig
  ): Promise<ViewportExtraction> {
    const browser = await this.initialize();
    const context = await browser.newContext({
      viewport: {
        width: viewport.width,
        height: viewport.height,
      },
      deviceScaleFactor: viewport.deviceScaleFactor || 1,
      isMobile: viewport.isMobile || false,
      hasTouch: viewport.hasTouch || false,
    });

    const page: Page = await context.newPage();
    page.setDefaultTimeout(this.options.timeout || 15000);

    try {
      logger.dim(`Navigating to ${url} at ${viewport.label}...`);
      await page.goto(url, {
        waitUntil: this.options.waitUntil || "domcontentloaded",
        timeout: this.options.timeout || 15000,
      });
    } catch (err: any) {
      await context.close();
      throw new Error(
        `Failed to reach local server at ${url} on viewport ${viewport.label}. Ensure your dev server is running on localhost: ${err.message}`
      );
    }

    // Wait slightly for dynamic styles / animations to settle
    await page.waitForTimeout(500);

    // Extract screenshots
    const screenshotBuffer = await page.screenshot({ fullPage: true });
    const screenshotBase64 = screenshotBuffer.toString("base64");

    let screenshotPath: string | undefined;
    if (this.options.screenshotDir) {
      await fs.mkdir(this.options.screenshotDir, { recursive: true });
      const filename = `screenshot-${viewport.name}-${Date.now()}.png`;
      screenshotPath = path.join(this.options.screenshotDir, filename);
      await fs.writeFile(screenshotPath, screenshotBuffer);
    }

    // Extract DOM, CSS styles, bounding rects, and overflow metrics
    const domHtml = await page.content();
    const { elements, overflowIssues, images, headings, clsMetrics, title } = await PageExtractor.extractDOMAndStyles(page);

    await context.close();

    return {
      viewport,
      screenshotBuffer,
      screenshotBase64,
      screenshotPath,
      domHtml,
      elements,
      overflowIssues,
      images,
      headings,
      clsMetrics,
      title,
      url,
    };
  }

  public async captureAllViewports(
    url: string,
    viewports: ViewportConfig[] = DEFAULT_VIEWPORTS
  ): Promise<MultiViewportResult> {
    const start = Date.now();
    logger.step(
      "BROWSER",
      `Launching headless Chromium across ${viewports.map((v) => `${v.width}px`).join(" / ")}...`
    );

    const captures: Partial<Record<ViewportName, ViewportExtraction>> = {};

    for (const viewport of viewports) {
      captures[viewport.name] = await this.captureViewport(url, viewport);
    }

    logger.success(
      `Perception capture complete for ${Object.keys(captures).length} viewports (${Date.now() - start}ms)`
    );

    return {
      targetUrl: url,
      timestamp: Date.now(),
      captures: captures as Record<ViewportName, ViewportExtraction>,
      durationMs: Date.now() - start,
    };
  }

  public async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
