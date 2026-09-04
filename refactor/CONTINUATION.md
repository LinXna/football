# Refactor Continuation Checkpoint

> This is the short cold-start entry for any AI or account taking over this repository.
> The full historical record remains in `HANDOVER_AND_PROGRESS.md`.

## Current State

- Layer 00-02 normal-path verification: passed.
- Layer 02 alignment gate: fixed; only `MATCHED_BY_ALIAS` and `MATCHED_AUTO` may enter Layer 03.
- Layer 03 integrity sweep completed through dynamic Poisson support bounds.
- Layer 05→06 settled-record adapter implemented and validated; incomplete records are rejected explicitly.
- Layer 05 recommendation fields remain separate from post-match/OOS fields; Layer 06 consumes an explicit settled envelope.
- Layer 06 settled records now carry settlement-market provenance; market mismatches are rejected before OOS ingestion.
- Layer 06 settled records now carry settlement-basis provenance; OOS observed goals use the declared settlement window.
- Layer 06 ingestion rejects duplicate sample IDs, prediction timestamps outside the prediction window, and settlements after archive generation.
- OOS archives expose per-market `global_profiles`; profile buckets preserve market and LIVE/PREMATCH isolation.
- OOS profile fallback is explicitly ordered: validated team, validated league bucket, then validated same-market global profile.
- OOS lambda calibration is now market-bound: `TOTAL_GOALS_MAIN` calibration changes totals EV only, while Asian-handicap EV retains the raw Poisson input.
- Secondary-line EV remains visible as raw mathematical output, but only explicitly supported main-market OOS profiles can unlock machine candidates; secondary lines are not silently promoted.
- Layer 04 statutory alignment rejects secondary-line markets, so AI cannot re-promote Layer 03-excluded raw EV into a formal recommendation.
- Formal AI legs must also match a Layer 03 `machine_candidate_signals` entry by market, line, direction, and current odds.
- Layer 05 persistence re-checks A/B grade, confidence >=70, AI-leg membership, and Layer 03 candidate membership before writing the formal ledger.
- Layer 06 adapter independently re-checks formal grade/confidence before accepting a settled envelope; nested Layer 05 settlement data is not authoritative.
- Layer 06 ingestion accepts only records carrying the adapter-issued `settled_record_provenance` marker; direct normalized objects cannot create OOS samples.
- OOS archives carry `archive_provenance: 'OOS_ARCHIVE_BUILDER_V1'`; JSON-reloaded archives without this marker are rejected before profile selection.
- OOS profile selection currently supports only `schema_version=1`; missing or unsupported archive versions are hard-rejected.
- Final Layer 03–06 targeted regression and the 00–03 dual-track integration suite pass; no further planned feature audit remains.
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

No further planned feature audit remains; only commit/release steps are pending if requested.

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
