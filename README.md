# Elevate

Elevate is a closed-loop visual refinement engine for AI-generated web applications.

It is designed to help AI coding agents move beyond functional UI generation by combining:

- Browser rendering
- Multi-viewport inspection
- DOM and CSS extraction
- Deterministic UI checks
- Multimodal visual analysis
- Ranked design recommendations
- Regression-aware verification
- Git-safe code mutation
- Multi-pass visual refinement

## Current Status

- **Phase 1 — Foundation:** Complete
- **Phase 2 — Analysis & Synthesis:** Complete
- **Phase 3 — Mutation & Safety Loop:** Planned
- **Phase 4 — Reporting & MCP:** Planned

## Target Stack

- TypeScript
- Node.js
- Playwright
- Next.js / React / Tailwind target applications
- Git
- Multimodal vision providers

## Architecture

Elevate follows the pipeline:

Render → Inspect → Critique → Patch → Verify → Rollback

The initial MVP focuses on the analysis and verification layers before autonomous code mutation is enabled.

## Safety

Elevate uses Git checkpoints and verification gates to reduce the risk of automated code changes.

Autonomous mutation is intentionally separated from the analysis subsystem.

## Development

Install dependencies:

```bash
npm install
```

Run typecheck:

```bash
npm run typecheck
```

Run linter:

```bash
npm run lint
```

Run test suite:

```bash
npm test
```

Build:

```bash
npm run build
```

Run visual audit:

```bash
node dist/cli/index.js audit http://localhost:3000
```
