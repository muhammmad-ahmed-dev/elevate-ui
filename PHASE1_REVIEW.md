# Elevate: Phase 1 Architecture Review

**Reviewer:** Senior Architect
**Date:** 2026-08-24
**Scope:** Phase 1 (CLI, Browser, Safety modules)

## A. Confirmed Strengths
- **Clean Module Boundaries:** The separation of concerns between `cli`, `browser`, and `safety` is excellent. The entrypoints and configurations are well-isolated.
- **Git Checkpoint Semantics:** Utilizing `git stash push -u` to safeguard uncommitted user changes before applying mutations is an excellent defensive pattern.
- **Playwright Abstraction:** Multi-viewport capture is cleanly implemented using `ViewportConfig` presets, and the Chromium launch/teardown lifecycle is managed correctly, even in failure scenarios (using `finally`).
- **DOM/CSS Extraction:** Performing the bounding box and computed style extraction natively inside a single `page.evaluate()` call is highly performant and avoids multiple round-trips over the CDP protocol.
- **Test Foundation:** The integration tests using temporary Git repositories (`tests/safety/git.test.ts`) are robust and validate the actual underlying filesystem operations rather than relying purely on mocked `child_process`.

## B. Critical Issues
1. **Bounding Box Coordinates Post-Screenshot (Data Integrity)**
   - *Risk:* In `runner.ts`, `page.screenshot({ fullPage: true })` is called before `PageExtractor.extractDOMAndStyles()`. Playwright scrolls the page to capture a full-page screenshot, leaving `window.scrollY` greater than 0.
   - *Impact:* `getBoundingClientRect()` in `extractor.ts` returns viewport-relative coordinates. Because the page is scrolled, the extracted `y` and `top` values will be incorrect (negative or shifted). This will severely degrade the multimodal vision model's spatial reasoning in Phase 2.
2. **Git Stash Index Loss (Safety / UX Risk)**
   - *Risk:* `GitManager.rollback()` uses `git stash pop` to restore the user's uncommitted work. However, this command does not retain the Git index (staged files). 
   - *Impact:* If a user had files staged via `git add` prior to running Elevate, the rollback will restore the modifications to the working directory, but the files will no longer be staged. 

## C. Medium Issues
1. **NetworkIdle Timeout on Local Dev Servers**
   - *Risk:* `runner.ts` uses `waitUntil: "networkidle"`. Next.js (and Vite) dev servers maintain persistent WebSocket connections for Hot Module Replacement (HMR). 
   - *Impact:* Playwright may never reach "networkidle", causing intermittent timeout failures when running against `localhost:3000`. 
2. **Untracked File Deletion**
   - *Risk:* `git clean -fd` in the rollback sequence is designed to remove LLM-generated files, but it will also permanently delete any untracked user files if their `.gitignore` is incomplete. 
3. **Empty Repository Checkpoint Failure**
   - *Risk:* If a user initializes a Git repo (`git init`) but makes no initial commit, `git stash` will throw a fatal error. `createCheckpoint` does not currently guard against attempting to stash on an empty HEAD.

## D. Required Fixes Before Phase 2
- **Fix Bounding Boxes:** Update `extractor.ts` to calculate absolute document coordinates (e.g., `y: rect.y + window.scrollY`, `x: rect.x + window.scrollX`), or ensure `window.scrollTo(0,0)` is called before extraction.
- **Fix Stash Restoration:** Change the rollback command to `git stash pop --index` to preserve the user's exact staging area. (Fallback to standard pop if it fails).
- **Update Navigation Wait:** Change Playwright's `waitUntil` from `"networkidle"` to `"load"` or `"domcontentloaded"`.
- **Handle Empty HEAD:** Check for `headCommit === "EMPTY_HEAD"` and warn the user they must make an initial commit before running Elevate.

## E. Recommended but Non-Blocking Improvements
- **Limit DOM Extraction Depth:** To prevent token-limit exhaustion when sending DOM trees to the LLM in Phase 2, consider filtering out the internal nodes of SVGs (`<path>`, `<g>`, `<rect>`) and deeply nested decorative elements.
- **Targeted Git Clean:** Instead of `git clean -fd`, consider tracking the exact files created by the LLM patch and deleting only those files during rollback.

## F. Phase 2 Interface Requirements
The current architecture supports the upcoming Phase 2 checks, provided the following data points are surfaced:
- **Axe-core:** `PageExtractor` must be extended to either inject the Axe script or run `@axe-core/playwright` prior to teardown.
- **Touch-target checks:** `DOMNodeSummary` provides width/height, but Phase 2 must filter for interactive roles (`BUTTON`, `A`, `[role="button"]`) to evaluate against the 44x44px rule.
- **Broken-image checks:** `PageExtractor` needs to extract `naturalWidth` and `naturalHeight` specifically for `<img>` tags to detect broken sources.
- **Ranked issue synthesis:** Requires a pipeline structure that accepts both the `OverflowIssue[]` and the multimodal LLM response, deduplicating issues on the same `selector`.

## G. Test Gaps
- **Staged Git Files:** No tests verify that a `git add` (staged file) remains staged after a `createCheckpoint` -> `rollback` sequence.
- **Scroll Bounding Boxes:** No tests verify that DOM nodes off-screen (requiring scroll) have correct absolute `y` coordinates.
- **Playwright Timeout:** No tests verify graceful error handling when the target local server is completely offline or hanging.
