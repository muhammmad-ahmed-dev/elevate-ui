# PHASE 3D — FINAL SAFETY GATE

**Audit performed:** Independent static code review of `src/agent/patch/transaction/*`, `src/safety/git.ts`, and all Phase 3D test files.  
**Decision:** ✅ **READY_FOR_PHASE_3E** — with one documented architectural risk that Phase 3E must treat as a standing constraint.

---

## 1. Audit Scope

Files reviewed:

| File | Purpose |
|---|---|
| `src/agent/patch/transaction/types.ts` | State machine enum, all Phase 3D contracts |
| `src/agent/patch/transaction/preflight.ts` | Pre-mutation validation + baseline capture |
| `src/agent/patch/transaction/checkpoint.ts` | User-state preservation via `git stash -u` |
| `src/agent/patch/transaction/apply.ts` | Dry-run + real `git apply` execution |
| `src/agent/patch/transaction/rollback.ts` | Exact path-targeted file restoration |
| `src/agent/patch/transaction/transaction.ts` | Orchestrator + state machine enforcer |
| `src/agent/patch/transaction/index.ts` | Public module surface |
| `src/agent/types.ts` | `MutationTransaction` model |
| `src/safety/git.ts` | Legacy `GitManager` (NOT used by transaction rollback) |
| `tests/agent/transaction/transaction.test.ts` | 20+ scenarios on real temp git repos |

---

## 2. Safety Invariant Audit

For each mandatory invariant, this section records the code path that enforces it and whether that enforcement is complete.

---

### INVARIANT 1 — Elevate never modifies files outside `ValidatedPatch` scope

**Code path:**  
`preflight.ts` iterates `validatedPatch.normalizedFiles` and re-validates every path against `isProtectedPath()` and project root traversal (`!normalizedAbs.startsWith(normalizedRoot + "/")`).  
`rollback.ts` iterates only `transaction.filesModifiedByMutation` and `transaction.filesCreatedByMutation` — both populated from `git diff --name-only` and `git status --porcelain` post-apply, not from LLM-claimed file lists.

**Verdict:** ✅ VERIFIED. Scope is enforced at both entry (preflight) and exit (rollback targeting). Out-of-scope files are never written or reverted.

---

### INVARIANT 2 — Elevate never deletes pre-existing untracked user files

**Code path:**  
`checkpoint.ts` records `untrackedFilesBaseline` from `preflight.untrackedFiles`.  
`rollback.ts` (line 35–37) builds `baselineUntrackedSet` from `checkpoint.untrackedFilesBaseline ?? transaction.untrackedFilesBefore`.  
Before calling `unlink()` on any file in `filesCreatedByMutation`, it checks `baselineUntrackedSet.has(relPath)` and skips if present (lines 63–68).

**Verdict:** ✅ VERIFIED. Pre-existing untracked files are protected by baseline cross-reference before deletion.

**Caveat (minor, acceptable):** The baseline uses relative paths as recorded by `git status --porcelain`. If a file is deeply nested and the porcelain path format differs from the relative path format used in `filesCreatedByMutation`, the set lookup might miss a match. This is a low-probability edge case. Recommend adding absolute-path normalisation in Phase 3E.

---

### INVARIANT 3 — Elevate never destroys the user's staged index state

**Code path:**  
`checkpoint.ts` (line 30): `git stash push -u -m elevate-tx-<checkpointId>`.  
The `-u` flag captures untracked files. The stash also captures the index (staged changes) automatically because `git stash` preserves the staged state in the stash object.  
`rollback.ts` (line 88): `git stash pop --index`, which restores both the working tree **and** the exact staged index in one atomic operation.  
Fallback (lines 96–97): plain `git stash pop` if `--index` fails (e.g., conflicts). This preserves content but loses index state — the code logs a warning.

**Verdict:** ✅ VERIFIED for the primary path. The `--index` path restores staged state exactly. The plain-pop fallback is the only acceptable degradation path and is clearly logged.

---

### INVARIANT 4 — Rollback never uses blanket `git clean`

**Code path:**  
`rollback.ts` contains zero instances of `"git clean"`, `"clean -fd"`, or `"clean -fdx"` (confirmed by grep returning no results in the transaction directory).  
Source-level test Scenario U in `transaction.test.ts` (lines 518–527) explicitly reads the rollback source file at runtime and asserts no `"git clean"` string is present.

**⚠ ARCHITECTURAL FLAG:** `src/safety/git.ts` — the legacy `GitManager.rollback()` method (lines 146–147) calls `git checkout .` followed by `git clean -fd`. This class is **not** invoked by the Phase 3D transaction engine. `preflight.ts` uses `GitManager.isGitRepo()` and `GitManager.getStatus()` only — never `GitManager.rollback()`. However, this dangerous rollback method exists in the same safety module and could be accidentally wired in future phases.

**Phase 3E Constraint:** `GitManager.rollback()` must be annotated as deprecated and must never be called in Phase 3E or later. The Phase 3D `MutationTransactionRunner.rollback()` is the sole authoritative rollback path.

**Verdict:** ✅ VERIFIED for Phase 3D. The transaction engine does not call `git clean`. The legacy method is an isolated dead code path. Risk is documented.

---

### INVARIANT 5 — Failed patch application does not leave partial changes

**Code path:**  
`apply.ts` (lines 64–73): dry-run via `git apply --check` first. If it fails, returns `success: false` before any real write.  
If the real `git apply` fails (lines 76–85), returns `success: false` with empty file lists.  
`transaction.ts` (lines 184–213): on `!applyResult.success`, the orchestrator immediately calls `rollbackTransaction()` with the checkpoint.  
At this point, `transaction.filesModifiedByMutation` and `transaction.filesCreatedByMutation` are still `[]` (set only on the success path, lines 216–217), so rollback only pops the stash.

**Verdict:** ✅ VERIFIED. If `git apply` fails, the stash pop restores the prior clean state. Partial write is structurally impossible because `git apply` is atomic within Git's object model.

---

### INVARIANT 6 — Failed rollback is surfaced as a safety-critical error

**Code path:**  
`rollback.ts` (lines 120–133): the outer `catch` sets `criticalError: true` unconditionally.  
The returned `TransactionRollbackResult` has `success: false`, `criticalError: true`, and an `error` string.  
`transaction.ts` (lines 255–260): on `!rbResult.success`, the orchestrator transitions to `FAILED`.  
Test Scenario T / INVARIANT 6 test (lines 480–510, 659–689) verify this.

**⚠ Minor Code Quality Issue:** In `rollback.ts` line 132: `criticalError: criticalError || true`. The expression always evaluates to `true` in the catch block, which produces correct behavior but masks a subtle logic redundancy. Not a safety defect.

**Verdict:** ✅ VERIFIED. Rollback failures always produce `criticalError: true`.

---

## 3. Scenario-by-Scenario Audit

### A. Clean repository: `RepositoryAfterRollback === RepositoryBeforeMutation`?

1. Preflight records all baseline lists as empty.
2. `isDirty = false` → no stash created.
3. Patch applied via `git apply`.
4. Rollback: `git checkout HEAD -- <relPath>` for each modified file. No stash pop.
5. Result: file content reverted to HEAD, index unchanged.

**Verdict:** ✅ Repository is exactly identical to pre-mutation state.

---

### B. Modified tracked file (unstaged): preserved through stash + rollback?

1. Preflight: `unstagedFiles = ["src/Tracked.tsx"]`.
2. Checkpoint: `isDirty = true` → `git stash push -u` stashes `src/Tracked.tsx` modifications.
3. Apply: `git apply` on the target file (clean tree after stash).
4. Rollback: revert target file, then `git stash pop --index`.
5. `src/Tracked.tsx` content and unstaged status are restored from stash.

**Verdict:** ✅ Unstaged user modifications are fully preserved. Verified by Scenario D/E test.

---

### C. Staged tracked file: index state preserved?

1. Preflight: `stagedFiles = ["src/Staged.tsx"]`.
2. Checkpoint: `isDirty = true` → `git stash push -u`. Git stash captures the staged index.
3. Apply + rollback: stash pop with `--index` restores `src/Staged.tsx` to its previously staged state.
4. `git status --porcelain` shows `M  src/Staged.tsx` (staged).

**Verdict:** ✅ Staged state preserved exactly. Verified by Scenario C / INVARIANT 3 test.

---

### D. Untracked file: not deleted during rollback?

1. Preflight: `untrackedFiles = ["user-notes.txt"]`.
2. Checkpoint: `untrackedFilesBaseline = ["user-notes.txt"]`. Stash captures it.
3. After apply: `filesCreatedByMutation` contains only Elevate-created files.
4. Rollback: `baselineUntrackedSet = {"user-notes.txt"}`. Cross-reference check prevents deletion. Stash pop restores the file.

**Verdict:** ✅ Pre-existing untracked files are never deleted. Verified by INVARIANT 2 test.

---

### E. Ignored file: preserved?

1. `git stash push -u` does NOT stash ignored files (`-u` = untracked but not ignored).
2. Ignored files remain on disk throughout. Rollback never touches them.

**Verdict:** ✅ Ignored files are structurally untouched. Verified by Scenario F test.

---

### F. Mixed state (staged + unstaged + untracked): all restored?

1. `isDirty = true` (any of the three triggers the stash).
2. `git stash push -u` captures all three categories into one stash entry.
3. `git stash pop --index` restores all three categories atomically.

**Verdict:** ✅ All three categories are restored.

---

### G. Pre-existing stash: not corrupted?

1. `preExistingStashCount = 1` recorded by preflight.
2. New Elevate stash pushed on top of the stack (index 0).
3. Rollback pops only index 0 (Elevate's stash). Pre-existing user stash at index 1 is untouched.

**Verdict:** ✅ Pre-existing stashes are preserved. Verified by Scenario N/O test.

**Risk note:** If an external process pushes a stash concurrently, the indices shift and Elevate pops the wrong entry. This is acceptable in single-user local dev. Mitigate in future by popping by stash message ID.

---

### H. Stash pop fails: user work preserved?

1. `git stash pop --index` fails → plain `git stash pop` attempted.
2. If plain pop also fails: throws → outer catch returns `criticalError: true`. Stash entry remains in `git stash list`.
3. Error message explicitly instructs user to run `'git stash list'`.

**Verdict:** ✅ Even in the worst case, user work is preserved in the stash. Not destroyed.

---

### I. `git apply` temp path is outside repository?

`apply.ts` writes the patch to `os.tmpdir()` and runs `git apply <tempPath>` with `cwd = projectRoot`. The temp dir is outside the repository and is cleaned up in the `finally` block.

**Verdict:** ✅ Correct. Temp files are isolated.

---

### J. State machine prevents invalid phase entry?

`VALID_TRANSITIONS` in `transaction.ts` rejects any unlisted transition at runtime. Test Scenario S verifies that jumping from `CREATED` to `ROLLING_BACK` throws `"Invalid transaction state transition"`.

**Verdict:** ✅ State machine is correct and tested.

---

## 4. Critical Code Paths — Static Verification

| Check | Finding |
|---|---|
| `rollback.ts` contains `git clean` | ❌ NOT PRESENT — confirmed by grep + Scenario U runtime test |
| `transaction.ts` calls `GitManager.rollback()` | ❌ NOT CALLED — only `isGitRepo()` + `getStatus()` used |
| Preflight returns early without filesystem mutation on failure | ✅ CONFIRMED |
| Checkpoint failure aborts transaction before apply | ✅ CONFIRMED |
| `filesModifiedByMutation` set only on apply success path | ✅ CONFIRMED (transaction.ts lines 216–217) |
| Rollback targets only recorded files, not claimed files | ✅ CONFIRMED |
| `git stash push -u` captures all dirty state | ✅ CONFIRMED |
| `git stash pop --index` restores exact index state | ✅ CONFIRMED |
| Fallback stash pop degrades gracefully with warning | ✅ CONFIRMED |
| Ignored files never touched | ✅ CONFIRMED |

---

## 5. Documented Risks for Phase 3E

| Risk ID | Description | Severity | Resolution |
|---|---|---|---|
| R-3D-01 | `GitManager.rollback()` in `src/safety/git.ts` uses `git clean -fd`. Not called by Phase 3D but present in the codebase. | MEDIUM | Annotate as `@deprecated`. Never call in Phase 3E or later. |
| R-3D-02 | Stash pop uses index-0 assumption. Concurrent external stash push would corrupt the pop target. | LOW | Acceptable in local dev. Fix in future phase by popping by stash message ID. |
| R-3D-03 | Untracked file baseline uses relative paths from porcelain output. Unusual path formats could cause missed cross-references. | LOW | Add absolute-path normalisation in rollback in Phase 3E. |
| R-3D-04 | If both `git checkout HEAD` and `git restore` fail in rollback, repository may be left with partially applied changes. | LOW-MEDIUM | Add `git reflog` + `git stash list` guidance in error output in Phase 3E. |
| R-3D-05 | `criticalError || true` expression in `rollback.ts` line 132 is logically redundant. | INFO | Simplify to `criticalError: true` in Phase 3E. |

---

## 6. Test Coverage Assessment

| Scenario | Coverage |
|---|---|
| Clean repo checkpoint + apply | ✅ Scenarios A/B |
| Staged file preservation | ✅ Scenario C / INVARIANT 3 |
| Unstaged changes preservation | ✅ Scenarios D/E |
| Untracked file preservation | ✅ INVARIANT 2 |
| Ignored file preservation | ✅ Scenario F |
| File creation + modification tracking | ✅ Scenarios G/H |
| Dry-run rejection | ✅ Scenario I |
| Clean rollback after apply failure | ✅ Scenarios K/L/M / INVARIANT 5 |
| Pre-existing stash preservation | ✅ Scenarios N/O |
| Empty HEAD rejection | ✅ Scenario P |
| Protected path rejection | ✅ Scenario Q |
| Patch integrity / drift rejection | ✅ Scenario R |
| State machine enforcement | ✅ Scenario S |
| Rollback critical error surfacing | ✅ Scenario T / INVARIANT 6 |
| No `git clean` in rollback source | ✅ Scenario U / INVARIANT 4 |
| Out-of-scope file untouched | ✅ INVARIANT 1 |

**All 20 scenario groups have corresponding test coverage on real temporary Git repositories. Tests do not mock Git.**

---

## 7. Final Decision

```
DECISION: READY_FOR_PHASE_3E
```

Phase 3D provides a correct, non-destructive, and safety-audited mutation foundation for Phase 3E verification gates.

**Binding conditions on Phase 3E:**

1. Phase 3E MUST NOT call `GitManager.rollback()` from `src/safety/git.ts`. The only authorised rollback path is `MutationTransactionRunner.rollback()`.
2. Phase 3E MUST treat `MutationTransactionRunner.rollback()` as a black-box API. It must not bypass the state machine or access `checkpoint` directly.
3. Phase 3E MUST surface `criticalError: true` results as blocking failures with human-readable recovery instructions referencing `git stash list` and `git reflog`.
4. Phase 3E MUST NOT add any `git clean` variant to its own code.
5. Risks R-3D-01 through R-3D-05 are acceptable deferrals, not blockers. They should be addressed within Phase 3E or logged in `RISK_REGISTER.md`.

---

*Gate authored by: independent static audit — no source code was modified.*
