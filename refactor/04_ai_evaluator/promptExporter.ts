import { CanonicalMatch } from '../02_canonical_model/types.js';
import { MatchStage } from '../02_canonical_model/enums.js';
import { extractAiEvaluationBrief } from '../02_canonical_model/canonicalMatchAssembler.js';
import { calculateQuantitativeFeatures, isMatchQuantEligible } from '../03_quant_engine/index.js';
import { parseAsianHandicapLine, invertHandicapString } from '../03_quant_engine/devigCalculator.js';
import { buildSystemPrompt } from './promptBuilder.js';
import { EvaluatorPayload, EvaluatorLineupMatrix, EvaluatorTeamProfiling } from './types.js';

export function generateRefactoredPrompt(
  canonicalMatches: CanonicalMatch[], 
  mode: 'live_eval' | 'prematch_eval' | 'parlay_check' = 'live_eval'
): { finalPrompt: string; matchCount: number } {
  const validPayloads: EvaluatorPayload[] = [];
  
  for (const match of canonicalMatches) {
    const eligibility = isMatchQuantEligible(match);
    if (!eligibility.eligible) {
      console.warn(`[PromptExporter] Skipping match ${match.canonical_id}: ${eligibility.reason}`);
      continue;
    }
    let quantFeatures;
    try {
      quantFeatures = calculateQuantitativeFeatures(match);
    } catch (err: any) {
      console.warn(`[PromptExporter] Failed to compute quant for match ${match.canonical_id}:`, err?.message || err);
      continue;
    }
    const aiBrief = extractAiEvaluationBrief(match);

    const tactical_phase_transitions: string[] = [];
    if (match.timing?.stage === MatchStage.LIVE) {
      if (quantFeatures.timeline) {
        const elapsed = match.timing.minute ?? 0;
        const domSide = quantFeatures.timeline.dominance_side === 'home' ? '主队' : (quantFeatures.timeline.dominance_side === 'away' ? '客队' : '均衡');
        if (elapsed <= 15) {
           tactical_phase_transitions.push(`[0'-15'] 比赛初段定调 (当前统治方: ${domSide})`);
        }
        if (elapsed > 15) {
          tactical_phase_transitions.push(`[16'-${elapsed}'] 战术相变 (根据当前动量：5分钟短斜率 ${quantFeatures.timeline.slope_5m.toFixed(1)}，15分钟净积分 ${quantFeatures.timeline.integral_15m.net.toFixed(1)}，当前统治方: ${domSide})`);
        }
        if (quantFeatures.timeline.is_sustained_siege) {
          tactical_phase_transitions.push(`[当前阶段] 持续围攻态势 (BDI压制指数达到 ${quantFeatures.battlefield_dominance_index.toFixed(2)})`);
        }
      } else {
        tactical_phase_transitions.push(`[警告] 缺乏实时战术相变与动量数据`);
      }
    }

    // 提取关键时序事件 (进球、红黄牌、点球、换人等)，注入战术事件线
    if (match.reference?.timeline_events && match.reference.timeline_events.length > 0) {
      const keyEvents = match.reference.timeline_events.filter(e => 
        !e.is_cancelled && (
          e.canonical_type.includes('GOAL') ||
          e.canonical_type.includes('CARD') ||
          e.canonical_type.includes('PENALTY') ||
          e.canonical_type.includes('VAR') ||
          e.canonical_type.includes('SUB')
        )
      );

      for (const evt of keyEvents) {
        const timeStr = evt.display_time || (evt.minute ? `${evt.minute}'` : '时段未知');
        const sideStr = evt.side === 'home' ? '主队' : (evt.side === 'away' ? '客队' : '中立');
        const desc = evt.text ? ` - ${evt.text}` : '';
        const player = evt.player_name ? ` (${evt.player_name})` : '';
        tactical_phase_transitions.push(`[${timeStr}] [${sideStr}] ${evt.type_name}${player}${desc}`);
      }
    }

    const hasLineupData = !!match.reference?.lineups;
    const lineupImpact = quantFeatures.context.lineup_impact;
    const lineupStatus = lineupImpact?.lineup_status ?? (hasLineupData ? 'CONFIRMED' : 'NOT_ANNOUNCED');
    const isLineupConfirmed = lineupImpact?.is_lineup_confirmed ?? (hasLineupData && lineupStatus === 'CONFIRMED');

    const pStats = quantFeatures.physical_stats;
    const hasDA = !!pStats.available_metrics.dangerous_attacks;
    const homeAnalytics = quantFeatures.context.recent_form_analytics?.home;
    const awayAnalytics = quantFeatures.context.recent_form_analytics?.away;
    const hasHistoricalForm = !!(homeAnalytics && homeAnalytics.sample_count > 0 && awayAnalytics && awayAnalytics.sample_count > 0);

    const resolveLineupStatusDesc = (side: 'home' | 'away') => {
      if (!hasLineupData || lineupStatus === 'NOT_ANNOUNCED') {
        return "首发未定，按 C 级风控处理 (Lineup Not Announced - C Grade Risk Control)";
      }
      const lis = side === 'home' ? lineupImpact.home_lis : lineupImpact.away_lis;
      if (lineupStatus === 'PROJECTED') {
        return lis < 0.75
          ? `预测首发 (未获官方确认, 存在轮换可能, LIS: ${lis})`
          : `预测首发 (主力框架预计在列, 未获官方最终确认, LIS: ${lis})`;
      }
      return lis < 0.75
        ? `官方首发已确认 (战意/轮换影响，关键主力缺席，LIS: ${lis})`
        : `官方首发已确认 (主力框架完整，LIS: ${lis})`;
    };

    const lineup_value_matrix: EvaluatorLineupMatrix = {
      lineup_status: lineupStatus,
      is_lineup_confirmed: isLineupConfirmed,
      home: { 
        total_value_eur: (!hasLineupData || quantFeatures.context.lineup_impact.home_market_value_num === 0) ? '未知' : `${quantFeatures.context.lineup_impact.home_market_value_num}万欧`, 
        lis_score: (!hasLineupData || lineupStatus === 'NOT_ANNOUNCED') ? 1.0 : quantFeatures.context.lineup_impact.home_lis,
        attack_injury_factor: (!hasLineupData || lineupStatus === 'NOT_ANNOUNCED') ? 1.0 : quantFeatures.context.lineup_impact.home_attack_injury_factor,
        defense_leak_factor: (!hasLineupData || lineupStatus === 'NOT_ANNOUNCED') ? 1.0 : quantFeatures.context.lineup_impact.home_defense_leak_factor,
        talisman_missing: quantFeatures.context.lineup_impact.home_talisman_missing,
        talisman_name: quantFeatures.context.lineup_impact.home_talisman_name,
        status: resolveLineupStatusDesc('home')
      },
      away: { 
        total_value_eur: (!hasLineupData || quantFeatures.context.lineup_impact.away_market_value_num === 0) ? '未知' : `${quantFeatures.context.lineup_impact.away_market_value_num}万欧`, 
        lis_score: (!hasLineupData || lineupStatus === 'NOT_ANNOUNCED') ? 1.0 : quantFeatures.context.lineup_impact.away_lis,
        attack_injury_factor: (!hasLineupData || lineupStatus === 'NOT_ANNOUNCED') ? 1.0 : quantFeatures.context.lineup_impact.away_attack_injury_factor,
        defense_leak_factor: (!hasLineupData || lineupStatus === 'NOT_ANNOUNCED') ? 1.0 : quantFeatures.context.lineup_impact.away_defense_leak_factor,
        talisman_missing: quantFeatures.context.lineup_impact.away_talisman_missing,
        talisman_name: quantFeatures.context.lineup_impact.away_talisman_name,
        status: resolveLineupStatusDesc('away')
      }
    };

    // Extract Physical stats if available (Dangerous Attacks, Corners, etc)
    const homeDA = hasDA ? (match.reference?.stats?.dangerous_attacks?.home ?? '未知') : '数据盲区';
    const awayDA = hasDA ? (match.reference?.stats?.dangerous_attacks?.away ?? '未知') : '数据盲区';
    const homeCorners = pStats.available_metrics.corners ? (match.reference?.stats?.corners?.home ?? '未知') : '数据盲区';
    const awayCorners = pStats.available_metrics.corners ? (match.reference?.stats?.corners?.away ?? '未知') : '数据盲区';
    
    // Add shots and possession
    const homeShotsOnTarget = match.reference?.stats?.shots_on_target?.home ?? '未知';
    const awayShotsOnTarget = match.reference?.stats?.shots_on_target?.away ?? '未知';
    const homeShotsOffTarget = match.reference?.stats?.shots_off_target?.home ?? '未知';
    const awayShotsOffTarget = match.reference?.stats?.shots_off_target?.away ?? '未知';
    const homePossession = match.reference?.stats?.possession?.home ?? '未知';
    const awayPossession = match.reference?.stats?.possession?.away ?? '未知';

    const homeXtStr = (hasDA && pStats.xt_proxy?.home_xt != null) ? pStats.xt_proxy.home_xt.toFixed(2) : "数据缺失(N/A)";
    const awayXtStr = (hasDA && pStats.xt_proxy?.away_xt != null) ? pStats.xt_proxy.away_xt.toFixed(2) : "数据缺失(N/A)";
    
    // Extract weather
    const environment = match.reference?.environment;
    let environmentStr = "缺失";
    if (environment) {
        environmentStr = `天气: ${environment.weather ?? '未知'}, 气温: ${environment.temperature ?? '未知'}, 风速: ${environment.wind ?? '未知'}, 湿度: ${environment.humidity ?? '未知'}`;
    }

    const h2hAnalytics = quantFeatures.context.h2h_analytics;
    const h2hProfiling = (h2hAnalytics && h2hAnalytics.sample_count > 0)
      ? (h2hAnalytics.tactical_metrics_available
          ? `交锋样本: ${h2hAnalytics.valid_count}场(战术真实样本${h2hAnalytics.tactical_valid_count}场), 场均角球: ${h2hAnalytics.historical_avg_corners ?? '无'}, 球风相克: ${h2hAnalytics.tactical_stylistic_clash_index.toFixed(2)}`
          : `交锋样本: ${h2hAnalytics.valid_count}场(历史深层攻防与角球缺失/失真, 仅基础比分有效), 球风克制置零`)
      : "无交锋记录";

    const team_profiling: EvaluatorTeamProfiling = {
      h2h_tactical_integrity: h2hProfiling,
      home: {
        recent_form_summary: (homeAnalytics && homeAnalytics.valid_count > 0) ? `有效样本数: ${homeAnalytics.valid_count}场 (总${homeAnalytics.sample_count}场), 场均得失球: ${homeAnalytics.weighted_scored_per_game.toFixed(2)} / ${homeAnalytics.weighted_conceded_per_game.toFixed(2)}` : "数据盲区 / 近期有效战绩样本不足 (Valid Count: 0)",
        market_performance_ats: (homeAnalytics && homeAnalytics.valid_count > 0) ? `赢盘率(ATS): ${(homeAnalytics.handicap_win_rate * 100).toFixed(1)}%, 大球率: ${(homeAnalytics.over_goals_rate * 100).toFixed(1)}%` : "缺乏历史盘路数据"
      },
      away: {
        recent_form_summary: (awayAnalytics && awayAnalytics.valid_count > 0) ? `有效样本数: ${awayAnalytics.valid_count}场 (总${awayAnalytics.sample_count}场), 场均得失球: ${awayAnalytics.weighted_scored_per_game.toFixed(2)} / ${awayAnalytics.weighted_conceded_per_game.toFixed(2)}` : "数据盲区 / 近期有效战绩样本不足 (Valid Count: 0)",
        market_performance_ats: (awayAnalytics && awayAnalytics.valid_count > 0) ? `赢盘率(ATS): ${(awayAnalytics.handicap_win_rate * 100).toFixed(1)}%, 大球率: ${(awayAnalytics.over_goals_rate * 100).toFixed(1)}%` : "缺乏历史盘路数据"
      }
    };

    const blindSpots: string[] = [];
    if (!hasLineupData || lineupStatus === 'NOT_ANNOUNCED') blindSpots.push("首发阵容未公布(需C级风控)");
    if (!hasDA && match.timing.stage === MatchStage.LIVE) blindSpots.push("实时危攻射门缺失");
    const hasAnyMarket = !!(match.markets?.full_h2h || match.markets?.full_spread_main || match.markets?.full_total_main);
    if (!hasHistoricalForm) blindSpots.push("历史有效战绩样本不足");
    if (!hasAnyMarket) blindSpots.push("核心盘口完全缺失");

    let data_blind_spot_warning: string | undefined = undefined;
    if (blindSpots.length > 0) {
      data_blind_spot_warning = `【系统最高级别警告】本场比赛存在严重的客观数据盲区: [${blindSpots.join('、')}]。AI 绝对禁止依此凭空捏造实力差距或控场优势。必须将 100% 评估权重转移至已有真实数据 (如可用盘口资金动量)，必须标注 [高波动/盲盒风险]，且最高置信度上限强制锁定在 85 以下，绝对禁止给出 A_GRADE 评级。`;
    }

    // 辅助检查四分之一盘与滚球数学已结算状态 (P0-01 实际盘口结构优先于 metadata)
    const currentHomeScore = match.score?.home_score ?? 0;
    const currentAwayScore = match.score?.away_score ?? 0;
    const currentTotalGoals = currentHomeScore + currentAwayScore;
    const isLive = match.timing?.stage === MatchStage.LIVE;

    const checkQuarterLine = (itemOrStr: any): boolean => {
      if (!itemOrStr) return false;
      if (typeof itemOrStr === 'object') {
        const candidates = [
          itemOrStr.handicap,
          itemOrStr.line,
          itemOrStr.total_line,
          itemOrStr.total,
          itemOrStr.home_selection,
          itemOrStr.away_selection,
          itemOrStr.spread,
          itemOrStr.selected_line
        ];
        return candidates.some(c => checkQuarterLine(c));
      }
      const s = String(itemOrStr).trim();
      return s.includes('/') || s.includes('.25') || s.includes('.75');
    };

    const annotateOuMarket = (marketItem: any, evAssessment?: any) => {
      if (!marketItem && !evAssessment) return undefined;
      const merged = { ...marketItem, ...evAssessment };
      const rawLine = merged.line ?? merged.total_line ?? merged.total ?? '';
      const numLine = parseAsianHandicapLine(rawLine);
      const isQuarter = checkQuarterLine(merged) || checkQuarterLine(rawLine);
      const isClosed = isLive && !isNaN(numLine) && numLine <= currentTotalGoals;
      const qDist = evAssessment?.preferred_side === 'under'
        ? evAssessment?.under_settlement_distribution
        : (evAssessment?.over_settlement_distribution ?? evAssessment?.settlement_distribution);
      return {
        ...merged,
        is_quarter_line: isQuarter,
        quarter_line_settlement_distribution: qDist,
        quarter_line_warning: isQuarter ? "四分之一盘具五态结算[全赢/半赢/走/半输/全输]。若无完整五态真实结算分布，settlement_status为SETTLEMENT_UNVERIFIABLE，严禁作为selected_line、不得参与EV排序、不得推荐！(UNVERIFIABLE QUARTER LINE: INVALID FOR VALUE RANKING)" : undefined,
        mathematical_settlement_state: isClosed ? "MATHEMATICALLY_CLOSED" : "ACTIVE_UNSETTLED",
        settlement_notice: isClosed ? `当前已产生 ${currentTotalGoals} 进球，此盘口(<= ${currentTotalGoals})已结出数学事实(大球必赢/小球必输)，禁止作为未来概率预测推荐！` : undefined
      };
    };

    const annotateAhMarket = (marketItem: any, evAssessment?: any) => {
      if (!marketItem && !evAssessment) return undefined;
      const merged = { ...marketItem, ...evAssessment };
      const rawLine = merged.handicap ?? merged.line ?? merged.home_selection ?? merged.away_selection ?? '';
      const isAwayPreferred = evAssessment?.preferred_side === 'away';
      const homeLine = marketItem?.home_selection ?? evAssessment?.home_line ?? rawLine;
      const awayLine = marketItem?.away_selection ?? evAssessment?.away_line ?? (homeLine ? invertHandicapString(homeLine) : '');
      const selectedLine = isAwayPreferred ? awayLine : homeLine;
      const selectedOdds = isAwayPreferred
        ? (marketItem?.away_odds ?? evAssessment?.away_odds)
        : (marketItem?.home_odds ?? evAssessment?.home_odds);

      const isQuarter = checkQuarterLine(merged) || checkQuarterLine(rawLine) || checkQuarterLine(selectedLine);
      const qDist = isAwayPreferred
        ? evAssessment?.away_settlement_distribution
        : (evAssessment?.home_settlement_distribution ?? evAssessment?.settlement_distribution);
      return {
        ...merged,
        home_selection: homeLine,
        away_selection: awayLine,
        selected_line: selectedLine,
        current_odds: selectedOdds,
        is_quarter_line: isQuarter,
        quarter_line_settlement_distribution: qDist,
        quarter_line_warning: isQuarter ? "四分之一让球盘具五态结算[全赢/半赢/走/半输/全输]。若无完整五态真实结算分布，settlement_status为SETTLEMENT_UNVERIFIABLE，严禁作为selected_line、不得参与EV排序、不得推荐！(UNVERIFIABLE QUARTER LINE: INVALID FOR VALUE RANKING)" : undefined,
        in_play_reset_rule: isLive ? "滚球让球盘仅考核推荐后剩余进球，以0:0重新起算！" : undefined
      };
    };

    const compressedAiBrief = { 
      ...aiBrief, 
      core_markets: {
        ah_main: annotateAhMarket(match.markets?.full_spread_main, quantFeatures.devig?.spread_main_ev),
        ah_secondary: Array.isArray(quantFeatures.devig?.spread_secondary_ev)
          ? quantFeatures.devig.spread_secondary_ev.map(sub => annotateAhMarket(undefined, sub))
          : quantFeatures.devig?.spread_secondary_ev,
        ou_main: annotateOuMarket(match.markets?.full_total_main, quantFeatures.devig?.total_main_ev),
        ou_secondary: Array.isArray(quantFeatures.devig?.total_secondary_ev)
          ? quantFeatures.devig.total_secondary_ev.map(sub => annotateOuMarket(undefined, sub))
          : quantFeatures.devig?.total_secondary_ev,
        euro_1x2: match.markets?.full_h2h ?? (quantFeatures.devig?.h2h_devig ? {
          home_odds: quantFeatures.devig.h2h_devig.market_odds?.[0],
          draw_odds: quantFeatures.devig.h2h_devig.market_odds?.[1],
          away_odds: quantFeatures.devig.h2h_devig.market_odds?.[2],
          fair_probabilities: quantFeatures.devig.h2h_devig.fair_probabilities,
          model_probabilities: quantFeatures.devig.h2h_devig.model_probabilities,
          home_ev: quantFeatures.devig.h2h_devig.home_ev,
          draw_ev: quantFeatures.devig.h2h_devig.draw_ev,
          away_ev: quantFeatures.devig.h2h_devig.away_ev
        } : undefined)
      },
      condensed_features: undefined 
    };
    delete compressedAiBrief.condensed_features;

    // 显式 OOS 状态与模型稳定性门禁判定 (P0-01)
    const pipeline = quantFeatures.candidate_pipeline;
    const validations = pipeline?.validations ?? [];
    const hasValidOosProfile = validations.some(v => v.status === 'VALIDATED' && v.effective_sample_size > 0);
    const maxEss = validations.reduce((acc, v) => Math.max(acc, v.effective_sample_size ?? 0), 0);
    const oosProfileStatus: 'NO_PROFILE' | 'VALIDATED' = hasValidOosProfile ? 'VALIDATED' : 'NO_PROFILE';
    const isOosValidated = oosProfileStatus === 'VALIDATED' && maxEss >= 30;

    const modelStability = quantFeatures.confidence_breakdown?.model_stability_score ?? 100;
    const hasMajorConflict = (quantFeatures.risk_flags?.length ?? 0) > 0 || (pipeline?.blockers?.length ?? 0) > 0;
    const candidateCount = pipeline?.machine_candidate_count ?? 0;
    const isPipelineLocked = pipeline?.state !== 'PRODUCTION_UNLOCKED';

    let hardGateCeiling: 'A_GRADE' | 'B_GRADE' | 'WATCH' | 'REJECTED' = 'A_GRADE';
    if (blindSpots.length > 0) {
      hardGateCeiling = 'C_GRADE' as any;
    } else if (modelStability < 70 && (hasMajorConflict || candidateCount === 0 || isPipelineLocked)) {
      hardGateCeiling = 'WATCH';
    } else if (!isOosValidated || modelStability < 70) {
      hardGateCeiling = 'B_GRADE';
    }

    let expectedRemaining = 0;
    if (match.timing?.stage === MatchStage.FINISHED) {
      expectedRemaining = 0;
    } else if (quantFeatures.poisson?.remaining_minutes != null && quantFeatures.poisson.remaining_minutes >= 0) {
      expectedRemaining = quantFeatures.poisson.remaining_minutes;
    } else {
      const minute = match.timing?.minute ?? 0;
      expectedRemaining = minute >= 90
        ? Math.max(1, 96 - minute)
        : Math.max(0, 90 - minute) + (minute > 80 ? 6 : 0);
    }

    validPayloads.push({
      ai_brief: compressedAiBrief,
      data_blind_spot_warning,
      live_physical_context: match.timing?.stage === MatchStage.LIVE ? {
        expected_remaining_minutes_including_stoppage: expectedRemaining,
        real_time_stats: `控球: ${homePossession}%-${awayPossession}% | 射门(正/偏): ${homeShotsOnTarget}(${homeShotsOffTarget})-${awayShotsOnTarget}(${awayShotsOffTarget}) | 危攻: ${homeDA}-${awayDA} | 角球: ${homeCorners}-${awayCorners} | xT威胁: ${homeXtStr}-${awayXtStr}`,
        environment: environmentStr,
        match_timeline_events: tactical_phase_transitions.filter(t => t.includes(']') && !t.includes('战术相变') && !t.includes('比赛初段') && !t.includes('持续围攻')),
        attack_momentum_time_series: tactical_phase_transitions.filter(t => t.includes('战术相变') || t.includes('比赛初段') || t.includes('持续围攻'))
      } : undefined,
      historical_team_profiling: team_profiling,
      lineup_value_matrix: (!hasLineupData || lineupStatus === 'NOT_ANNOUNCED') ? "NO_LINEUP" : lineup_value_matrix,
      quant_features: {
        mathematical_ev_signals: quantFeatures.raw_positive_ev_signals,
        raw_positive_ev_signals: quantFeatures.raw_positive_ev_signals,
        raw_mathematical_ev_signals: quantFeatures.raw_positive_ev_signals,
        machine_candidate_signals: quantFeatures.positive_ev_signals,
        candidate_pipeline: quantFeatures.candidate_pipeline,
        bdi: quantFeatures.battlefield_dominance_index,
        goal_phase_alert: quantFeatures.goal_phase_alert,
        risk_flags: quantFeatures.risk_flags,
        confidence_score: quantFeatures.confidence_score,
        machine_candidate_count: quantFeatures.candidate_pipeline.machine_candidate_count,
        poisson_expected_goals: quantFeatures.poisson ? `Home Rest: ${quantFeatures.poisson.lambda_home_rest?.toFixed(2)}, Away Rest: ${quantFeatures.poisson.lambda_away_rest?.toFixed(2)}` : undefined,
        prediction_snapshot: quantFeatures.poisson ? {
          model_version: 'refactor-layer03-v1',
          prediction_at: quantFeatures.calculated_at,
          predicted_lambda: {
            home: quantFeatures.poisson.lambda_home_rest,
            away: quantFeatures.poisson.lambda_away_rest
          },
          red_card_state: `${quantFeatures.match_state.red_card_attack_multiplier_home.toFixed(2)}/${quantFeatures.match_state.red_card_attack_multiplier_away.toFixed(2)}`,
          signals: quantFeatures.positive_ev_signals
        } : undefined,
        market_divergence_insights: quantFeatures.devig.bookmaker_posture,
        oos_semantic_status: {
          profile_status: oosProfileStatus,
          is_oos_validated: isOosValidated,
          effective_sample_size: maxEss,
          audit_rule: `NO_PROFILE ≠ OOS VALIDATED. oos_validated_count (${pipeline?.oos_validated_count ?? 0}) indicates pipeline candidates only. When profile_status is NO_PROFILE or ESS < 30, A_GRADE is strictly prohibited.`
        },
        stability_and_blockers: {
          model_stability_score: modelStability,
          has_major_live_conflict: hasMajorConflict,
          blocker_count: pipeline?.blockers?.length ?? 0,
          blockers: Array.from(pipeline?.blockers ?? []),
          hard_gate_ceiling: hardGateCeiling
        }
      }
    });
  }
  
  if (validPayloads.length === 0) {
    return { finalPrompt: "No valid matches provided.", matchCount: 0 };
  }
  
  const singleSystemPrompt = buildSystemPrompt(mode);
  const batchSystemPrompt = singleSystemPrompt.replace(
    /You must return a valid JSON object matching the following structure EXACTLY:/,
    "You must return a valid JSON ARRAY of objects, matching the following structure EXACTLY for EACH match in the provided payload array:"
  ).replace(
    /DO NOT wrap the JSON in Markdown formatting blocks. Output RAW JSON ONLY./,
    "DO NOT wrap the JSON in Markdown formatting blocks. Output RAW JSON ARRAY ONLY. Return an array containing one object per evaluated match."
  );
  
  const finalPrompt = `========== SYSTEM INSTRUCTION ==========\n${batchSystemPrompt}\n========== USER PAYLOAD (BATCH OF ${validPayloads.length} MATCHES) ==========\n${JSON.stringify(validPayloads, null, 2)}`;
  
  return { finalPrompt, matchCount: validPayloads.length };
}
