/**
 * Phase 4A: Report Asset Management
 *
 * Copies and normalizes screenshot assets into the report directory,
 * or encodes them as base64 for self-contained HTML embedding.
 */

import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import type { ReportViewportScreenshot } from "./types.js";
import { logger } from "../utils/logger.js";

export async function ensureDirectory(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function fileExists(filePath?: string): Promise<boolean> {
  if (!filePath) return false;
  try {
    const s = await stat(filePath);
    return s.isFile();
  } catch {
    return false;
  }
}

/**
 * Copies a screenshot file to the report assets directory.
 */
export async function copyAssetFile(
  srcPath: string,
  destDir: string,
  targetFileName: string
): Promise<string | undefined> {
  try {
    if (!(await fileExists(srcPath))) return undefined;
    await ensureDirectory(destDir);
    const destPath = join(destDir, targetFileName);
    await copyFile(srcPath, destPath);
    return `./assets/${targetFileName}`;
  } catch (err: any) {
    logger.warn(`Report asset copy failed for ${srcPath}: ${err.message}`);
    return undefined;
  }
}

/**
 * Reads a screenshot and converts it to a data URL (base64).
 */
export async function encodeImageAsDataUrl(filePath?: string): Promise<string | undefined> {
  if (!filePath) return undefined;
  try {
    if (!(await fileExists(filePath))) return undefined;
    const buffer = await readFile(filePath);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/**
 * Normalizes and processes viewport screenshots for report output.
 */
export async function processReportScreenshots(
  viewports: ReportViewportScreenshot[],
  outputDir: string,
  embedImages = false
): Promise<ReportViewportScreenshot[]> {
  const assetsDir = join(outputDir, "assets");
  await ensureDirectory(assetsDir);

  const processed: ReportViewportScreenshot[] = [];

  for (const vp of viewports) {
    const item: ReportViewportScreenshot = { ...vp };

    if (embedImages) {
      if (vp.beforePath && (await fileExists(vp.beforePath))) {
        item.beforeBase64 = await encodeImageAsDataUrl(vp.beforePath);
      }
      if (vp.afterPath && (await fileExists(vp.afterPath))) {
        item.afterBase64 = await encodeImageAsDataUrl(vp.afterPath);
      }
    } else {
      if (vp.beforePath && (await fileExists(vp.beforePath))) {
        const ext = basename(vp.beforePath).split(".").pop() || "png";
        const filename = `${vp.viewport}-before.${ext}`;
        item.beforePath = await copyAssetFile(vp.beforePath, assetsDir, filename);
      }
      if (vp.afterPath && (await fileExists(vp.afterPath))) {
        const ext = basename(vp.afterPath).split(".").pop() || "png";
        const filename = `${vp.viewport}-after.${ext}`;
        item.afterPath = await copyAssetFile(vp.afterPath, assetsDir, filename);
      }
    }

    processed.push(item);
  }

  return processed;
}
