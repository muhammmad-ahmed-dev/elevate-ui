# Elevate: Risk Register & Countermeasures

## 15. Security Risks

| Risk | Description | Mitigation Strategy |
|---|---|---|
| **Data Privacy / IP Exposure** | Audit passes send project screenshots, DOM structures, and potentially component source code to third-party vision-model APIs. | Publish a clear data-handling policy. Offer a "local-only" mode (deterministic checks only) for privacy-sensitive users. |
| **Autonomous Code Mutation Security** | LLM-authored patches might introduce subtle security flaws (e.g., XSS vulnerabilities) that pass build and DOM smoke tests but are unsafe. | Require human review/approval gate before merge. Keep CLI changes uncommitted until the user explicitly confirms them. |
| **Local Command Execution Risks** | The tool relies on running build commands (`tsc`, Next.js build). An attacker (or hallucinating LLM) could craft patches that attempt arbitrary command execution via npm scripts. | Restrict execution strictly to pre-defined framework build and typecheck commands. Never execute LLM-generated shell commands. |

## Operational & Market Risks (from Dossier Section 17)

| Risk | Description | Mitigation Strategy |
|---|---|---|
| **Foundation Model Improvement** | Next-gen models natively generate higher-quality UI, eroding the need for a separate refinement tool. | Position Elevate as a continuous verification / CI quality gate. Even strong models benefit from pixel-regression testing. |
| **Prompt-Skill Dominance** | A popular free "taste" skill captures developer mindshare as the default fix for "AI slop". | Position Elevate as the execution/verification layer that runs alongside skills, not as a replacement. |
| **Developer Distrust of Edits** | Developers fear the tool corrupting their project structure, dropping state, or deleting non-UI logic. | Emphasize Git-checkpoint rollback guarantees. Show human-readable diffs before committing. Use strict AST-boundary guards. |
| **Benchmark Panel Cost & Recruitment** | The proposed 100+ professional blind-review panel is costly and logistically complex. | Scope a smaller pilot panel (15-20 paid reviewers via freelance platforms) to validate early metrics before scaling. |
| **Benchmark Dataset Provenance** | Generating the 80-app dataset using outputs from other tools (Claude, Cursor, Lovable) risks copyright or licensing issues. | Generate dataset strictly from original prompts run by the founder, retaining ownership of the output apps rather than sourcing external users' apps. |
| **Pricing Validation Gap** | Initial ICP willingness-to-pay ($15-25/mo) does not bridge with proposed Team tier ($79/mo), and per-run API costs (vision model) could destroy margins on "unlimited" tiers. | Meter usage or cap passes for early versions. Model real API costs before cementing pricing. Conduct explicit pricing surveys. |
