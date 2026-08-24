# Phase 3B Implementation: Patch Provider + Structured Patch Generation

**Status:** COMPLETE  
**Date:** 2026-08-24  
**Tests:** 215/215 passing (124 new Phase 3B tests)  
**Phase 3B is READ-ONLY. No application source files are mutated.**

---

## 1. PatchProvider Interface

**File:** [`src/agent/patch/types.ts`](file:///c:/freespace/Elevate/src/agent/patch/types.ts)

```typescript
export interface PatchProvider {
  readonly name: string;
  readonly modelName: string;
  generatePatch(request: PatchGenerationRequest): Promise<PatchGenerationResult>;
}
```

**Contract (all providers must honour):**
- Must NOT write to disk
- Must NOT apply the patch
- Must NOT commit to Git
- Must return a structured `PatchGenerationResult` even on failure
- Must never log API keys

### PatchGenerationRequest

| Field | Purpose |
|-------|---------|
| `requestId` | ISO UUID for logging |
| `recommendation` | `MutationRecommendation` being addressed |
| `patchPlan` | Phase 3A `PatchPlan` constraining the mutation |
| `relevantSource` | `SourceFileContext[]` — pre-filtered, safe source content only |
| `relevantEvidence` | Sanitised DOM/CSS evidence from Phase 2 |
| `screenshots?` | Base64 images for multimodal providers |
| `providerName` / `modelName` | For logging (never contain API keys) |

### PatchGenerationResult

| Field | Purpose |
|-------|---------|
| `success` | Whether a usable patch was produced |
| `patch?` | Raw unified-diff text (Phase 3C parses/validates this) |
| `patchHash?` | SHA-256 of the patch for `MutationTransaction.patchHash` |
| `provider` / `model` | Logged metadata |
| `changedFilesClaimed` | Files the model claimed to touch (⚠️ Phase 3C is authoritative) |
| `reasoningSummary` / `expectedImpact` | Human-readable description |
| `risk` / `confidence` | Model self-assessment |
| `rawMetadata?` | Safe metadata (no API keys, no full source) |
| `error?` | Structured `PatchProviderError` when `success=false` |
| `durationMs` | Wall-clock time |

---

## 2. Provider Implementations

### ClaudePatchProvider

**File:** [`src/agent/patch/providers/claude.ts`](file:///c:/freespace/Elevate/src/agent/patch/providers/claude.ts)

- Calls `https://api.anthropic.com/v1/messages`
- `anthropic-version: 2023-06-01`
- `max_tokens: 4096`
- API key: constructor → `ELEVATE_PATCH_API_KEY` → `ANTHROPIC_API_KEY`
- Model: constructor → `ELEVATE_PATCH_MODEL` → `"claude-sonnet-4-6"`
- Default timeout: 60 000 ms (configurable)
- All HTTP error codes mapped to structured `PatchProviderErrorKind`

### GeminiPatchProvider

**File:** [`src/agent/patch/providers/gemini.ts`](file:///c:/freespace/Elevate/src/agent/patch/providers/gemini.ts)

- Calls `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- Temperature: 0.1 (deterministic code generation)
- `responseMimeType: "application/json"`
- API key: constructor → `ELEVATE_PATCH_API_KEY` → `GEMINI_API_KEY`
- Model: constructor → `ELEVATE_PATCH_MODEL` → `"gemini-1.5-pro"`
- API key placed in URL query parameter (never in logs/headers)

### MockPatchProvider

**File:** [`src/agent/patch/providers/mock.ts`](file:///c:/freespace/Elevate/src/agent/patch/providers/mock.ts)

10 deterministic test scenarios:

| ID | Scenario | Description |
|----|----------|-------------|
| A | `valid_single_file` | Valid JSX/Tailwind patch, 1 file |
| B | `valid_multi_file` | Valid patch, 2 files (component + CSS module) |
| C | `malformed_patch` | Syntactically malformed diff text (Phase 3C will reject) |
| D | `unauthorized_file` | Claims a file outside allowedFiles (Phase 3C will reject) |
| E | `protected_file` | Claims package.json (Phase 3C will reject) |
| F | `hook_modification` | Contains `useState` change (Phase 3C will reject) |
| G | `file_deletion` | Contains `/dev/null` deletion header (Phase 3C will reject) |
| H | `empty_response` | Provider signals no-op with empty patch + non-empty summary |
| I | `provider_error` | Returns `success=false, error.kind="provider_unavailable"` |
| J | `timeout` | Returns `success=false, error.kind="timeout"` |

---

## 3. Configuration

Configuration precedence documented in [`src/agent/patch/selector.ts`](file:///c:/freespace/Elevate/src/agent/patch/selector.ts):

```
CLI providerOverride
  → ELEVATE_PATCH_PROVIDER env var
    → default: "claude"

CLI modelOverride
  → ELEVATE_PATCH_MODEL env var
    → provider default (claude-sonnet-4-6 / gemini-1.5-pro)
```

**Recommended Phase 3 development config:**
```bash
ELEVATE_PATCH_PROVIDER=claude
ELEVATE_PATCH_MODEL=claude-sonnet-4-6
```

**Factory:**
```typescript
const provider = selectPatchProvider({
  providerOverride: "claude",
  modelOverride: "claude-sonnet-4-6",
});
```

---

## 4. Prompt Design

**File:** [`src/agent/patch/prompt.ts`](file:///c:/freespace/Elevate/src/agent/patch/prompt.ts)

The prompt contains an embedded 17-rule constraint block (`MUTATION_CONSTRAINT_BLOCK`) that is identical for all providers:

**Forbidden by the prompt:**
1. Modifying files outside the authorised list
2. Touching components outside the recommendation
3. React hook logic changes (`useState`, `useEffect`, etc.)
4. State management code (Redux, Zustand, Jotai, Recoil)
5. API calls, network requests
6. Server actions, server-only code
7. Authentication/authorization code
8. Database queries / ORM
9. Routing changes
10. External package imports (no new dependencies)
11. `package.json`, `tsconfig.json`, configuration files
12. `.env` or environment configuration
13. Full file replacement (only unified diff)
14. Exported function signature changes
15. Unrelated refactors
16. Verbosity (diff must be minimal)

**Structural requirements:**
- Source files appear with **relative paths only** — absolute paths are never sent to providers
- Evidence object is sanitised: `apiKey`, `api_key`, `secret`, `password`, `token`, `credential`, `authorization`, `privateKey`, `private_key` are stripped by case-insensitive key match
- Long evidence strings (>500 chars) are truncated
- Provider is required to return a valid JSON object (no markdown prose)

---

## 5. Source Context Selection

**File:** [`src/agent/patch/context.ts`](file:///c:/freespace/Elevate/src/agent/patch/context.ts)

`SourceContextBuilder` applies three independent exclusion layers (defence-in-depth):

| Layer | What it checks | Example exclusions |
|-------|---------------|-------------------|
| 1. Protected-path registry | Re-checks `isProtectedPath()` (Phase 3A) | `package.json`, `.env`, API routes, auth |
| 2. Context-exclusion patterns | Path prefixes and file extensions | `node_modules/`, `.next/`, `dist/`, `.png`, `.woff2` |
| 3. Basename secrets | Basename contains `secret`, `credential`, `private-key`; starts with `.env` | `.env.production`, `my-secret.json` |

Additional guards:
- Only files in `PatchPlan.allowedFiles` are ever considered
- Non-absolute paths are rejected
- Files that cannot be read are skipped with structured errors (no throws)
- Individual files capped at 64 KB
- Maximum of 3 files per context (configurable)

---

## 6. Response Schema

**File:** [`src/agent/patch/validation.ts`](file:///c:/freespace/Elevate/src/agent/patch/validation.ts)

`validatePatchResponse()` validates structure only (**Phase 3B boundary**):

```json
{
  "patch": "<unified diff text>",
  "files": ["<relative/path>"],
  "summary": "<one sentence>",
  "expectedImpact": "<one sentence>",
  "risk": "low" | "medium" | "high",
  "confidence": 0.0
}
```

**Accepted:**
- `patch` can be empty string when `summary` is non-empty (provider no-op signal)
- Markdown code fences (`\`\`\`json`) are stripped automatically

**Rejected:**
- Empty or whitespace-only response → `empty_patch`
- Non-JSON text → `malformed_response`
- JSON array at root → `invalid_schema`
- Missing required fields → `invalid_schema`
- Invalid `risk` value → `invalid_schema`
- `confidence` outside `[0, 1]` → `invalid_schema`
- Non-string `patch` or non-array `files` → `invalid_schema`
- Empty `patch` AND empty `summary` → `empty_patch`

> [!IMPORTANT]
> `validatePatchResponse` does NOT parse the unified diff syntax.
> It does NOT check which files the diff touches.
> It does NOT enforce protected-path rules on the patch content.
> **Those are Phase 3C responsibilities.**

---

## 7. Error Handling

| Error Kind | Trigger |
|-----------|---------|
| `auth_error` | HTTP 401 / 403 |
| `rate_limit` | HTTP 429 |
| `provider_unavailable` | HTTP 5xx |
| `network_error` | fetch rejection, ECONNREFUSED |
| `timeout` | AbortError (AbortController) |
| `malformed_response` | Non-JSON or unparseable response |
| `invalid_schema` | JSON with missing/wrong fields |
| `empty_patch` | Empty response or silent give-up |
| `configuration_error` | No API key configured |
| `unknown` | Unexpected errors |

All errors produce a structured `PatchGenerationResult` with `success=false`. Provider errors never mutate files.

---

## 8. Security / Privacy Behaviour

| Concern | Implementation |
|---------|---------------|
| API keys in prompts | Never. Keys read from env/constructor only. |
| API keys in logs | `logger` calls log only provider name, model, rec ID, hash, latency. |
| API keys in results | `rawMetadata` explicitly excludes key fields. |
| `.env` files in context | Excluded at both protected-path and context-exclusion layers. |
| Absolute paths to provider | Relative paths only in prompts. |
| Secret evidence fields | Stripped by `sanitiseEvidence()` (case-insensitive key match). |
| Source truncation | Files capped at 64 KB; evidence strings capped at 500 chars. |
| Out-of-root paths | `isProtectedPath()` rejects paths escaping project root. |

---

## 9. Tests

| Test file | Tests | Coverage |
|-----------|-------|---------|
| `tests/agent/hash.test.ts` | 4 | SHA-256 determinism, empty patch, sensitivity |
| `tests/agent/validation.test.ts` | 22 | All valid and invalid response shapes |
| `tests/agent/context.test.ts` | 20 | Exclusion layers, .env security, protected paths, isSafeForContext |
| `tests/agent/prompt.test.ts` | 18 | Constraint block, evidence sanitisation, absolute-path exclusion |
| `tests/agent/selector.test.ts` | 10 | 3-tier precedence, normalisation, class instantiation |
| `tests/agent/mock-provider.test.ts` | 18 | All 10 scenarios + interface compliance + read-only guarantee |
| `tests/agent/providers.test.ts` | 15 | Claude/Gemini: no-key, HTTP errors, network errors, timeout, malformed |
| `tests/agent/pipeline.test.ts` | 9 | Full pipeline, read-only (mtime check), allowedFiles enforcement |

**No test depends on a real cloud API key.** All network calls are intercepted with `vi.stubGlobal` / mock `fetch`.

---

## 10. Validation Results

| Gate | Result |
|------|--------|
| `npm run typecheck` | ✅ 0 errors |
| `npm run lint` | ✅ 0 warnings |
| `npm test` | ✅ **215/215 tests passing** (was 91, +124 new) |
| `npm run build` | ✅ Clean |
| Previous 91 tests | ✅ All still passing |
| Application source files mutated | ❌ None |
| Git state changed by Phase 3B | ❌ None |

---

## 11. Known Limitations

1. **`changedFilesClaimed` is untrusted** — the provider's self-reported file list is included for logging only. Phase 3C parses the actual diff text to determine which files are truly modified.

2. **Unified diff syntax is not parsed in Phase 3B** — `validatePatchResponse` confirms the field is a string; Phase 3C validates header format, hunk structure, and context lines.

3. **No AST analysis in Phase 3B** — whether a diff contains React hook changes, API calls, or logic changes is enforced in Phase 3C, not here.

4. **No scope enforcement beyond schema validation** — protected-path enforcement on the diff content belongs to Phase 3C.

5. **Multi-viewport screenshots** — the `screenshots` field in `PatchGenerationRequest` is typed but no provider currently uses it for patch generation (only the analysis heuristic providers do).

---

## 12. Exact Prerequisites for Phase 3C

Phase 3C (**Patch Scope Enforcement & Application**) requires:

1. **Unified diff parser** — Parse `--- a/` / `+++ b/` headers and hunks to extract the exact file set the patch touches.

2. **Protected-path enforcement on parsed diff** — Every file path in the parsed diff must be checked against `isProtectedPath()`. If any protected path appears, the patch must be rejected before application.

3. **Scope validation against PatchPlan** — Parsed diff file set must be a subset of `PatchPlan.allowedFiles`. Use `PatchPlanner.validatePatchScope()` with the parsed file list (not `changedFilesClaimed`).

4. **Hook/logic change detection** — Static check on diff hunks: presence of `useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`, `fetch(`, `async`, `await`, route handlers, server actions in `+` lines should trigger rejection or human approval.

5. **File count and line-change count enforcement** — `PatchPlan.maxFilesAllowed` and `PatchPlan.maxLinesChanged` must be enforced against the parsed diff.

6. **Patch application** — Apply via `git apply --check` first (dry-run), then `git apply` only if dry-run passes. Never apply directly to disk without the git safety layer.

7. **MutationTransaction integration** — Record `patchHash`, `filesModifiedByMutation`, `filesCreatedByMutation` accurately from the applied diff, not from `changedFilesClaimed`.

8. **Post-application verification** — Run `SafetyVerifier` (typecheck + build) immediately after application.

Phase 3C may re-use from Phase 3B:
- `PatchGenerationResult` (input)
- `PatchPlan` / `PatchPlanner.validatePatchScope()` (scope check)
- `isProtectedPath()` (path guard)
- `hashPatch()` (traceability)
- `MutationTransaction` type (audit trail)
