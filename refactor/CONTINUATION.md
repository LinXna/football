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
- Recent-form samples now require verified team identity, competition name, time window, and valid final/half-time scores.
- Incomplete goal-distribution intervals are rejected rather than silently becoming a usable uniform prior; inconsistent standings and one-sided lineups are also rejected.
- Live momentum windows now use minute coordinates from the Leisu segment metadata and are truncated at the captured YBTY minute; missing interval metadata is research-only and audit weight 0.
- Verified red-card multipliers now flow from M3 physical stats through UnifiedMatchState into M4 residual lambda; missing red-card stats remain neutral.
- Historical OOS ingestion rejects the current research-only snapshots: 4 matches/20 snapshots/4 decisions yielded 0 accepted OOS samples and no calibration archive.
- Layer 03 event and momentum engines consume the canonical event path and no longer use production `any` or `@ts-ignore` compatibility escapes.
- Untimed Leisu preparation/system events (`minute=null`) are excluded from M3.5 decay, 5/15-minute event windows, goal/red-card timing, and event-density scoring; the audit counts only timed events as usable.
- Live market calibration now uses Leisu `odds_matrix.live` before `pregame`/`initial`; Leisu Hong Kong handicap/total odds are normalized only inside calibration, while YBTY execution markets remain unchanged.
- M4 now returns a serializable `lambda_decomposition` and the refactor page displays market base, M2-adjusted base, time/DNA factor, urgency, threat tensor, red-card multipliers, and final H/A λ.
- Refactor Layer 05 ledger persistence writes only to `refactor/runtime/formal_ledger_live.json` or `formal_ledger_prematch.json`; legacy `output/recommendation_ledger*.json` remains owned by legacy routes.
- Layer 05 risk regression now uses the refactor `RecommendedLeg` field names and fails the process on a broken assertion; B-grade duplicate exposure and deep handicap blocking are verified.
- The exact changes and validations are recorded in the active snapshot at the top of `HANDOVER_AND_PROGRESS.md`.
- Refactor and legacy runtime paths are now separated: the refactor page reads only `refactor/runtime/<mode>_batch.json`; legacy `output/*.json` remains owned by legacy pipeline routes.
- A refactor import creates a unique `batch_id`; without a current refactor batch the refactor page returns zero matches instead of loading fixture or legacy cache data.
- Formal Layer 05 records now freeze structured model probability, prediction timestamp, market/line/odds, residual lambdas, score verification, live minute, and red-card state; records without this snapshot are rejected.
- Layer 06 now has an explicit adapter that keeps pending, unverified, non-binary, or incomplete ledger records out of OOS ingestion.
- Layer 03 threat calibration no longer treats feed disagreement as a deterministic 0.45 low-goal multiplier; missing key events are weak evidence rather than zero threat, while conflicts remain confidence/candidate gates.
- The regression suite now asserts that conflicted evidence cannot reproduce the former 0.45 low-goal multiplier; the current five-match audit is approximately 1.195, 0.708, 1.026, 0.985, and 0.486 total residual λ.
- M4 no longer reapplies MUI×LIS when market calibration already contains the M2 theory prior; this removes double-counting of lineup/motivation penalties. The five-match audit now reads approximately 1.169, 0.695, 1.026, 1.050, and 0.863 total residual λ.
- Layer 03 regression now asserts that market-calibrated M4 outputs keep M2 context multipliers at 1.0, preventing future double-counting regressions.
- Layer 03 M5 defaults YBTY `full_total` lines to full-match settlement semantics in both LIVE and PREMATCH; it subtracts the verified current score once, while an explicitly marked `REMAINING_GOALS` line uses no score subtraction. The YBTY raw/clean market contracts now carry this explicit basis.
- Layer 03 M4 now marks whether market calibration used an in-play reference; in-play λ is already residual and no longer receives a second time-fraction decay. Theory-prior blending is scaled to the remaining match fraction before fusion.
- Layer 03/OOS acceptance rejects duplicate semantic snapshots (same stage, teams, minute, recommendation score, market, line and odds) even when record IDs differ; the current runtime still has 0 accepted OOS samples.
- Settlement/parlay acceptance fixed an obsolete `current_odds` field reference; parlay settlement now uses `ParlayLegResult.odds` and passes all 18 assertions.
- Layer 03 now emits an explicit `production_gate` separating calculation readiness from formal candidate readiness. Calculation can be `PRODUCTION_READY`, `RESEARCH_ONLY`, or `BLOCKED`; formal candidates remain `OOS_LOCKED` until a matching VALIDATED profile exists.
- The refactor system exposes isolated `GET /api/refactor/formal-ledger`; the obsolete manual `/api/refactor/formal-ledger/verified-score` endpoint was removed. LIVE score verification now passes when imported YBTY and Leisu scores agree, and each page match shows its Layer 03 production gate.

## Next Atomic Task

Next, validate the formal-ledger read endpoint and per-match production-gate badges against imported LIVE/PREMATCH batches. Only after the calculation gate is production-ready should formal AI records and verified results be used for OOS calibration. Until then no `VALIDATED` calibration profile may be created.

After that, audit live-minute window semantics, red-card multipliers into M4, market timeline separation, and OOS backtesting one atomic issue at a time.

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
