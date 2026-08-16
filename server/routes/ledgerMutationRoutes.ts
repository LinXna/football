import type express from 'express';
import crypto from 'crypto';
import { DATA_FILES } from '../dataFiles';
import { readJsonFile, requireJsonWrites } from '../jsonStore';
import { isPlausibleHalfTimeScore, parseScoreFields, parseValidScore } from '../services/scoreValidation';

export interface LedgerMutationDependencies {
  recommendationKey(item: any): string;
  hasExplicitBetDirection(item: any): boolean;
  sanitizeParlayLeg(leg: any): any;
  hasUsableRecommendation(recommendation: any): boolean;
  matchIdentity(item: any): string;
  directionIdentity(item: any): string;
  areSameMatch(left: any, right: any): boolean;
}

/**
 * Low-risk ledger mutations. Multi-file review/archive workflows remain in the
 * legacy composition root until their transaction rules are moved as a unit.
 */
export function registerLedgerMutationRoutes(app: express.Express, deps: LedgerMutationDependencies): void {
  app.post('/api/ledger/delete', (req, res) => {
    try {
      const clearAll = req.body?.clearAll === true;
      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.map((value: unknown) => String(value || '').trim()).filter(Boolean)
        : [];
      if (!clearAll && ids.length === 0) {
        return res.status(400).json({ error: 'Provide item ids or set clearAll to true' });
      }

      const ledger = readJsonFile<any[]>(DATA_FILES.ledger.current, []);
      const nextLedger = clearAll
        ? []
        : ledger.filter((item: any) => !new Set(ids).has(String(item?.id || '')));
      requireJsonWrites([[DATA_FILES.ledger.current, nextLedger]]);
      res.json({ success: true, ledger: nextLedger, removed: ledger.length - nextLedger.length });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to update ledger' });
    }
  });

  app.post('/api/ledger/archive', (req, res) => {
    try {
      const ledger = readJsonFile<any[]>(DATA_FILES.ledger.current, []);
      if (ledger.length === 0) return res.status(400).json({ error: 'The current ledger is empty; nothing to archive' });
      const archives = readJsonFile<any[]>(DATA_FILES.ledger.archives, []);
      const snapshot = {
        id: `ledger_batch_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        name: String(req.body?.name || '').trim() || `Ledger archive ${new Date().toLocaleString('zh-CN')}`,
        archived_at: new Date().toISOString(),
        item_count: ledger.length,
        items: ledger,
      };
      archives.unshift(snapshot);
      const clearCurrent = req.body?.clear_current === true;
      const writes: Array<[string, unknown]> = [[DATA_FILES.ledger.archives, archives]];
      if (clearCurrent) writes.push([DATA_FILES.ledger.current, []]);
      requireJsonWrites(writes);
      res.json({ success: true, archive: snapshot, cleared_current: clearCurrent, ledger: clearCurrent ? [] : ledger });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to archive ledger' });
    }
  });

  app.post('/api/ledger/add-ai-assessments', (req, res) => {
    try {
      const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
      if (entries.length === 0) return res.status(400).json({ error: 'No AI assessments to save' });
      const ledger = readJsonFile<any[]>(DATA_FILES.ledger.current, []);
      let saved = 0;
      let duplicates = 0;
      const rejected: string[] = [];
      for (const entry of entries) {
        const recommendation = entry?.recommendation;
        if (!entry?.match || !recommendation?.market || recommendation.line === undefined || !Number.isFinite(Number(recommendation.odds)) || Number(recommendation.odds) <= 1 || !deps.hasExplicitBetDirection(entry)) {
          rejected.push(String(entry?.match || 'Unknown match'));
          continue;
        }
        if (ledger.some((item: any) => deps.recommendationKey(item) === deps.recommendationKey(entry))) {
          duplicates++;
          continue;
        }
        ledger.unshift({
          id: `ai_candidate_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
          created_at: new Date().toISOString(),
          match: entry.match,
          ybty_home: entry.ybty_home || '',
          ybty_away: entry.ybty_away || '',
          minute: Number(entry.minute || 0),
          score_at_recommendation: entry.score_at_recommendation || null,
          score_source: entry.score_source || 'unverified',
          score_verified: entry.score_verified === true,
          grade: entry.grade || 'C',
          model_score: Number(entry.model_score || 0),
          recommendation: {
            market: recommendation.market,
            line: recommendation.line,
            odds: Number(recommendation.odds),
            basis: recommendation.basis,
            scope: recommendation.scope,
          },
          candidate_source: 'ai_market_assessment',
          prediction_probability: Number.isFinite(Number(entry.prediction_probability))
            ? Math.max(0, Math.min(100, Number(entry.prediction_probability)))
            : 0,
          selection_method: 'ai_full_market_assessment',
          evidence: entry.evidence || [],
          risks: entry.risks || [],
          review: { status: 'pending', final_score: null, outcome: 'pending' },
          record_type: 'machine_candidate',
          formal_recommendation: false,
          start_time_beijing: entry.start_time_beijing || null,
          prediction_features: entry.prediction_features || null,
          is_parlay: false,
          parlay_legs: [],
        });
        saved++;
      }
      requireJsonWrites([[DATA_FILES.ledger.current, ledger]]);
      res.json({ success: true, saved, duplicates, rejected, ledger });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to save AI assessments' });
    }
  });

  app.post('/api/ledger/add-candidate', (req, res) => {
    try {
      const newItem = req.body;
      if (newItem?.is_parlay === true && Array.isArray(newItem.parlay_legs)) {
        newItem.parlay_legs = newItem.parlay_legs.map((leg: any) => deps.sanitizeParlayLeg(leg));
      }
      const recommendation = newItem?.recommendation;
      const predictionOnly = newItem?.prediction_only === true;
      if (!newItem?.match || !recommendation?.market || recommendation.line === undefined || (!predictionOnly && !Number.isFinite(Number(recommendation.odds)))) {
        return res.status(400).json({ error: 'A candidate requires match, market, line, and real odds unless it is prediction-only' });
      }
      if (!predictionOnly && !deps.hasExplicitBetDirection(newItem)) return res.status(400).json({ error: 'Bet direction must be explicit' });
      if (newItem?.is_parlay === true && Array.isArray(newItem.parlay_legs) && newItem.parlay_legs.some((leg: any) => !deps.hasExplicitBetDirection(leg))) {
        return res.status(400).json({ error: 'Every parlay leg must have an explicit betting direction' });
      }
      const ledger = readJsonFile<any[]>(DATA_FILES.ledger.current, []);
      const duplicate = ledger.find((item: any) => item.record_type === 'machine_candidate' && deps.recommendationKey(item) === deps.recommendationKey(newItem));
      if (duplicate) return res.status(409).json({ error: 'Duplicate backtest candidate', duplicate_id: duplicate.id });

      const candidateItem = {
        id: `candidate_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        created_at: new Date().toISOString(),
        match: newItem.match,
        ybty_home: newItem.ybty_home || newItem.match.split(' vs ')[0] || '',
        ybty_away: newItem.ybty_away || newItem.match.split(' vs ')[1] || '',
        minute: Number(newItem.minute || 0),
        score_at_recommendation: newItem.score_at_recommendation || null,
        score_source: newItem.score_source || 'unverified',
        score_verified: newItem.score_verified === true,
        grade: newItem.grade || 'C',
        model_score: Number(newItem.model_score || 0),
        recommendation: {
          market: recommendation.market,
          line: recommendation.line,
          odds: predictionOnly ? 1 : Number(recommendation.odds),
          basis: recommendation.basis,
          scope: recommendation.scope,
        },
        candidate_source: newItem.candidate_source || 'ybty_market_snapshot',
        implied_probability: Number(newItem.implied_probability || 0),
        prediction_probability: Number(newItem.prediction_probability || 0),
        prediction_only: predictionOnly,
        prediction_type: newItem.prediction_type || null,
        model_version: newItem.model_version || null,
        selection_method: newItem.selection_method || 'lowest_market_odds',
        evidence: newItem.evidence || [],
        risks: newItem.risks || [],
        review: { status: 'pending', final_score: null, outcome: 'pending' },
        record_type: 'machine_candidate',
        formal_recommendation: false,
        start_time_beijing: newItem.start_time_beijing || null,
        is_parlay: newItem.is_parlay === true && Array.isArray(newItem.parlay_legs) && newItem.parlay_legs.length >= 2,
        parlay_legs: Array.isArray(newItem.parlay_legs) ? newItem.parlay_legs : [],
        prediction_features: newItem.prediction_features || null,
      };
      ledger.unshift(candidateItem);
      requireJsonWrites([[DATA_FILES.ledger.current, ledger]]);
      res.json({ success: true, item: candidateItem });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to save candidate' });
    }
  });

  app.post('/api/ledger/add', (req, res) => {
    try {
      const newItem = req.body;
      if (!newItem?.match || !newItem?.recommendation) return res.status(400).json({ error: 'Invalid recommendation data' });
      const recommendation = newItem.recommendation;
      if (!deps.hasUsableRecommendation(recommendation)) return res.status(400).json({ error: 'A formal recommendation requires market, line, and numeric odds' });
      if (!['A', 'B'].includes(String(newItem.grade || ''))) return res.status(400).json({ error: 'A formal recommendation must be B grade or above' });
      if (!/^\d{4}-\d{2}-\d{2}/.test(String(newItem.start_time_beijing || ''))) return res.status(400).json({ error: 'A formal recommendation requires a concrete Beijing start time' });
      if (Number(newItem.minute || 0) > 0) {
        const score = newItem.score_at_recommendation;
        if (!score || !Number.isFinite(Number(score.home)) || !Number.isFinite(Number(score.away)) || newItem.score_verified !== true || !newItem.score_source || newItem.score_source === 'unverified') {
          return res.status(400).json({ error: 'A live formal recommendation requires a verified score and score source' });
        }
      }
      const ledger = readJsonFile<any[]>(DATA_FILES.ledger.current, []);
      const duplicate = ledger.find((item: any) => (item.formal_recommendation === true || item.record_type === 'formal_ai_recommendation') && deps.recommendationKey(item) === deps.recommendationKey(newItem));
      if (duplicate) return res.status(409).json({ error: 'Duplicate formal recommendation', duplicate_id: duplicate.id });

      const incomingLegs = Array.isArray(newItem.parlay_legs) ? newItem.parlay_legs.map((leg: any) => deps.sanitizeParlayLeg(leg)) : [];
      const parlayRequested = newItem.is_parlay === true || incomingLegs.length > 0 || /串\s*1|精选彩票/.test(String(recommendation.market || ''));
      if (parlayRequested && incomingLegs.length < 2) return res.status(400).json({ error: 'A formal parlay must include at least two structured legs' });
      if (incomingLegs.length > 0) {
        const invalidLeg = incomingLegs.find((leg: any) => !leg?.match || !leg?.ybty_home || !leg?.ybty_away || !deps.hasUsableRecommendation(leg) || !deps.hasExplicitBetDirection(leg) || !['A', 'B'].includes(String(leg.grade || '')) || !/^\d{4}-\d{2}-\d{2}/.test(String(leg.start_time_beijing || '')) || (Number(leg.minute || 0) > 0 && leg.score_verified !== true));
        if (invalidLeg) return res.status(400).json({ error: 'Every formal parlay leg requires an explicit direction, B+ grade, teams, market, time, odds, and verified live score', leg: invalidLeg.match });
        const matchKeys = incomingLegs.map(deps.matchIdentity);
        if (new Set(matchKeys).size !== matchKeys.length) return res.status(409).json({ error: 'A parlay cannot contain multiple markets from the same match' });
        const directionUsage = new Map<string, number>();
        for (const item of ledger) for (const leg of Array.isArray(item.parlay_legs) ? item.parlay_legs : []) {
          const key = deps.directionIdentity(leg);
          directionUsage.set(key, (directionUsage.get(key) || 0) + 1);
        }
        const overused = incomingLegs.find((leg: any) => (directionUsage.get(deps.directionIdentity(leg)) || 0) >= 1);
        if (overused) return res.status(409).json({ error: 'This direction has reached its parlay exposure limit', leg: overused.match });
      }
      const formalItem = {
        id: newItem.id || Math.random().toString(16).substring(2, 10),
        created_at: new Date().toISOString(),
        match: newItem.match,
        ybty_home: newItem.ybty_home || newItem.match.split(' vs ')[0] || '',
        ybty_away: newItem.ybty_away || newItem.match.split(' vs ')[1] || '',
        minute: newItem.minute ?? 0,
        score_at_recommendation: newItem.score_at_recommendation || null,
        score_source: newItem.score_source || 'unverified',
        score_verified: newItem.score_verified === true,
        grade: newItem.grade || 'B',
        model_score: Number.isFinite(Number(newItem.model_score)) ? Number(newItem.model_score) : 0,
        prediction_probability: Number.isFinite(Number(newItem.prediction_probability)) && Number(newItem.prediction_probability) > 0 && Number(newItem.prediction_probability) < 100
          ? Number(newItem.prediction_probability)
          : 0,
        recommendation,
        evidence: newItem.evidence || [],
        risks: newItem.risks || [],
        review: { status: 'pending', final_score: null, outcome: 'pending' },
        record_type: 'formal_ai_recommendation',
        formal_recommendation: true,
        start_time_beijing: newItem.start_time_beijing,
        is_parlay: Boolean(newItem.is_parlay || incomingLegs.length > 0),
        parlay_legs: incomingLegs,
        prediction_features: newItem.prediction_features || null,
      };
      ledger.unshift(formalItem);
      requireJsonWrites([[DATA_FILES.ledger.current, ledger]]);
      res.json({ success: true, item: formalItem });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to save formal recommendation' });
    }
  });

  app.post('/api/batch-supplement-scores', (req, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'No items provided for score supplement' });
      let ledger = readJsonFile<any[]>(DATA_FILES.ledger.current, []);
      const liveFile = readJsonFile<any>(DATA_FILES.live.decisions, { decisions: [], summary: {} });
      const prematchFile = readJsonFile<any>(DATA_FILES.prematch.decisions, { decisions: [], summary: {} });
      let updatedLedgerCount = 0;
      let updatedDecisionsCount = 0;
      for (const supplement of items) {
        const home = supplement.ybty_home || (supplement.match ? supplement.match.split(' vs ')[0] : '');
        const away = supplement.ybty_away || (supplement.match ? supplement.match.split(' vs ')[1] : '');
        const match = { match: supplement.match || `${home} vs ${away}`, ybty_home: home, ybty_away: away };
        const score = parseValidScore(supplement.final_score || supplement.score)
          || parseScoreFields(supplement.home_score, supplement.away_score);
        if (!score) return res.status(400).json({ error: 'Every score supplement requires non-negative integer home and away scores', match: match.match });
        const halfTimeScore = supplement.ht_score ? parseValidScore(supplement.ht_score) : null;
        if (supplement.ht_score && (!halfTimeScore || !isPlausibleHalfTimeScore(halfTimeScore, score))) {
          return res.status(400).json({ error: 'Half-time score must be non-negative integers and cannot exceed the final score', match: match.match });
        }
        const verified = supplement.score_verified === true;
        const source = supplement.score_source || 'user_batch_verification';
        ledger = ledger.map((item: any) => {
          if (deps.areSameMatch(match, item)) {
            updatedLedgerCount++;
            item.review = item.review || {};
            item.review.final_score = score;
            if (halfTimeScore) item.review.ht_score = halfTimeScore;
            item.review.status = 'reviewed';
            item.score_verified = verified;
            item.score_source = source;
          }
          if (Array.isArray(item.parlay_legs)) {
            let legHit = false;
            item.parlay_legs = item.parlay_legs.map((leg: any) => {
              if (!deps.areSameMatch(match, { match: leg.match, ybty_home: leg.ybty_home, ybty_away: leg.ybty_away })) return leg;
              legHit = true;
              return { ...leg, final_score: score, ht_score: halfTimeScore || leg.ht_score, score_verified: verified };
            });
            if (legHit) updatedLedgerCount++;
          }
          return item;
        });
        for (const decisionFile of [liveFile, prematchFile]) {
          if (!Array.isArray(decisionFile.decisions)) continue;
          decisionFile.decisions = decisionFile.decisions.map((decision: any) => {
            if (!deps.areSameMatch(match, decision)) return decision;
            updatedDecisionsCount++;
            const risks = verified && Array.isArray(decision.risks)
              ? decision.risks.filter((risk: unknown) => !/(?:比分.*未.*验证|score.*unverified)/i.test(String(risk)))
              : decision.risks;
            return { ...decision, score, ht_score: halfTimeScore || decision.ht_score, score_verified: verified, score_source: source, risks };
          });
        }
      }
      requireJsonWrites([[DATA_FILES.ledger.current, ledger], [DATA_FILES.live.decisions, liveFile], [DATA_FILES.prematch.decisions, prematchFile]]);
      res.json({ success: true, updatedLedgerCount, updatedDecisionsCount, ledger });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to supplement scores' });
    }
  });

  app.post('/api/ledger/update-review', (req, res) => {
    try {
      const { id, match, ybty_home, ybty_away, leg_index, final_score, ht_score, score_verified, outcome, outcome_source, parlay_legs, syncSameMatch = true } = req.body || {};
      if (!id && !match && !ybty_home && (!Array.isArray(parlay_legs) || parlay_legs.length === 0)) return res.status(400).json({ error: 'ID, match, or parlay_legs identifier is required' });
      const validFinalScore = final_score === undefined ? null : parseValidScore(final_score);
      const validHalfTimeScore = ht_score === undefined ? null : parseValidScore(ht_score);
      if (final_score !== undefined && !validFinalScore) return res.status(400).json({ error: 'Final score must contain non-negative integer home and away values' });
      if (ht_score !== undefined && (!validHalfTimeScore || !isPlausibleHalfTimeScore(validHalfTimeScore, validFinalScore))) return res.status(400).json({ error: 'Half-time score is invalid or exceeds the final score' });
      const allowedOutcomes = new Set(['win', 'loss', 'push', 'half_win', 'half_loss', 'pending', 'invalid_data']);
      if (outcome !== undefined && !allowedOutcomes.has(String(outcome))) return res.status(400).json({ error: 'Unsupported settlement outcome' });
      if (Array.isArray(parlay_legs)) {
        const invalidScoreLeg = parlay_legs.find((leg: any) => {
          const final = leg.final_score === undefined || leg.final_score === null ? null : parseValidScore(leg.final_score);
          const half = leg.ht_score === undefined || leg.ht_score === null ? null : parseValidScore(leg.ht_score);
          return (leg.final_score != null && !final) || (leg.ht_score != null && (!half || !isPlausibleHalfTimeScore(half, final)));
        });
        if (invalidScoreLeg) return res.status(400).json({ error: 'A parlay leg contains an invalid score', leg: invalidScoreLeg.match });
      }
      const normalizedParlayLegs = Array.isArray(parlay_legs) ? parlay_legs.map((leg: any) => ({
        ...leg,
        final_score: leg.final_score == null ? leg.final_score : parseValidScore(leg.final_score),
        ht_score: leg.ht_score == null ? leg.ht_score : parseValidScore(leg.ht_score),
      })) : parlay_legs;
      let ledger = readJsonFile<any[]>(DATA_FILES.ledger.current, []);
      const liveFile = readJsonFile<any>(DATA_FILES.live.decisions, { decisions: [], summary: {} });
      const prematchFile = readJsonFile<any>(DATA_FILES.prematch.decisions, { decisions: [], summary: {} });
      let updatedCount = 0;
      const updateDecisionScore = (reference: any, score: any, halfTimeScore: any, verified: boolean) => {
        for (const decisionFile of [liveFile, prematchFile]) {
          if (!Array.isArray(decisionFile.decisions)) continue;
          decisionFile.decisions = decisionFile.decisions.map((decision: any) => {
            if (!deps.areSameMatch(reference, decision)) return decision;
            const risks = verified && Array.isArray(decision.risks)
              ? decision.risks.filter((risk: unknown) => !/(?:比分.*未.*验证|score.*unverified)/i.test(String(risk)))
              : decision.risks;
            return { ...decision, score: score || decision.score, ht_score: halfTimeScore || decision.ht_score, score_verified: verified, score_source: 'parlay_leg_user_verification', risks };
          });
        }
      };
      if (id && Array.isArray(normalizedParlayLegs) && normalizedParlayLegs.length > 0) {
        ledger = ledger.map((item: any) => {
          if (item.id !== id) return item;
          updatedCount++;
          return { ...item, is_parlay: true, parlay_legs: normalizedParlayLegs, review: { ...(item.review || {}), status: 'reviewed' }, score_verified: normalizedParlayLegs.every((leg: any) => leg.score_verified === true) };
        });
        if (syncSameMatch) for (const leg of normalizedParlayLegs) {
          if (!leg.final_score && !leg.ht_score) continue;
          const home = leg.ybty_home || String(leg.match || '').split(' vs ')[0] || '';
          const away = leg.ybty_away || String(leg.match || '').split(' vs ')[1] || '';
          const reference = { match: leg.match || `${home} vs ${away}`, ybty_home: home, ybty_away: away };
          ledger = ledger.map((item: any) => {
            if (item.id !== id && deps.areSameMatch(reference, item)) {
              item.review = { ...(item.review || {}), final_score: leg.final_score || item.review?.final_score, ht_score: leg.ht_score || item.review?.ht_score, status: 'reviewed' };
              item.score_verified = leg.score_verified === true;
            }
            if (item.id !== id && Array.isArray(item.parlay_legs)) item.parlay_legs = item.parlay_legs.map((otherLeg: any) => deps.areSameMatch(reference, otherLeg) ? { ...otherLeg, final_score: leg.final_score || otherLeg.final_score, ht_score: leg.ht_score || otherLeg.ht_score, score_verified: leg.score_verified === true } : otherLeg);
            return item;
          });
          updateDecisionScore(reference, leg.final_score, leg.ht_score, leg.score_verified === true);
        }
      } else {
        const target = ledger.find((item: any) => item.id === id || (match && item.match === match));
        const home = ybty_home || target?.ybty_home || (match ? match.split(' vs ')[0] : '');
        const away = ybty_away || target?.ybty_away || (match ? match.split(' vs ')[1] : '');
        const reference = { match: match || target?.match || `${home} vs ${away}`, ybty_home: home, ybty_away: away };
        ledger = ledger.map((item: any) => {
          if (syncSameMatch ? deps.areSameMatch(reference, item) : item.id === id) {
            updatedCount++;
            item.review = item.review || {};
            if (validFinalScore) { item.review.final_score = validFinalScore; item.review.status = 'reviewed'; }
            if (validHalfTimeScore) { item.review.ht_score = validHalfTimeScore; item.review.status = 'reviewed'; }
            if (outcome && item.id === id) {
              item.review.outcome_history = Array.isArray(item.review.outcome_history) ? item.review.outcome_history : [];
              if (item.review.outcome) item.review.outcome_history.push({ outcome: item.review.outcome, source: item.review.outcome_source || 'legacy', recorded_at: item.review.outcome_recorded_at || null });
              item.review.outcome = outcome;
              item.review.outcome_source = String(outcome_source || 'manual_user_confirmed');
              item.review.outcome_recorded_at = new Date().toISOString();
            }
            if (score_verified !== undefined) item.score_verified = score_verified === true;
          }
          if (Array.isArray(item.parlay_legs)) {
            let changed = false;
            item.parlay_legs = item.parlay_legs.map((leg: any) => {
              const matches = deps.areSameMatch(reference, leg) || (leg_index !== undefined && leg.leg_index === leg_index && item.id === id);
              if (!matches) return leg;
              changed = true;
              return { ...leg, final_score: validFinalScore || leg.final_score, ht_score: validHalfTimeScore || leg.ht_score, score_verified: score_verified === undefined ? leg.score_verified === true : score_verified === true };
            });
            if (changed) updatedCount++;
          }
          return item;
        });
        if (syncSameMatch && (validFinalScore || validHalfTimeScore)) {
          updateDecisionScore(reference, validFinalScore, validHalfTimeScore, score_verified === true);
        }
      }
      requireJsonWrites([[DATA_FILES.ledger.current, ledger], [DATA_FILES.live.decisions, liveFile], [DATA_FILES.prematch.decisions, prematchFile]]);
      res.json({ success: true, updatedCount, ledger });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to update review' });
    }
  });
}
