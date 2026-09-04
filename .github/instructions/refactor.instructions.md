---
description: "Use when implementing, reviewing, testing, or debugging the football analysis refactor under refactor/. Covers Layer 00-06 data contracts, YBTY and Leisu source boundaries, CanonicalMatch, quantization, AI evaluation, portfolio risk, settlement audit, traceability, and handover snapshots."
name: "Football Refactor Workflow"
applyTo: "refactor/**/*.ts"
---
# Football Refactor Workflow

## Start From The Current State

- Read `refactor/AI_CODING_STANDARDS_AND_RULES.md`, `refactor/HANDOVER_AND_PROGRESS.md`, and `refactor/SYSTEM_ARCHITECTURE_AND_PIPELINE.md` before changing refactor code.
- This instruction applies to the refactor project only. For a task scoped to `refactor/`, the editable implementation and test boundary is `refactor/**` (including `refactor/tests/**`) plus explicitly named documentation files. Do not edit, test-drive changes through, or add regression coverage in `server/**`, `src/**`, `tests-ts/**`, or other legacy/runtime directories unless the user explicitly expands the scope.
- Functional similarity is not scope authorization: a legacy API or service that implements a similar concept is reference-only unless it is listed in the active snapshot's target files. If behavior must be compared, inspect it read-only and record the comparison; do not patch it.
- Before the first edit, run `git status --short` and register exact target paths in the active snapshot. After editing, run `git diff --name-only` and stop if any changed path is outside that registered boundary.
- Treat the latest active snapshot and the current TypeScript implementation as authoritative. Do not redesign completed work without a concrete failing behavior, test, or contract mismatch.
- Work on one atomic task at a time. Before editing, state the controlling code path, one falsifiable local hypothesis, one cheap discriminating check, and the smallest intended edit.
- Before editing code, register the task, target files, action plan, and `IN_PROGRESS` status in `refactor/HANDOVER_AND_PROGRESS.md`.

## Preserve Data Provenance

- Preserve the one-way dependency flow: ingestion -> canonical model -> quant engine -> AI evaluator -> portfolio risk -> settlement audit.
- YBTY is the sole source for executable betting markets, odds, raw team names, and live clock. Leisu is an auxiliary source for score verification, statistics, events, lineups, and context; never replace YBTY settlement fields with Leisu odds.
- Never infer the live minute from Leisu text-live event timestamps. Missing, conflicting, or unverified core facts must remain explicit defects and must trigger the documented downgrade or hard fuse.
- Do not turn missing data into fabricated zeroes, dates, scores, lineups, odds, probabilities, or defaults. Record defects through the shared infrastructure and preserve observability.
- Keep `CanonicalMatch` clean and uncalculated. Put deterministic derived features in Layer 03 and keep AI, risk, and settlement responsibilities in their owning layers.

## Implementation Rules

- Reuse the authoritative types, enums, domain errors, tracer, and deficit collector. Do not create duplicate contracts or parallel calculation algorithms.
- Keep core calculations pure, immutable, strongly typed, and free of `any`, unsafe casts, silent catches, and in-place mutation.
- Preserve the forward-only chain: physical evidence and lambda -> independent market probabilities and EV -> recommendation candidate -> display scoreline. Never justify a market by working backward from a predicted score.
- Preserve quarter-handicap settlement, live 0:0 reset, verified-score gates, market-specific OOS validation, and formal-recommendation separation.
- Do not edit anything under `sources/`. Keep changes minimal and limited to the registered target files.

## Validation And Handover

- After the first substantive edit, run the narrowest relevant test or type check before reading broadly or making adjacent edits.
- For refactor changes, prefer the affected verification script under `refactor/tests/`; use `npm run lint` and `npm run test:ts` when the change crosses module boundaries.
- Do not mark a task `DONE` until executable validation passes and the handover snapshot records changed files, delivered behavior, verification results, and the next concrete task.
- Distinguish `machine_candidate` from `formal_ai_recommendation`; never count unverified or non-formal records as official recommendations or backtest samples.
