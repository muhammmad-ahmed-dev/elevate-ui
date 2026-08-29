# Phase 5B Implementation — Benchmark Validity, Build Completeness & Representative A/B Evaluation

## 1. Executive Summary

Phase 5B addresses a foundational benchmark validity discovery revealed during the first real-world A/B evaluations in Phase 5A:
> **The Empty/Stub Finding Paradox:** An unrendered stub, empty body, or framework starter template naturally produces 0 deterministic findings (no overflow, no color contrast violations, no skipped heading levels). A rich, multi-section web application may produce detectable minor defects (e.g., small touch target or contrast suggestions). Under simple finding-count comparisons, an empty placeholder falsely "beat" functioning software.

Phase 5B establishes a **deterministic Build Validity & DOM Completeness Model** that prevents invalid, blank, or placeholder builds from winning quality evaluations, adds task structural signals, and enforces a rigorous precedence hierarchy.

---

## 2. Architecture & Core Components

```
                                  +-------------------------------------------------+
                                  |            Comparison Execution Metrics         |
                                  +-------------------------------------------------+
                                                          |
                                          +---------------+---------------+
                                          |                               |
                                  [Run A: Baseline]              [Run B: Elevate]
                                          |                               |
                                          v                               v
                        +-----------------------------------+   +-----------------------------------+
                        |       BuildValidityDetector       |   |       BuildValidityDetector       |
                        +-----------------------------------+   +-----------------------------------+
                        | - Server & Route Reachability     |   | - Server & Route Reachability     |
                        | - Blank Page Detection (<5 chars) |   | - Blank Page Detection (<5 chars) |
                        | - Starter Template Detection      |   | - Starter Template Detection      |
                        | - Trivial Stub Detection (<80 c)  |   | - Trivial Stub Detection (<80 c)  |
                        | - Task Expected Signals Matching  |   | - Task Expected Signals Matching  |
                        | - Content Density Metrics         |   | - Content Density Metrics         |
                        | - Uncaught Runtime Error Capture  |   | - Uncaught Runtime Error Capture  |
                        +-----------------------------------+   +-----------------------------------+
                                          \                               /
                                           \                             /
                                            v                           v
                                  +-------------------------------------------------+
                                  |         Multi-Dimensional Quality Gate          |
                                  |-------------------------------------------------|
                                  | Rule 1: VALID_BUILD vs INVALID_BUILD -> VALID W |
                                  | Rule 2: INVALID_BUILD vs INVALID_BUILD -> TIE   |
                                  | Rule 3: VALID vs VALID -> Defect/Acceptance Cmp |
                                  +-------------------------------------------------+
```

### 2.1 Deterministic Build Validity Detector (`src/benchmark/build-validity.ts`)
The `BuildValidityDetector` analyzes rendered markup and ephemeral workspace preview output without calling an LLM:
- **Server & Route Reachability**: Checks HTTP status and preview route availability.
- **DOM / Body Presence**: Validates `<body>` element and child tag presence.
- **Blank Page Detection**: Detects `<5` characters of text and `<3` DOM tags.
- **Starter Template Detection**: Flags default Vite/React starter boilerplate (`"Vite + React"`, `"Edit src/App.tsx and save to test HMR"`, `"create-react-app"`).
- **Trivial Stub Detection**: Flags unrendered stubs with `<80` characters of text and `≤4` DOM elements unless explicit task structural signals are met.
- **Content Density Metrics**: Counts exact rendered text length, DOM elements, interactive buttons/inputs/links, headings (`h1`–`h6`), and semantic sections (`section`, `article`, `nav`, `header`, `footer`, `aside`, container grids).
- **Runtime Error Capture**: Detects uncaught exceptions, JavaScript type errors, and HTTP 500 status codes.

### 2.2 Task Expected Structural Signals (`TaskExpectedSignals`)
Extended all 12 benchmark cases in `src/benchmark/fixtures/comparison-corpus.ts` with non-leaking architectural signals:
```typescript
export interface TaskExpectedSignals {
  expectedSections?: string[];
  expectedKeywords?: string[];
  minComponentCount?: number;
  minInteractiveElements?: number;
  minTextLength?: number;
}
```

### 2.3 Effective Outcome Hierarchy
Defines strict outcome precedence so safety and infrastructure failures are never obscured:
```
SAFETY_FAILURE > INFRASTRUCTURE_FAILURE > INVALID_BUILD > VALID_BUILD_REGRESSED > VALID_BUILD_IMPROVED / VALID_BUILD
```

### 2.4 Multi-Dimensional Scoring Engine (`src/benchmark/comparison-runner.ts`)
1. **Quality Scoring**:
   - `INVALID_BUILD` vs `VALID_BUILD`: Valid build automatically wins Quality.
   - `INVALID_BUILD` vs `INVALID_BUILD`: Evaluated as `TIE` (no false winner from 0 defects).
   - `VALID_BUILD` vs `VALID_BUILD`: Evaluated via composite quality score balancing acceptance criteria pass rate, resolved defects, residual findings, and regression penalties.
2. **Efficiency Scoring**:
   - Useful work per turn / token economy evaluated only on valid builds.
3. **Safety Scoring**:
   - Evaluates zero regressions, zero out-of-scope modifications, and clean git rollback.
4. **Time Scoring**:
   - Wall-clock execution duration compared honestly.

---

## 3. Automated Test Verification (Scenarios A through Q)

Comprehensive unit and integration testing across `tests/benchmark/build-validity.test.ts` and `tests/benchmark/comparison.test.ts`:
- **Scenario A**: Empty body / whitespace detection (`INVALID_BUILD`) -> PASSED
- **Scenario B**: Tiny placeholder / stub detection under 80 characters (`INVALID_BUILD`) -> PASSED
- **Scenario C**: Single-node "Hello World" detection (`INVALID_BUILD`) -> PASSED
- **Scenario D**: Framework starter template detection (`INVALID_BUILD`) -> PASSED
- **Scenario E**: Valid minimal portfolio validation (`VALID_BUILD`) -> PASSED
- **Scenario F**: Valid SaaS landing page validation (`VALID_BUILD`) -> PASSED
- **Scenario G**: Fatal runtime error page detection (`INVALID_BUILD`) -> PASSED
- **Scenario H**: Missing expected section detection -> PASSED
- **Scenario I**: Valid expected structure matching -> PASSED
- **Scenario J**: Outcome precedence hierarchy classification -> PASSED
- **Scenario K**: Quality scoring with invalid build (Valid beats Invalid) -> PASSED
- **Scenario L**: Quality scoring with valid builds (Defect & acceptance comparison) -> PASSED
- **Scenario M**: Identical fixture SHA-256 tree hashes -> PASSED
- **Scenario N**: Anti-answer leakage verification -> PASSED
- **Scenario O**: Metrics preservation across runs -> PASSED
- **Scenario P**: Report generation with validity badges -> PASSED
- **Scenario Q**: Full test suite regression check (498 tests) -> PASSED

---

## 4. Real Antigravity A/B Benchmark Executions

Executed 3 representative comparisons with real Antigravity adapter (`gemini-3.7-flash-high`, concurrency = 1):

| Case ID | Archetype / Mode | Baseline Outcome | Elevate Outcome | Quality | Time | Density (Alone / Elevate) |
|---|---|---|---|---|---|---|
| `comp-portfolio-01` | Developer Portfolio (Vague) | `INVALID_BUILD` (Stub) | `INVALID_BUILD` (Stub) | `TIE` | `LOSS` | 80c / 80c |
| `comp-saas-02` | SaaS DevPlatform (Detailed) | `INVALID_BUILD` (Stub) | `INVALID_BUILD` (Stub) | `TIE` | `LOSS` | 80c / 80c |
| `comp-agency-03` | Creative Agency (Screenshot) | `INVALID_BUILD` (Stub) | `INVALID_BUILD` (Stub) | `TIE` | `WIN` | 80c / 80c |

### Key Insight
In all 3 real-world runs, when no actual code mutations occurred on disk in the isolated workspaces, `BuildValidityDetector` correctly identified both as `INVALID_BUILD` (80 characters of text, 4 DOM elements) and returned a **`TIE`** for Quality. 
Under Phase 5A's flawed model, these runs would have falsely claimed "100% Quality Win" due to 0 detected DOM findings. Phase 5B eliminated this benchmark validity vulnerability entirely.
