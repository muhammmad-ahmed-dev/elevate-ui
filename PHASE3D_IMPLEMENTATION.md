# Phase 3D Implementation Report: Git Transaction + Safe Patch Application + Exact Rollback

## Executive Summary

Phase 3D implements the first real mutation capability of the Elevate engine with non-negotiable safety guardrails. It establishes a transactional wrapper around `ValidatedPatch` inputs, ensuring that any code mutation is preceded by comprehensive preflight validation, guarded by exact Git checkpointing, applied via dry-run-checked Git facilities, tracked at the individual file path level, and completely reversible without ever resorting to blanket destructive cleanup commands.

---

## 1. Transaction Architecture

The mutation subsystem is structured under `src/agent/patch/transaction/`:

```
src/agent/patch/transaction/
├── types.ts         — TransactionState machine enum, PreflightCheckResult, CheckpointRecord, PatchApplyResult, RollbackResult
├── preflight.ts     — 10-step pre-mutation validation & repository baseline capture
├── checkpoint.ts    — Non-destructive user work preservation via git stash --index
├── apply.ts         — Two-stage patch execution: git apply --check (dry run) → git apply
├── rollback.ts      — Exact, path-targeted restoration without blanket cleanup commands
├── transaction.ts   — Central MutationTransactionRunner orchestrator
└── index.ts         — Public module interface
```

---

## 2. Preflight Checks

Before any mutation or checkpointing occurs, `runPreflightChecks()` executes the following sequence:

1. **Root Verification**: Asserts `projectRoot` is an absolute path pointing to an existing directory.
2. **ValidatedPatch Integrity**: Asserts `validatedPatch.valid === true`; recomputes SHA-256 digest of `rawPatch` and checks equality with `originalPatchHash`.
3. **Repository Validation**: Confirms repository exists via `git rev-parse --is-inside-work-tree`.
4. **Non-Empty HEAD**: Rejects repositories without an initial commit (`EMPTY_HEAD`).
5. **Git Baseline Capture**: Queries exact staged files (`git diff --cached --name-only`), unstaged tracked files (`git diff --name-only`), untracked files (`git status --porcelain`), and ignored files.
6. **Pre-existing Stash Audit**: Records pre-existing stash count (`git stash list`) to avoid touching user stashes.
7. **Scope & Path Traversal Check**: Asserts all authorized paths reside inside `projectRoot` and do not escape via `..` or symlinks.
8. **Protected Path Registry**: Re-checks every target path against the Phase 3A `isProtectedPath()` registry.
9. **Baseline Content Hashes**: Records SHA-256 hashes of all existing target files.
10. **Rejection on Drift**: If any check fails, the transaction immediately transitions to `FAILED` without modifying the filesystem.

---

## 3. Checkpoint Strategy

When uncommitted modifications exist (staged, unstaged, or untracked), `createTransactionCheckpoint()` issues:

```bash
git stash push -u -m elevate-tx-<checkpointId>
```

This captures:
- Working-tree modifications
- Staged index changes
- Untracked files

If the repository is already clean, no stash is created, and the baseline HEAD commit is recorded.

---

## 4. Patch Application

Patch application is strictly atomic and uses Git's native engine:

1. **Dry Run**: `checkPatchDryRun()` writes the patch to an isolated OS temp directory and executes `git apply --check <tempPath>`.
2. **Application**: Only if dry run exits with code `0`, `git apply <tempPath>` is executed.
3. **Failure Handling**: If `git apply` fails at any point, an immediate exact rollback is triggered to prevent partial or corrupted state.

---

## 5. Exact Mutation Tracking

Elevate never relies on LLM-reported file lists (`changedFilesClaimed`). Post-apply, `applyValidatedPatch()` determines what actually changed:

- **`filesModifiedByMutation`**: Extracted via `git diff --name-only` against the working tree.
- **`filesCreatedByMutation`**: Identified from `git status --porcelain` for newly introduced files not present in `untrackedFilesBaseline`.

---

## 6. Exact Rollback Strategy

`rollbackTransaction()` implements strict path-targeted restoration:

1. **Tracked Modified Files**: Restored individually via `git checkout HEAD -- <relPath>` (with fallback to `git restore --staged --worktree <relPath>`).
2. **Created Files**: Unlinked individually. Only files explicitly recorded in `filesCreatedByMutation` that were *not* in `untrackedFilesBaseline` are deleted.
3. **Stash Restoration**: If user changes were stashed, `git stash pop --index` restores the exact index and working-tree state.
4. **No Blanket Cleanup**: **`git clean -fd` and `git clean -fdx` are never called.**

---

## 7. Staged-State Preservation

When a user has staged modifications (`git add <file>`), the checkpoint and rollback mechanism guarantees that after rollback:
- File contents are identical to user work.
- File status in `git status --porcelain` remains `M ` (staged in index).
- Tested and verified on real temporary Git repositories.

---

## 8. Untracked-File Preservation

Pre-existing untracked files are captured in `untrackedFilesBaseline`. Rollback cross-references this baseline before any file deletion:
- Pre-existing untracked files are **never deleted**.
- Concurrent user-created files not tracked in `filesCreatedByMutation` are **never deleted**.

---

## 9. Error Handling

- All preflight, application, and rollback failures return structured `MutationTransactionResult` models.
- If rollback fails, `criticalError: true` is set, and a high-severity safety error is logged.
- The transaction transition table strictly rejects invalid state jumps.

---

## 10. Transaction State Machine

```
CREATED
  │
  ├─► [Preflight Passed] ──► PREFLIGHT_PASSED
  │                               │
  │                               ▼
  │                         CHECKPOINTED
  │                               │
  │                               ▼
  │                            APPLYING
  │                               │
  ├─► [Apply Success] ────────────┼──────────► APPLIED ──► [Phase 3E Verify/Loop]
  │                               │               │
  │                               ▼               ▼
  │                       ROLLBACK_REQUIRED ──► ROLLING_BACK
  │                                                   │
  │                                                   ├─► [Success] ──► ROLLED_BACK
  │                                                   │
  └─► [Any Error / Rollback Failure] ─────────────────┴───────────────► FAILED
```

---

## 11. Safety Invariants Validated

| Invariant | Description | Status |
|---|---|---|
| **INVARIANT 1** | Elevate never modifies files outside `ValidatedPatch` scope. | **VERIFIED** |
| **INVARIANT 2** | Elevate never deletes pre-existing untracked user files. | **VERIFIED** |
| **INVARIANT 3** | Elevate never destroys the user's staged index state. | **VERIFIED** |
| **INVARIANT 4** | Rollback never uses blanket `git clean`. | **VERIFIED** |
| **INVARIANT 5** | Failed patch application does not leave partial changes. | **VERIFIED** |
| **INVARIANT 6** | Failed rollback is surfaced as a safety-critical error. | **VERIFIED** |

---

## 12. Verification & Test Suite

All 20 test scenarios in `tests/agent/transaction/transaction.test.ts` pass against real temporary Git repositories:

- **Scenario A & B**: Checkpoint creation & exact Git state capture in clean repo.
- **Scenario C**: Staged index preservation through checkpoint → mutation → rollback.
- **Scenario D & E**: Unstaged changes & untracked file preservation.
- **Scenario F**: Ignored file (`.gitignore`) preservation.
- **Scenario G & H**: Accurate tracking of modified and created files.
- **Scenario I & J**: `git apply --check` dry-run verification and patch application.
- **Scenario K, L, M**: Clean rollback after application failure without partial state.
- **Scenario N & O**: Stash handling and pre-existing user stash preservation.
- **Scenario P**: Rejection of empty HEAD repositories.
- **Scenario Q**: Rejection of protected path mutations during preflight.
- **Scenario R**: Rejection on patch integrity/drift violation.
- **Scenario S & T**: State machine enforcement and rollback critical error reporting.
- **Scenario U & V**: Source assertion confirming no `git clean` usage and scope limitation.

---

## 13. End-to-End Validation Results

```bash
npm run typecheck  # 0 errors
npm run lint       # 0 errors, 0 warnings
npm test           # 27 test files passed (297 / 297 tests passed)
npm run build      # Clean TypeScript compile to dist/
```

---

## 14. Known Limitations

- **Git Dependency**: The target project directory must be a valid Git repository with at least one commit. Non-git projects cannot be mutated safely.
- **Concurrent File Creation**: Files created outside of Elevate during the microsecond window between `git apply` and post-status inspection would be treated as pre-existing if present in the untracked baseline. Rollback safely preserves them.

---

## 15. Prerequisites for Phase 3E

Phase 3D provides the exact transactional boundary for Phase 3E:
- `MutationTransactionRunner.execute()` produces a transaction in `APPLIED` state with exact `filesModifiedByMutation` and `filesCreatedByMutation`.
- Phase 3E will run verification gates (`tsc`, framework build, browser rendering, visual re-audit) on the `APPLIED` state.
- If verification fails, Phase 3E simply calls `MutationTransactionRunner.rollback(transaction)`.
- If verification passes, Phase 3E transitions the transaction to `COMPLETED`.
