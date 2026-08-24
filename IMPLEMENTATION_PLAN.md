# Elevate: Implementation Plan

## 14. Test Strategy
Since Elevate heavily relies on side-effects (modifying code, running browsers, integrating with Git), the testing strategy must be robust and isolated.
- **Unit Tests:** For core logic, AST boundary parsing, and deterministic rules checking (using mock DOM trees).
- **Integration Tests:** 
  - Git rollback harness testing (verifying that failed builds correctly trigger a rollback).
  - Patch-generation testing against a suite of mock Next.js components to validate AST guardrails.
- **End-to-End (E2E) Tests:** 
  - Using a dummy Next.js/Tailwind project.
  - Run the CLI through a full improve-until-better loop.
  - Assert that the final state compiles and the HTML report is generated accurately.
- **Blind Benchmark Protocol:** Establish an 80-app dataset (Next.js/Tailwind outputs from Claude Code, Cursor, etc.) to empirically track blind preference win-rate and mutation pass success rate, utilizing a professional panel.

## 17. Implementation Order
**Phase 1: Foundation (Days 1-10)**
- Scaffold CLI framework and directory structure (`cli/`).
- Implement Git safety wrapper and checkpointing (`safety/`).
- Implement Playwright headless capture engine for 3 viewports and CSS/DOM extraction (`browser/`).

**Phase 2: Analysis & Synthesis (Days 11-20)**
- Build the deterministic checker (Axe-core, CDP bounding boxes for overflow) in `analysis/`.
- Integrate swappable multimodal vision model for heuristic analysis.
- Implement the Synthesis engine to merge and rank deterministic + heuristic issues.

**Phase 3: Mutation & Safety Loop (Days 21-30)**
- Implement LLM prompt logic for unified-diff patch generation (`agent/`).
- Build AST boundary validation logic to strictly constrain patches to single components.
- Chain the core "Improve-Until-Better" loop: Analysis -> Patch -> Build/Verify -> Commit/Rollback.

**Phase 4: Polish, Reporting & Integration (Days 31-60)**
- Implement HTML summary report generator and JSON logs (`reports/`).
- Implement MCP Server layer to expose capabilities (`mcp/`).
- Write comprehensive E2E test suite against dummy Next.js apps.
- Resolve open questions from dossier:
  - Benchmark panel recruitment and pilot.
  - Unit economics and per-run pricing validation.
- Prepare public release and documentation.
