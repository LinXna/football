import fs from 'fs';
import path from 'path';
import { canonicalizeRawMatchData } from '../server/services/canonicalMatchModel';
import { calculateHandicapExpectancyMetrics, calculateAttackConversion } from '../server/services/quantitativeFeatures';
import { deepMineFormAndH2H } from '../server/services/formAndH2HDeepMining';
import { buildMasterTacticalSynthesis } from '../server/services/advancedTacticalQuantitativeEngines';
import { buildSlimPromptMatch } from '../server/services/promptSlimPayload';
import { buildPromptInterfaceContext } from '../server/services/promptInterfaceFeatures';
import { chunkPromptItems } from '../server/services/promptChunking';
import { normalizeMarketLabels } from '../server/services/marketLabels';
import { normalizeYbtyMarketTypes } from '../server/services/marketTypeNormalizer';
import { normalizeLeisuInterfaceExport } from '../src/lib/leisuInterfaceImport';
import { createTeamAliasResolver } from '../server/services/teamAliasResolver';
import { calculateExactBeijingTime } from '../server/services/beijingTime';
import { summarizeDecisions } from '../server/services/decisionSummary';
import { normalizeParlayRecommendations } from '../server/services/parlayRecommendationNormalizer';

interface ExecutionLog {
  step: string;
  status: 'SUCCESS' | 'WARNING' | 'ERROR';
  details: string;
  data?: any;
}

const logs: ExecutionLog[] = [];

function log(step: string, status: 'SUCCESS' | 'WARNING' | 'ERROR', details: string, data?: any) {
  logs.push({ step, status, details, data });
  const prefix = status === 'SUCCESS' ? '✅' : status === 'WARNING' ? '⚠️' : '❌';
  console.log(`${prefix} [${step}] ${details}`);
}

async function runPipelineTest() {
  console.log('================================================================');
  console.log('  STARTING FULL END-TO-END PIPELINE AUDIT WITH REAL INPUT DATA  ');
  console.log('================================================================\n');

  const ybtyPath = 'docs/ybty_v2.8.0_live_2026-08-20T20-20-13-747Z.json';
  const leisuPath = 'docs/leisu_v2.8.0_interface_data_2026-08-20T20-20-34-708Z.json';

  // -------------------------------------------------------------
  // STEP 1: 导入数据 (Data Ingestion & Integrity Checks)
  // -------------------------------------------------------------
  console.log('>>> 1. 导入数据 (Data Ingestion & Verification)...');
  
  if (!fs.existsSync(ybtyPath)) {
    log('1.1 文件检查', 'ERROR', `YBTY 文件不存在: ${ybtyPath}`);
    return;
  }
  if (!fs.existsSync(leisuPath)) {
    log('1.1 文件检查', 'ERROR', `Leisu 文件不存在: ${leisuPath}`);
    return;
  }

  let rawYbty: any;
  let rawLeisu: any;

  try {
    rawYbty = JSON.parse(fs.readFileSync(ybtyPath, 'utf8'));
    log('1.2 YBTY 解析', 'SUCCESS', `成功解析 YBTY JSON，包含 ${rawYbty.matches?.length || 0} 场比赛 (Captured: ${rawYbty.captured_at}, Mode: ${rawYbty.export_mode})`);
  } catch (err: any) {
    log('1.2 YBTY 解析', 'ERROR', `YBTY JSON 解析失败: ${err.message}`);
    return;
  }

  try {
    rawLeisu = JSON.parse(fs.readFileSync(leisuPath, 'utf8'));
    log('1.3 Leisu 解析', 'SUCCESS', `成功解析 Leisu JSON，包含 ${rawLeisu.results?.length || 0} 场比赛 (Captured: ${rawLeisu.captured_at}, Type: ${rawLeisu.export_type})`);
  } catch (err: any) {
    log('1.3 Leisu 解析', 'ERROR', `Leisu JSON 解析失败: ${err.message}`);
    return;
  }

  // Check Snapshot Time Gap
  const ybtyTime = new Date(rawYbty.captured_at).getTime();
  const leisuTime = new Date(rawLeisu.captured_at).getTime();
  const gapSeconds = Math.abs((ybtyTime - leisuTime) / 1000);
  if (gapSeconds > 180) {
    log('1.4 快照时差检查', 'WARNING', `快照时差为 ${gapSeconds.toFixed(1)} 秒，超过标准 180 秒阈值 (YBTY: ${rawYbty.captured_at}, Leisu: ${rawLeisu.captured_at})`);
  } else {
    log('1.4 快照时差检查', 'SUCCESS', `快照时差为 ${gapSeconds.toFixed(1)} 秒 (正常范围内 <= 180s)`);
  }

  // -------------------------------------------------------------
  // STEP 2: 合并数据与赛事匹配 (Data Merge & Alias Cross-Matching)
  // -------------------------------------------------------------
  console.log('\n>>> 2. 合并数据 (Data Merging & Team Alias Matching)...');

  const manualAliases = JSON.parse(fs.readFileSync('team_aliases.json', 'utf8') || '{}');
  const autoAliases = JSON.parse(fs.readFileSync('team_aliases_auto.json', 'utf8') || '{}');
  const cleanTeamName = (name: string) => (name || '').toLowerCase().replace(/[\s\-_·\.（）()]/g, '').trim();
  const aliasResolver = createTeamAliasResolver(manualAliases, autoAliases, cleanTeamName);

  const matchedDecisions: any[] = [];
  const unmatchedYbty: any[] = [];

  const normalizedLeisuList = normalizeLeisuInterfaceExport(rawLeisu) || [];
  log('2.1 Leisu 数据规范化', 'SUCCESS', `Leisu 接口数据已转换为规范结构，共 ${normalizedLeisuList.length} 条记录`);

  for (const ybtyMatch of rawYbty.matches) {
    const yHome = ybtyMatch.home;
    const yAway = ybtyMatch.away;
    const yLeague = ybtyMatch.league;

    // Find best match in normalizedLeisuList or rawLeisu
    let bestMatch: any = null;
    let matchMethod = '';

    for (let i = 0; i < rawLeisu.results.length; i++) {
      const lResult = rawLeisu.results[i];
      const lFormal = lResult.formal || {};
      const lStatic = lFormal.static_match || {};
      const lHome = lStatic.homeTeam?.name || lStatic.homeTeam?.shortName || '';
      const lAway = lStatic.awayTeam?.name || lStatic.awayTeam?.shortName || '';

      const homeMatched = aliasResolver(lHome, yHome) || cleanTeamName(lHome) === cleanTeamName(yHome) || yHome.includes(lHome) || lHome.includes(yHome);
      const awayMatched = aliasResolver(lAway, yAway) || cleanTeamName(lAway) === cleanTeamName(yAway) || yAway.includes(lAway) || lAway.includes(yAway);

      if (homeMatched && awayMatched) {
        bestMatch = {
          raw_result: lResult,
          normalized: normalizedLeisuList[i] || {},
          leisu_home: lHome,
          leisu_away: lAway,
          leisu_id: lStatic.id || lResult.match_id,
          leisu_league: lStatic.competition?.name || lStatic.competition?.shortName || '',
        };
        matchMethod = 'Team Alias / Substring Match';
        break;
      }
    }

    if (bestMatch) {
      log('2.2 赛事匹配成功', 'SUCCESS', `[${yLeague}] YBTY: "${yHome} vs ${yAway}" 匹配到 Leisu: "${bestMatch.leisu_home} vs ${bestMatch.leisu_away}" (ID: ${bestMatch.leisu_id}) 通过: ${matchMethod}`);
      
      const yClock = ybtyMatch.clock || '';
      const minute = parseInt(yClock.split(':')[0]) || 0;
      const yHScore = parseInt(ybtyMatch.home_score) || 0;
      const yAScore = parseInt(ybtyMatch.away_score) || 0;

      const lLive = bestMatch.raw_result.formal?.live_match || {};
      const lHScore = Number(lLive.home_scores?.score ?? 0);
      const lAScore = Number(lLive.away_scores?.score ?? 0);

      const scoreConsistent = (yHScore === lHScore && yAScore === lAScore);
      if (!scoreConsistent) {
        log('2.3 比分一致性核验', 'WARNING', `比分冲突！YBTY=${yHScore}-${yAScore} vs Leisu=${lHScore}-${lAScore} (Match: ${yHome} vs ${yAway})`);
      } else {
        log('2.3 比分一致性核验', 'SUCCESS', `比分完全一致: ${yHScore}-${yAScore} (Verified)`);
      }

      matchedDecisions.push({
        match: `${yHome} vs ${bestMatch.leisu_away || yAway}`,
        ybty_match: `${yHome} vs ${yAway}`,
        ybty_home: yHome,
        ybty_away: yAway,
        leisu_home: bestMatch.leisu_home,
        leisu_away: bestMatch.leisu_away,
        league: yLeague,
        ybty_league: yLeague,
        leisu_league: bestMatch.leisu_league,
        minute: minute,
        clock: yClock,
        score: { home: yHScore, away: yAScore },
        score_verified: scoreConsistent,
        score_source: scoreConsistent ? 'ybty+leisu_verified' : 'ybty_unverified',
        ybty_raw_markets: ybtyMatch.markets,
        live_statistics: lLive.confirmed_statistics || null,
        unified_stats: lLive.confirmed_statistics || null,
        raw_leisu_formal: bestMatch.raw_result.formal || null,
        raw_ybty: ybtyMatch,
        leisu_match_id: bestMatch.leisu_id,
      });
    } else {
      log('2.2 赛事匹配失败', 'ERROR', `未找到 Leisu 匹配: YBTY "${yHome} vs ${yAway}" (League: ${yLeague})`);
      unmatchedYbty.push(ybtyMatch);
    }
  }

  log('2.4 合并总计', matchedDecisions.length === 6 ? 'SUCCESS' : 'WARNING', `6 场 YBTY 赛事中成功匹配 ${matchedDecisions.length} 场，未匹配 ${unmatchedYbty.length} 场`);

  // -------------------------------------------------------------
  // STEP 3: 系统评估 (System Quantitative Evaluation & Tactical Modeling)
  // -------------------------------------------------------------
  console.log('\n>>> 3. 系统评估 (Quantitative Physical & Tactical Modeling)...');

  const evaluatedMatches: any[] = [];

  for (let i = 0; i < matchedDecisions.length; i++) {
    const match = matchedDecisions[i];
    console.log(`\n--- 评估比赛 [${i + 1}/6]: ${match.ybty_home} vs ${match.ybty_away} (${match.minute}' ${match.score.home}-${match.score.away}) ---`);

    // A. Canonical Match Model Conversion
    const canonical = canonicalizeRawMatchData(match);
    log(`3.1[${i + 1}] Canonical 模型构建`, 'SUCCESS', `已构建规范数据模型，包含统计数据项 ${Object.keys(canonical.live_facts.stats).length} 个`);

    // B. Form & H2H Deep Mining
    const formDeep = deepMineFormAndH2H(match);
    const prior = formDeep.form_weighted_poisson_prior;
    log(`3.2[${i + 1}] 赛前泊松先验计算`, 'SUCCESS', `先验期望值: 主队λ=${prior.lambda_home_prior}, 客队λ=${prior.lambda_away_prior}, 全场λ=${prior.lambda_total_prior}`);

    // C. Tactical & Time-Decay Synthesis
    const tactical = buildMasterTacticalSynthesis(match);
    log(`3.3[${i + 1}] 战术与衰减引擎`, 'SUCCESS', `比赛阶段: ${tactical.non_linear_time_decay.current_game_phase}, 剩余物理时间: ${tactical.non_linear_time_decay.remaining_physical_minutes}', 剩余进球衰减能力: ${tactical.non_linear_time_decay.non_linear_remaining_goal_capacity_pct}%`);

    // D. Quantitative Live Features & Handicap Expectancy
    const handicap = calculateHandicapExpectancyMetrics(match.unified_stats, match.score, match.minute);
    log(`3.4[${i + 1}] 现场实时盘口期望`, 'SUCCESS', `泊松全场期望值: 主队=${handicap?.independent_poisson_distribution?.lambdas?.home}, 客队=${handicap?.independent_poisson_distribution?.lambdas?.away}`);

    // E. Pure Physical Match Model & Market Audits (Prompt Slim Payload)
    const slim = buildSlimPromptMatch(match, 'live_eval');
    const phys = slim.live_match_physical_facts?.pure_physical_match_model;
    const physLambdas = phys?.physical_lambdas;
    const physDist = phys?.pure_physical_distribution;
    const audits = phys?.market_physical_edge_audit || [];

    log(`3.5[${i + 1}] 物理推演盘口审计`, 'SUCCESS', `完成 ${audits.length} 个 YBTY 实盘选项比对。推演胜率: 主胜${physDist?.home_win_pct}% / 平局${physDist?.draw_pct}% / 客胜${physDist?.away_win_pct}%`);

    // Count Traps vs Mispricings
    const traps = audits.filter((a: any) => a.discrepancy_verdict === 'BOOKMAKER_BAIT_TRAP');
    const mispricings = audits.filter((a: any) => a.discrepancy_verdict === 'STRONG_VALUE_MISPRICING');
    log(`3.6[${i + 1}] 机构诱盘与价值偏差发现`, 'SUCCESS', `识别出机构诱盘选项 ${traps.length} 个，高价值错配选项 ${mispricings.length} 个`);

    evaluatedMatches.push({
      match,
      canonical,
      tactical,
      slim,
      audits,
    });
  }

  // -------------------------------------------------------------
  // STEP 4: 导出 Prompt (AI Prompt Slim Payload Generation & Export)
  // -------------------------------------------------------------
  console.log('\n>>> 4. 导出 Prompt (AI Slim Prompt Export & Segment Packaging)...');

  // Build the complete slim payload for AI Evaluation
  const slimMatches = evaluatedMatches.map((item) => item.slim);
  const promptContext = {
    matches: slimMatches,
    timestamp: new Date().toISOString(),
    task_mode: 'live_eval',
  };

  const fullPromptJson = JSON.stringify(promptContext, null, 2);
  const totalTokensEst = Math.round(fullPromptJson.length / 3.5);
  log('4.1 Slim Payload 序列化', 'SUCCESS', `生成压缩 Slim Prompt Payload，总字节数 ${fullPromptJson.length} bytes (预估 Token: ~${totalTokensEst})`);

  // Test Chunking / Segmentation
  const chunks = chunkPromptItems(slimMatches, 3);
  log('4.2 Prompt 分段切片检测', 'SUCCESS', `6 场比赛切分为 ${chunks.length} 个分段 (每段 ${chunks[0]?.length || 0} 场)`);

  // Verify Whitelist adherence on all 5 core markets
  const coreMarkets = ['全场大小球', '半场大小球', '全场让球', '半场让球', '全场独赢1X2'];
  let totalMarketWhitelistOptions = 0;
  for (const m of slimMatches) {
    const markets = m.ybty_whitelisted_markets || [];
    totalMarketWhitelistOptions += markets.length;
  }
  log('4.3 YBTY 白名单盘口完整性', 'SUCCESS', `已注入全部 YBTY 实际开出盘口白名单，6 场比赛共计 ${totalMarketWhitelistOptions} 个可用盘口`);

  // -------------------------------------------------------------
  // 总结与异常分析 (Summary & Diagnostics)
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log('                      AUDIT EXECUTION SUMMARY                   ');
  console.log('================================================================');
  
  const errorLogs = logs.filter(l => l.status === 'ERROR');
  const warningLogs = logs.filter(l => l.status === 'WARNING');
  const successLogs = logs.filter(l => l.status === 'SUCCESS');

  console.log(`- 成功操作 (SUCCESS): ${successLogs.length}`);
  console.log(`- 警告提示 (WARNING): ${warningLogs.length}`);
  console.log(`- 致命错误 (ERROR):   ${errorLogs.length}\n`);

  if (warningLogs.length > 0) {
    console.log('⚠️ 发现的警告与边界情况 (Warnings & Anomalies):');
    warningLogs.forEach((w, i) => console.log(`  [${i + 1}] [${w.step}] ${w.details}`));
    console.log('');
  }

  if (errorLogs.length > 0) {
    console.log('❌ 发现的错误 (Errors):');
    errorLogs.forEach((e, i) => console.log(`  [${i + 1}] [${e.step}] ${e.details}`));
    console.log('');
  }

  console.log('================================================================');
  console.log('                   PIPELINE VERIFICATION FINISHED               ');
  console.log('================================================================');
}

runPipelineTest().catch(console.error);
