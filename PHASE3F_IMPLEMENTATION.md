# Phase 3F Implementation Report: Single-Pass `elevate-ui improve`

**Phase:** Phase 3F (Single-Pass Improvement Orchestrator)
**Status:** Complete & Validated
**Author:** Elevate Implementation Engineer
**Target:** Single controlled improvement pass connecting audit, selection, locator, planner, provider, validator, approval, transaction, verification, and decision gate.

---

## 1. Executive Summary

Phase 3F implements the single-pass `elevate-ui improve` command and execution engine. It seamlessly coordinates all previously built, safety-audited subsystems (Perception, Deterministic & Visual Analysis, Recommendation Synthesis, ComponentLocator, PatchPlanner, PatchProvider, Unified Diff Validator, Git Mutation Transactions, and Verification Pipeline) into a unified, non-destructive, single-pass visual refinement loop.

In strict adherence to the architecture and Phase 3 safety constraints:
- **Strict Single-Pass Contract**: Exactly one recommendation, one patch, one transaction, and one verification pass are executed per run. No automatic retries or second attempts are performed (deferred to Phase 3G).
- **Default Safe Approval**: Human approval is required by default before any disk mutation occurs (`--auto-approve` defaults to `false`).
- **Zero Mutation on Dry Run**: `--dry-run` performs full audit, locator mapping, patch planning, generation, and AST validation, but exits safely before initiating the Git transaction or applying any patch.
- **Transaction Exclusivity**: All filesystem mutations and rollbacks are executed exclusively through `MutationTransactionRunner`. Zero occurrences of direct file overwrites, `GitManager.rollback()`, or `git clean` exist.
- **Fail-Safe Decision Gate**: If any hard gate (typecheck, build) or regression check fails, `DecisionGate` automatically rolls back the repository to its exact pre-mutation state.

---

## 2. Architecture & Pipeline Flow

The single-pass improvement pass executes in a strictly sequential, fail-fast order:

```
Target Application (e.g. http://localhost:3000)
    │
    ▼
[1/8] Multi-Viewport Perception & Baseline Audit
    │   • Headless Chromium capture across 375px / 768px / 1440px
    │   • Deterministic rules (axe, contrast, touch targets, overflow, headings)
    │   • Heuristic multimodal vision evaluation
    │   • Normalization, Deduplication, Prioritization & Synthesis
    ▼
[2/8] Actionable Recommendation Selection
    │   • selectBestRecommendation() picks highest-confidence candidate (>= 0.5)
    │   • Filters out high-risk or ambiguous recommendations
    ▼
[3/8] ComponentLocator
    │   • Maps recommendation selector / evidence to concrete TSX/JSX source files
    │   • Returns AMBIGUOUS_TARGET if mapping is ambiguous or unproven
    ▼
[4/8] PatchPlanner
    │   • Defines strict scoping boundaries, allowed files, and prohibited areas
    │   • Filters out protected files (.env, package.json, api routes, auth modules)
    ▼
[5/8] PatchProvider Generation
    │   • SourceContextBuilder gathers minimal relevant source files (excluding secrets)
    │   • Constructs constrained prompt with AST & logic rules
    │   • Selected provider (Claude / Gemini / Mock) produces structured unified diff
    ▼
[6/8] PatchValidator & AST Boundary Guard
    │   • DiffParser parses unified diff headers, hunks, additions, deletions
    │   • PathGuard verifies canonical paths against protected path registry
    │   • ScopeGuard enforces allowedFiles and maxFiles/maxLines limits
    │   • AstGuard enforces no hook modification, no network/API calls, no import alterations
    ▼
[7/8] Dry-Run Check / Human Approval
    │   • If --dry-run: stops safely with DRY_RUN status (zero disk mutations)
    │   • If !--auto-approve: formats terminal diff & checklist, prompts user [y/N]
    │   • If user rejects: stops safely with CANCELLED status (zero disk mutations)
    ▼
[8/8] Git Mutation Transaction & Safe Application
    │   • MutationTransactionRunner captures working tree checkpoint (HEAD, index, stash)
    │   • Dry-run apply (git apply --check) verifies patch cleanly applies
    │   • Applies patch to disk; transaction transitions to APPLIED
    ▼
Verification Pipeline & Decision Gate
    │   • Hard gate 1: TypeScript compilation check (tsc --noEmit)
    │   • Hard gate 2: Framework production build check
    │   • Runtime verification & Route smoke test (HTTP 200)
    │   • Multi-viewport browser re-capture & deterministic re-audit
    │   • Regression analysis comparing Before vs After findings
    │   • DecisionGate evaluates result:
    │       ├── ACCEPT: transaction COMPLETED (mutation retained)
    │       └── ROLLBACK: MutationTransactionRunner.rollback() (exact pre-mutation state restored)
    ▼
Structured ImproveRunResult Returned
```

---

## 3. Core Modules & Implementation Details

### 3.1. `src/agent/improve/types.ts`
Defines the single-pass improve engine types:
- `ImproveRunStatus`:
  - `SUCCESS`: Mutation verified and accepted.
  - `CANCELLED`: User rejected mutation during interactive approval.
  - `DRY_RUN`: Validated patch generated without mutating files.
  - `NO_ACTIONABLE_IMPROVEMENT`: No recommendation satisfied confidence threshold.
  - `AMBIGUOUS_TARGET`: Component locator could not map recommendation unambiguously.
  - `NO_VALID_PATCH`: Provider failed or returned empty diff.
  - `PATCH_REJECTED`: AST, path, or scope guard violations found in patch.
  - `MUTATION_FAILED`: Git transaction preflight or apply failed.
  - `VERIFICATION_FAILED`: Hard gates or regression check failed.
  - `ROLLED_BACK`: DecisionGate safely rolled back transaction.
  - `ERROR`: Critical failure (e.g. rollback error with recovery steps).
  - `BLOCKED`: Safety policy blocked execution.
- `ImproveRunOptions`: All CLI and programmatic options.
- `ApprovalPromptDetails`: Structured payload for the approval formatter.
- `ImproveRunResult`: Rich audit result containing runId, status, recommendation, patchPlan, validatedPatch, transaction, verificationResult, decision, and duration.

### 3.2. `src/agent/improve/selector.ts`
- `selectBestRecommendation()`: Selects the single highest-priority, actionable recommendation. Validates confidence thresholds, non-empty problem statements, actionable improvement summaries, and non-empty selectors/evidence.

### 3.3. `src/agent/improve/approval.ts`
- `formatApprovalDisplay()`: Generates safe, beautiful terminal output showing:
  - Recommendation ID, Problem, and Proposed Improvement
  - Affected Component, Selector, and Viewports
  - Risk Badge and Confidence Percentage
  - Files Touched and Line Counts (`+additions` / `-deletions`)
  - Safety Validation Checklist (Protected paths, Scope limits, AST & Logic boundaries)
  - Verification Plan (TypeScript, Build, Browser Perception, Regression Gate)
  - Colorized Unified Diff (`+green`, `-red`, `@@cyan`)
  - Guaranteed no API keys or credentials leaked in display.
- `promptUserApproval()`: Interactive `readline` prompt asking `Approve and apply this mutation? [y/N]`.

### 3.4. `src/agent/improve/engine.ts`
- `ImproveEngine`: Encapsulates the entire 11-step single-pass pipeline.
- `runImprovePass()`: Convenience export for invoking the engine.

### 3.5. `src/cli/commands/improve.ts`
- Implements `elevate-ui improve [url]`.
- Configured with options:
  - `--dry-run`
  - `--auto-approve`
  - `--vision-provider <provider>`
  - `--vision-model <model>`
  - `--skip-vision`
  - `--patch-provider <provider>`
  - `--patch-model <model>`
  - `--max-files <number>`
  - `--max-lines <number>`
  - `--timeout <ms>`
  - `--typecheck-cmd <cmd>`
  - `--build-cmd <cmd>`
  - `--dev-server-cmd <cmd>`
  - `-s, --screenshots-dir <dir>`
- Provides real-time step progress indicator: `[1/8]` through `[8/8]`.

---

## 4. Test Coverage & Validation

### 4.1. Unit & Integration Tests (`tests/agent/improve/engine.test.ts`)
- **Recommendation Selection**: Verified empty lists and sub-threshold candidates return `null`; valid candidate returned.
- **Approval Formatter**: Verified clean rendering of diff, validation checklist, and risk metrics.
- **Dry-Run Mode (Scenario C)**: Verified `DRY_RUN` status returned, validated patch produced, and zero changes to working directory or Git index.
- **User Cancellation (Scenario K)**: Verified `CANCELLED` status returned when user denies approval; working tree untouched.
- **Ambiguous Locator (Scenario G)**: Verified `AMBIGUOUS_TARGET` returned when locator cannot map selector to source file.
- **Patch Validation Failure (Scenario J)**: Verified `PATCH_REJECTED` returned when patch violates AST guard (e.g. modifying React hooks).
- **Single-Pass Invariant (Scenarios R & S)**: Verified audit pipeline and mutation are executed exactly once with zero retry loops.

### 4.2. End-to-End Disposable Project Tests (`tests/agent/improve/e2e.test.ts`)
- **Scenario Z1 (Successful Mutation Pass)**:
  1. Created disposable Git repo with a React component.
  2. Spawned mock HTTP server.
  3. Ran `runImprovePass()` with `--auto-approve`.
  4. Verified transaction reached `APPLIED`.
  5. Verified TypeScript, Build, and Route Smoke gates passed.
  6. Verified DecisionGate returned `ACCEPT`.
  7. Verified mutation is retained on disk and transaction is `COMPLETED`.
- **Scenario Z2 (Failed Verification & Exact Rollback)**:
  1. Created disposable Git repo.
  2. Ran `runImprovePass()` with an intentionally failing typecheck command (`exit 1`).
  3. Verified DecisionGate returned `ROLLBACK`.
  4. Verified `MutationTransactionRunner.rollback()` was invoked.
  5. Verified repository was restored 100% identically to pre-mutation state (`git diff` is empty).

### 4.3. Security & Invariant Tests (`tests/agent/improve/security.test.ts`)
- Verified zero references to `GitManager.rollback()` in `src/agent/improve/`.
- Verified zero references to `git clean` in `src/agent/improve/`.
- Verified API keys and credentials cannot leak in approval displays or logs.

### 4.4. Full Test Suite Validation
- **Total Test Files Passed:** 35 / 35 (100%)
- **Total Tests Passed:** 349 / 349 (100%)
- **Typecheck:** Clean (`tsc --noEmit` passed with code 0)
- **Linter:** Clean (`eslint` passed with code 0)
- **Build:** Clean (`tsc` passed with code 0)

---

## 5. Known Limitations & Phase 3G Scope Boundaries

- **Single Pass Only**: Phase 3F does not loop or attempt multiple recommendations in sequence. Multi-pass elevation belongs to Phase 3G.
- **No Automatic Retry**: If a patch fails AST validation or verification rollback occurs, the run terminates immediately with a descriptive status code rather than querying the LLM for a revised patch.
- **Single-Server Scope**: Dev server management is single-instance per pass.

---

## 6. Phase 3G Prerequisites

With Phase 3F validated, all prerequisites for Phase 3G (Multi-Pass Improve Loop & Convergence) are met:
1. Deterministic single-pass improvement engine with predictable status codes.
2. Exact rollback and transaction completion lifecycle.
3. Observability and before/after finding tracking.
4. CLI flag scaffolding prepared for `--max-passes`.
