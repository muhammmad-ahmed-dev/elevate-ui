# Phase 3G Implementation Report: Bounded Multi-Pass Improve Loop + Convergence Control

**Phase:** Phase 3G (Bounded Multi-Pass Improvement Orchestrator)
**Status:** Complete & Validated
**Author:** Elevate Implementation Engineer
**Target:** Safe, bounded multi-pass visual feedback loop with deterministic convergence controls, recommendation history tracking, duplicate prevention, and progress evaluation.

---

## 1. Multi-Pass Architecture

Phase 3G connects the validated Phase 3F single-pass engine into a safe, bounded multi-pass elevation loop. The loop iterates through actionable visual and UX recommendations while enforcing strict safety invariants:

```
[Target Application URL]
       │
       ▼
Initial Baseline Audit (Captured once, preserved throughout run)
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ Multi-Pass Iteration Loop (Pass 1 .. maxPasses, ceiling 10) │
│                                                             │
│  1. [If Pass > 1] Re-audit fresh mutated application state  │
│  2. Exclude previously attempted/failed recommendations     │
│  3. Select highest-priority actionable candidate            │
│  4. Check for duplicate proposal fingerprint                │
│     ├── IF repeated fingerprint -> STOP (REPEATED_REC)      │
│  5. ComponentLocator -> PatchPlanner -> PatchProvider       │
│  6. PatchValidator (AST, protected paths, scope limits)     │
│  7. Dry-Run Check (if --dry-run -> STOP, zero mutations)    │
│  8. Human Approval (prompt user per pass or autoApprove)    │
│  9. Git Mutation Transaction (execute -> APPLIED)           │
│ 10. Verification Pipeline (typecheck, build, browser verify)│
│ 11. Decision Gate & Progress Evaluator                      │
│     ├── IF ACCEPT: evaluate progress -> record pass         │
│     │   ├── IF no net-new progress -> STOP (NO_PROGRESS)    │
│     │   └── IF pass budget reached -> STOP (MAX_PASSES)     │
│     ├── IF ROLLBACK: exact rollback -> STOP (ROLLBACK)      │
│     └── IF ERROR/BLOCKED: -> STOP (SAFETY_ERROR/BLOCKED)    │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
Structured MultiPassImproveResult & Final Findings Summary
```

---

## 2. Pass Controller (`src/agent/improve/loop.ts`)

- `MultiPassImproveEngine` / `runMultiPassImproveLoop()`:
  - Enforces explicit pass boundaries: `--max-passes` must be an integer in `[1, 10]`. Rejects non-positive numbers, floats, NaN, and values above the safety ceiling.
  - Controls pass lifecycle, re-audits per accepted pass, manages recommendation exclusions, tracks pass durations, and produces rich aggregated run summaries.

---

## 3. Recommendation History & Fingerprinting (`src/agent/improve/history.ts`)

- `computeRecommendationFingerprint(rec)`: Deterministic SHA-256 fingerprint derived from normalized target selector, sanitized problem tokens, proposed improvement tokens, and sorted source finding IDs.
- `RecommendationHistoryTracker`:
  - Tracks all recommendations considered during the run (`AVAILABLE`, `ATTEMPTED`, `ACCEPTED`, `ROLLED_BACK`, `REJECTED`, `SKIPPED`, `SUPERSEDED`).
  - `filterCandidates()`: Automatically removes any recommendation previously attempted, rolled back, or rejected, preventing infinite loops or repeating failed mutations.
  - `isRepeated()`: Detects if the analyzer produces a proposal with an identical fingerprint to an earlier proposal.

---

## 4. Convergence Policy & Stopping Conditions

The multi-pass loop enforces deterministic stopping conditions:
1. `MAX_PASSES_REACHED`: Pass budget reached (1–10).
2. `NO_ACTIONABLE_IMPROVEMENTS`: All remaining findings are non-actionable or below confidence threshold (0.5).
3. `REPEATED_RECOMMENDATION`: Analyzer proposed an identical change fingerprint to an earlier attempt.
4. `NO_NET_NEW_PROGRESS`: Accepted mutation did not produce measurable visual or deterministic finding reduction.
5. `ROLLBACK`: DecisionGate safely reverted transaction (MVP fail-fast stopping policy).
6. `USER_CANCELLED`: User rejected interactive confirmation prompt.
7. `SAFETY_ERROR`: Critical rollback failure, AST violation, or mutation transaction apply failure.
8. `BLOCKED`: Scope planner or safety policy prevented mutation.
9. `DRY_RUN_COMPLETED`: Dry-run simulation finished with validated diff and zero mutations.

---

## 5. Progress Evaluator (`src/agent/improve/progress.ts`)

Progress is evaluated using deterministic, structured signals rather than LLM sentiment:
- `targetedIssueImproved`: Verification comparison confirms targeted selector issue is resolved.
- `newCriticalFindings` & `newSeriousFindings`: Must be zero.
- `resolved`: Count of pre-mutation findings resolved in post-mutation re-audit.
- `netReduction`: Total findings count after mutation must not exceed baseline.

---

## 6. Pass & Mutation Budgeting

- **Pass Budget**: Explicit tracking of `passesExecuted`, `passesAccepted`, `passesRolledBack`.
- **Mutation Budget**: `--max-files` (default 2) and `--max-lines` (default 150) are strictly enforced by `PatchPlanner` and `PatchValidator` independently on every pass. Limits never accumulate or expand across passes.

---

## 7. Dry-Run & Approval Modes

- **Dry-Run Mode (`--dry-run`)**: Validates the proposed patch and diff against AST and scope rules, records the pass result, and halts prior to any Git transaction or disk mutation.
- **Human Approval Default**: Interactive confirmation prompt (`[y/N]`) is required per pass unless `--auto-approve` is explicitly specified. Rejection immediately terminates the loop with `USER_CANCELLED`.
- **Autonomous Auto-Approve (`--auto-approve`)**: Bypasses only human prompts; all safety gates, AST validation, transactions, and verification gates execute identically.

---

## 8. Transaction & Verification Integration

- Every mutation is executed within a dedicated `MutationTransaction` (`MutationTransactionRunner.execute`).
- Every verification is performed by `VerificationPipeline.run` (typecheck, framework build, route smoke, browser perception, regression analysis).
- Zero calls to `GitManager.rollback()` or `git clean`. All rollbacks use `MutationTransactionRunner.rollback()`.

---

## 9. Test Coverage & Validation

### 9.1. Unit & Convergence Tests (`tests/agent/improve/loop.test.ts`)
- Deterministic recommendation fingerprinting and clone detection.
- History tracking and candidate exclusion.
- Progress evaluator regression and resolution detection.
- `max-passes` parameter validation (0, negative, >10 ceiling rejected).
- No actionable recommendations termination.
- Dry-run zero mutation across passes.
- User interactive cancellation termination.

### 9.2. End-to-End Disposable Git Repository Tests (`tests/agent/improve/e2e-multipass.test.ts`)
- **Scenario A**: Multi-pass sequential elevation until convergence (`ACCEPT` -> `ACCEPT` -> `NO_ACTIONABLE_IMPROVEMENTS`).
- **Scenario B**: Verification failure triggers `ROLLBACK` and immediately terminates multi-pass loop safely with exact repository restoration.
- **Scenario C**: Repeated recommendation proposal triggers immediate loop termination.

### 9.3. Full Suite Results
- **Test Files Passed:** 37 / 37 (100%)
- **Tests Passed:** 363 / 363 (100%)
- **TypeScript:** Clean (`tsc --noEmit` passed with code 0)
- **Linter:** Clean (`eslint` passed with code 0)
- **Build:** Clean (`tsc` passed with code 0)

---

## 10. Known Limitations & Phase 4 Prerequisites

- **No Final HTML Report**: Phase 3G stores all baseline and per-pass metadata in `MultiPassImproveResult`. Generation of the interactive HTML/visual report is deferred to Phase 4.
- **Single-Host Scope**: Audits and dev servers are single-host instances.
- **Rollback Stops Multi-Pass**: In Phase 3G MVP, any rollback terminates the multi-pass run immediately to prevent cascading instability.
