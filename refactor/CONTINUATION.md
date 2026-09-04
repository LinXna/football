# Refactor Continuation Checkpoint

> This is the short cold-start entry for any AI or account taking over this repository.
> The full historical record remains in `HANDOVER_AND_PROGRESS.md`.

## Current State

- Layer 00-02 normal-path verification: passed.
- Layer 02 alignment gate: fixed; only `MATCHED_BY_ALIAS` and `MATCHED_AUTO` may enter Layer 03.
- Layer 03 integrity sweep completed through dynamic Poisson support bounds.
- Latest verified commands:
  - `npx tsx refactor/tests/verify_quant_engine.ts`
  - `npx tsx refactor/tests/verify_full_pipeline_00_03.ts`
  - `npm run test:ts` (71/71 passed)
  - `npx tsc --noEmit`
  - `git diff --check`

## Completed Fixes

- Unconfirmed, unmatched, or swapped matches are blocked before Layer 03.
- Asian-handicap EV traverses the generated Poisson grid instead of a fixed 0-7 range.
- Main forward Poisson projections now use a lambda-based dynamic support bound for the matrix and Top score enumeration.
- H2H records without complete final scores are excluded from valid samples instead of becoming fake 0-0 records.
- Layer 03 event and momentum engines consume the canonical event path and no longer use production `any` or `@ts-ignore` compatibility escapes.
- The exact changes and validations are recorded in the active snapshot at the top of `HANDOVER_AND_PROGRESS.md`.

## Next Atomic Task

Audit Layer 03 market-line coverage and OOS market separation. Confirm every YBTY main/sub line is represented and that raw EV, validated OOS EV, and machine candidates remain distinct. Do not change formulas until a failing assertion or contract mismatch is demonstrated.

After that, audit dynamic Poisson support bounds, market-line coverage, OOS market separation, and EPI/trinity calibration one atomic issue at a time.

## Resume Protocol

1. Read `AGENTS.md`, this file, `refactor/AI_CODING_STANDARDS_AND_RULES.md`, `refactor/HANDOVER_AND_PROGRESS.md`, and `refactor/SYSTEM_ARCHITECTURE_AND_PIPELINE.md`.
2. Check `git status --short`; preserve unrelated user changes and never edit `sources/`.
3. Read the active snapshot, not the chat history, to determine whether the previous task is `IN_PROGRESS` or `DONE`.
4. If `IN_PROGRESS`, continue only the listed target files and rerun the listed validation. If `DONE`, start the next atomic task and register a new `IN_PROGRESS` snapshot before editing.
5. Keep each checkpoint durable: update the active snapshot after a meaningful step, record the exact command and result, and mark `DONE` only after executable validation passes.
6. If the session is interrupted, leave the active snapshot truthful. Never mark work complete merely because a tool call or partial edit succeeded.

## Do Not Infer From Chat

- `WATCH`, `RESEARCH`, raw +EV, and Layer 03 output are not formal recommendations.
- YBTY remains the execution source for markets, odds, raw team names, and live clock.
- Leisu text-live timestamps are event times, never the live clock.
- Missing or unverified facts remain defects; do not invent scores, times, odds, lineups, or historical samples.
