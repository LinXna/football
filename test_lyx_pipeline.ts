/**
 * 直接使用 LYX 数据进行 00-03 链路深度验证
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Layer 01
import { parseYbtyLiveRoot } from './refactor/01_data_ingestion/ybty/ybtyLiveExtractor';
import { parseLeisuInterfaceExport } from './refactor/01_data_ingestion/leisu/leisuInterfaceExtractor';

// Layer 02
import { findBestLeisuMatch, DEFAULT_LEAGUE_ALIASES } from './refactor/02_canonical_model/matchAligner';
import { assembleCanonicalMatch, extractAiEvaluationBrief } from './refactor/02_canonical_model/canonicalMatchAssembler';
import { MatchAlignmentStatus, MatchStage, DataCompletenessTier } from './refactor/02_canonical_model/enums';

// Layer 03
import { calculateQuantitativeFeatures } from './refactor/03_quant_engine/index';

// Layer 00
import { Tracer, DeficitCollector } from './refactor/00_common/index';

async function main() {
  console.log('='.repeat(80));
  console.log('🔬 LYX 3场数据 00-03 全链路深度验证');
  console.log('='.repeat(80));

  // 1. 读取原始数据
  const ybtyRaw = JSON.parse(fs.readFileSync('LYX/ybty_v2.8.0_live_2026-08-20T20-20-13-747Z.json', 'utf-8'));
  const leisuRaw = JSON.parse(fs.readFileSync('LYX/leisu_v2.8.0_interface_data_2026-08-20T20-20-34-708Z.json', 'utf-8'));

  console.log(`\nYBTY: ${ybtyRaw.matches.length} 场, 雷速: ${leisuRaw.results.length} 场`);

  // 2. Layer 01
  const ybtyParsed = parseYbtyLiveRoot(ybtyRaw);
  const leisuParsed = parseLeisuInterfaceExport(leisuRaw);

  console.log(`\n--- Layer 01 解析结果 ---`);
  for (const m of ybtyParsed.matches) {
    console.log(`[YBTY] ${m.league}: ${m.home} vs ${m.away} | ${m.home_score}-${m.away_score} @ ${m.clock}`);
    console.log(`  H2H: ${m.markets.full_h2h ? '✓' : '✗'} | 让球主: ${m.markets.full_spread_main?.home_selection || 'N/A'} | 大小球主: ${m.markets.full_total_main?.line || 'N/A'}`);
    console.log(`  让球副盘: ${m.markets.full_spread_subs.length}档 | 大小球副盘: ${m.markets.full_total_subs.length}档`);
  }
  for (const m of leisuParsed.matches) {
    console.log(`[雷速] ${m.competition}: ${m.home_team} vs ${m.away_team} | ${m.score?.home}-${m.score?.away}`);
    console.log(`  动量段: ${m.attack_momentum?.segment_count || 0} | 文字事件: ${m.timeline_events?.length || 0} | 统计: ${m.stats ? '✓' : '✗'}`);
    const oddsLive = m.odds_matrix?.live;
    if (oddsLive?.asian_handicap) console.log(`  雷速live让球: line=${oddsLive.asian_handicap.line} H=${oddsLive.asian_handicap.home_odds} A=${oddsLive.asian_handicap.away_odds}`);
  }

  // 3. Layer 02 对齐
  console.log(`\n--- Layer 02 对齐与装配 ---`);
  const consumedIds = new Set<string | number>();
  const canonicals: any[] = [];

  for (const yMatch of ybtyParsed.matches) {
    const available = leisuParsed.matches.filter(l => !consumedIds.has(l.match_id));
    const { best_match, decision } = findBestLeisuMatch(yMatch as any, available, {}, DEFAULT_LEAGUE_ALIASES);
    if (best_match && decision && decision.confidence_score >= 50) {
      consumedIds.add(best_match.match_id);
      const canonical = assembleCanonicalMatch(yMatch as any, best_match, decision);
      canonicals.push(canonical);
      console.log(`✓ ${yMatch.home} vs ${yMatch.away} <-> ${best_match.home_team} vs ${best_match.away_team}`);
      console.log(`  对齐: ${decision.status} (${decision.confidence_score}) | 比分核验: ${canonical.score.score_verified} | 完整度: ${canonical.completeness_tier}`);
      console.log(`  缺失: [${canonical.missing_reasons.join(', ')}]`);
    } else {
      console.log(`✗ 未匹配: ${yMatch.home} vs ${yMatch.away} | 最佳分: ${decision?.confidence_score ?? 0}`);
    }
  }

  // 4. Layer 03 量化
  console.log(`\n--- Layer 03 量化引擎 ---`);
  const issues: string[] = [];

  for (const canonical of canonicals) {
    if (canonical.alignment.status !== MatchAlignmentStatus.MATCHED_BY_ALIAS &&
        canonical.alignment.status !== MatchAlignmentStatus.MATCHED_AUTO) {
      console.log(`⏭ 跳过 ${canonical.home_team_name} vs ${canonical.away_team_name}`);
      continue;
    }

    try {
      const deficitCollector = new DeficitCollector();
      const quant = calculateQuantitativeFeatures(canonical, undefined, deficitCollector);
      
      const matchTag = `${canonical.home_team_name} vs ${canonical.away_team_name} (${canonical.score.home_score}-${canonical.score.away_score} @ ${canonical.timing.minute}')`;
      console.log(`\n🏟️ ${matchTag}`);

      // === 详细验证 ===

      // 1. 盘口方向验证
      const spreadMain = canonical.markets.full_spread_main;
      if (spreadMain) {
        const sel = spreadMain.home_selection;
        console.log(`  让球主盘: ${sel} home@${spreadMain.home_odds} / ${spreadMain.away_selection} away@${spreadMain.away_odds}`);
        // 验证让球方向符号正确性
        if (sel.startsWith('-')) {
          console.log(`    → 主让，应对应独赢主低水`);
        } else if (sel.startsWith('+')) {
          console.log(`    → 主受让，应对应独赢客低水`);
        }
      }

      // 2. λ 合理性
      const lH = quant.poisson.lambda_home_rest;
      const lA = quant.poisson.lambda_away_rest;
      console.log(`  剩余λ: H=${lH.toFixed(4)} A=${lA.toFixed(4)} 总=${(lH+lA).toFixed(4)}`);
      
      const dec = quant.poisson.lambda_decomposition;
      console.log(`  λ分解: 市场基准H/A=${dec.market_base_home.toFixed(2)}/${dec.market_base_away.toFixed(2)}, base_after_context_H/A=${dec.base_after_context_home.toFixed(2)}/${dec.base_after_context_away.toFixed(2)}`);
      console.log(`  乘子: timeH/A=${dec.time_fraction_home.toFixed(2)}/${dec.time_fraction_away.toFixed(2)}, urgency=${dec.urgency_multiplier.toFixed(2)}, threatH/A=${dec.threat_home.toFixed(2)}/${dec.threat_away.toFixed(2)}, redH/A=${dec.red_attack_home.toFixed(2)}/${dec.red_attack_away.toFixed(2)}`);

      const remainMin = 90 - (canonical.timing.minute || 0);
      const maxReasonable = (remainMin / 90) * 4.0; // 最多全场4球/90分钟按比例
      if (lH + lA > maxReasonable * 1.5) {
        issues.push(`${matchTag}: 剩余λ总和=${(lH+lA).toFixed(2)}过高, 剩余${remainMin}分钟最多合理≈${maxReasonable.toFixed(2)}`);
      }

      // 3. 泊松概率守恒
      const pH = quant.poisson.rest_score_matrix.prob_home_win_rest;
      const pD = quant.poisson.rest_score_matrix.prob_draw_rest;
      const pA = quant.poisson.rest_score_matrix.prob_away_win_rest;
      console.log(`  剩余P(H/D/A): ${(pH*100).toFixed(1)}%/${(pD*100).toFixed(1)}%/${(pA*100).toFixed(1)}% 和=${(pH+pD+pA).toFixed(4)}`);
      if (Math.abs(pH + pD + pA - 1.0) > 0.02) {
        issues.push(`${matchTag}: 概率和不守恒 = ${(pH+pD+pA).toFixed(4)}`);
      }

      // 4. 独赢EV与泊松概率一致性
      if (quant.devig.h2h_devig) {
        const h2h = quant.devig.h2h_devig;
        console.log(`  独赢EV: H=${((h2h.home_ev ?? 0)*100).toFixed(1)}% D=${((h2h.draw_ev ?? 0)*100).toFixed(1)}% A=${((h2h.away_ev ?? 0)*100).toFixed(1)}%`);
        if (h2h.model_probabilities) {
          console.log(`  模型概率: H=${(h2h.model_probabilities[0]*100).toFixed(1)}% D=${(h2h.model_probabilities[1]*100).toFixed(1)}% A=${(h2h.model_probabilities[2]*100).toFixed(1)}%`);
        }
      }

      // 5. 让球EV
      if (quant.devig.spread_main_ev) {
        const sp = quant.devig.spread_main_ev;
        console.log(`  让球EV: line=${sp.line} H=${(sp.home_ev*100).toFixed(1)}% A=${(sp.away_ev*100).toFixed(1)}% 偏好=${sp.preferred_side} +EV=${sp.is_positive_ev}`);
        
        // 验证: 巴列卡诺 1-0 领先 58' 客受让 -0/0.5 应该客让方EV不应为正
        if (canonical.home_team_name === '巴列卡诺' && sp.line === '+0/0.5') {
          console.log(`    ▸ 巴列卡诺1-0领先 受让 +0/0.5 → 雷速让球方向检查`);
        }
      }

      // 6. 大小球EV
      if (quant.devig.total_main_ev) {
        const t = quant.devig.total_main_ev;
        console.log(`  大小球EV: line=${t.line} Over=${(t.over_ev*100).toFixed(1)}% Under=${(t.under_ev*100).toFixed(1)}% 偏好=${t.preferred_side}`);
      }

      // 7. OOS门禁
      console.log(`  候选状态: ${quant.candidate_pipeline.state} | 原始+EV: ${quant.raw_positive_ev_signals.length} | 机器候选: ${quant.positive_ev_signals.length}`);
      if (quant.positive_ev_signals.length > 0) {
        issues.push(`${matchTag}: 无OOS但有机器候选 ${quant.positive_ev_signals.length} 个!`);
      }

      // 8. BDI与置信度
      console.log(`  BDI: ${quant.battlefield_dominance_index} | 置信度: ${quant.confidence_score}`);
      console.log(`  风控: [${quant.risk_flags.join(', ')}]`);

      // 9. 数据审计
      if (quant.data_audit) {
        const used = quant.data_audit.items.filter((i: any) => i.status === 'USED').length;
        const deg = quant.data_audit.items.filter((i: any) => i.status === 'DEGRADED').length;
        const unavail = quant.data_audit.items.filter((i: any) => i.status === 'UNAVAILABLE').length;
        console.log(`  审计: ${quant.data_audit.items.length}类 (采用${used}, 降级${deg}, 不可用${unavail})`);
      }

      // 10. 副盘EV覆盖
      if (canonical.markets?.full_spread_subs && canonical.markets.full_spread_subs.length > 0) {
        if (quant.devig.spread_secondary_ev.length !== canonical.markets.full_spread_subs.length) {
          issues.push(`${matchTag}: 让球副盘EV覆盖不完整 (YBTY ${canonical.markets.full_spread_subs.length}档 vs Layer03 ${quant.devig.spread_secondary_ev.length}档)`);
        }
      }
      if (canonical.markets?.full_total_subs && canonical.markets.full_total_subs.length > 0) {
        if (quant.devig.total_secondary_ev.length !== canonical.markets.full_total_subs.length) {
          issues.push(`${matchTag}: 大小球副盘EV覆盖不完整 (YBTY ${canonical.markets.full_total_subs.length}档 vs Layer03 ${quant.devig.total_secondary_ev.length}档)`);
        }
      }
    } catch (err: any) {
      console.log(`❌ ${canonical.home_team_name} vs ${canonical.away_team_name}: ${err.message}`);
      issues.push(`${canonical.home_team_name} vs ${canonical.away_team_name}: 执行失败 - ${err.message}`);
    }
  }

  // 5. 总结
  console.log('\n' + '='.repeat(80));
  console.log('📋 验证总结');
  console.log('='.repeat(80));
  console.log(`YBTY: ${ybtyParsed.matches.length}场 | 雷速: ${leisuParsed.matches.length}场 | 成功对齐: ${canonicals.length}场`);
  
  if (issues.length === 0) {
    console.log('✅ 全部验证通过！未发现链路缺陷。');
  } else {
    console.log(`⚠️ 发现 ${issues.length} 个问题:`);
    for (const i of issues) {
      console.log(`  ⚠ ${i}`);
    }
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
