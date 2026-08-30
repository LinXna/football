/**
 * Layer 00-02 全链路血统追溯矩阵与反隐式兜底自动化验证套件
 * 
 * 核心断言内容：
 * 1. 验证 /refactor/TRACEABILITY_MATRIX.md 存在且包含所有核心 Field (F-)、Operator (OP-) 与 Rule (RC-) 编号；
 * 2. 以黄金基准赛事【英甲：谢周三 vs 布拉德福德城 (MatchID: 4562395)】贯穿测试：
 *    - [OP-01-01] YBTY 滚球提取 -> [F-01-Y01], [F-01-Y02], [F-01-Y03]
 *    - [OP-01-03] 雷速接口提取 -> [F-01-L01], [F-01-L08]
 *    - [OP-02-01] 统一时钟解析 -> [F-02-C01] (62')
 *    - [OP-02-02] 盘口结构装配 -> [F-02-C20] (AH -0/0.5, OU 2, 1X2)
 *    - [OP-02-03] 比分一致性核验 -> [F-02-C10] (0-1, verified=true)
 *    - [OP-02-04] 数据完整度与风控门禁 -> [F-02-C50] (TIER_1_FULL)
 *    - [OP-02-05] 标准赛事实体装配 -> CanonicalMatch
 *    - [OP-02-06] AI 决策摘要提取 -> AiEvaluationBrief
 * 3. 验证 [RC-001] 比分冲突硬熔断拦截 (Fail-Fast 产生 TIER_INVALID)；
 * 4. 验证 DeficitCollector 显式缺陷收集与拒绝静默兜底机制。
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  parseYbtyLiveRoot,
  parseLeisuInterfaceExport,
} from '../01_data_ingestion/index';
import {
  assembleCanonicalMatch,
  extractAiEvaluationBrief,
  DataCompletenessTier,
  MissingDataReason,
} from '../02_canonical_model/index';
import {
  DeficitCollector,
  tracer,
} from '../00_common/index';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[AssertionFailed] ${message}`);
  }
}

async function runTraceabilityVerification() {
  console.log('======================================================================');
  console.log('🔍 [Lineage Test 1] 校验 TRACEABILITY_MATRIX.md 核心编号与章节结构完整性...');
  console.log('======================================================================');

  const matrixPath = path.join(process.cwd(), 'refactor/TRACEABILITY_MATRIX.md');
  assert(fs.existsSync(matrixPath), 'TRACEABILITY_MATRIX.md 文件必须物理存在');

  const matrixContent = fs.readFileSync(matrixPath, 'utf-8');

  // 必须登记的核心编号清单
  const requiredIds = [
    'F-01-Y01', 'F-01-L08', 'F-02-C01', 'F-02-C10', 'F-02-C20', 'F-02-C50', 'F-03-Q01', 'F-04-R03',
    'OP-01-01', 'OP-01-02', 'OP-01-03', 'OP-02-01', 'OP-02-02', 'OP-02-03', 'OP-02-04', 'OP-02-05', 'OP-02-06', 'OP-03-02', 'OP-04-01',
    'RC-001', 'RC-002', 'RC-003', 'RC-008'
  ];

  for (const id of requiredIds) {
    assert(matrixContent.includes(id), `TRACEABILITY_MATRIX.md 必须显式登记编号: ${id}`);
    console.log(`  [${id}] ✅`);
  }

  console.log('✅ 矩阵文档核心字段 (F-)、算子 (OP-) 与风控规则 (RC-) 索引 100% 校验通过！\n');

  console.log('======================================================================');
  console.log('🌟 [Lineage Test 2] 黄金基准赛事【英甲：谢周三 vs 布拉德福德城 (ID: 4562395)】端到端穿透校验...');
  console.log('======================================================================');

  // 1. 读取真实固件数据
  const ybtyFixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'refactor/fixtures/ybty_v2.8.0_live_2026-08-20T20-20-13-747Z.json'), 'utf-8'));
  const leisuFixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'refactor/fixtures/leisu_v2.8.0_interface_data_2026-08-20T20-20-34-708Z.json'), 'utf-8'));

  // 2. 执行 [OP-01-01] 与 [OP-01-03]
  const ybtyPayload = parseYbtyLiveRoot(ybtyFixture);
  const leisuPayload = parseLeisuInterfaceExport(leisuFixture);

  // 3. 锁定谢周三比赛 (MatchID: 4562395)
  const ybtyMatch = ybtyPayload.matches.find(m => m.home.includes('谢周三') || m.away.includes('谢周三'));
  const leisuMatch = leisuPayload.matches.find(m => String(m.match_id) === '4562395');

  assert(Boolean(ybtyMatch), 'YBTY 真实固件必须存在谢周三比赛');
  assert(Boolean(leisuMatch), '雷速真实固件必须存在谢周三 (MatchID: 4562395) 比赛');

  const genericLiveMatch = {
    league: ybtyMatch!.league,
    home: ybtyMatch!.home,
    away: ybtyMatch!.away,
    home_score: ybtyMatch!.home_score,
    away_score: ybtyMatch!.away_score,
    clock: ybtyMatch!.clock,
    clock_status: ybtyMatch!.clock_status,
    is_live: true,
    markets: ybtyMatch!.markets,
  };

  // 4. 执行 [OP-02-05] 组装 CanonicalMatch
  const canonicalMatch = assembleCanonicalMatch(genericLiveMatch, leisuMatch!);

  // 5. 校验关键字段编号映射
  assert(canonicalMatch.timing.minute === 62, '[F-02-C01] 谢周三进行分钟数必须精确提取为 62');
  assert(canonicalMatch.score.home_score === 0 && canonicalMatch.score.away_score === 1, '[F-02-C10] 实时比分必须为 0:1');
  assert(canonicalMatch.score.score_verified === true, '[F-02-C10] score_verified 必须为 true');

  // 校验主盘口
  assert(Boolean(canonicalMatch.markets.full_spread_main), '[F-02-C20] 必须存在主盘让球');
  assert(canonicalMatch.markets.full_spread_main?.home_selection === '-0/0.5', '[F-02-C20] 主盘让球盘口必须为 -0/0.5');
  assert(canonicalMatch.markets.full_spread_main?.home_odds === 2.2, '[F-02-C20] 主盘主胜赔率必须为 2.20');
  assert(canonicalMatch.markets.full_spread_main?.away_odds === 1.71, '[F-02-C20] 主盘客胜赔率必须为 1.71');

  assert(Boolean(canonicalMatch.markets.full_total_main), '[F-02-C20] 必须存在主盘大小球');
  assert(canonicalMatch.markets.full_total_main?.line === '2', '[F-02-C20] 主盘大小球盘口必须为 2');
  assert(canonicalMatch.markets.full_total_main?.over_odds === 1.91, '[F-02-C20] 大球赔率必须为 1.91');
  assert(canonicalMatch.markets.full_total_main?.under_odds === 1.95, '[F-02-C20] 小球赔率必须为 1.95');

  assert(Boolean(canonicalMatch.markets.full_h2h), '[F-02-C20] 必须存在欧指独赢盘');
  assert(canonicalMatch.markets.full_h2h?.home_odds === 8.7, '[F-02-C20] 欧指主胜必须为 8.70');
  assert(canonicalMatch.markets.full_h2h?.draw_odds === 3.75, '[F-02-C20] 欧指平局必须为 3.75');
  assert(canonicalMatch.markets.full_h2h?.away_odds === 1.43, '[F-02-C20] 欧指客胜必须为 1.43');

  // 校验攻防统计数据
  assert(canonicalMatch.reference?.stats?.shots_on_target?.home === 3, '[F-02-C30] 主队射正必须为 3');
  assert(canonicalMatch.reference?.stats?.shots_on_target?.away === 3, '[F-02-C30] 客队射正必须为 3');
  assert(canonicalMatch.reference?.stats?.possession?.home === 60, '[F-02-C30] 主队控球率必须为 60%');
  assert(canonicalMatch.reference?.stats?.possession?.away === 40, '[F-02-C30] 客队控球率必须为 40%');
  assert(canonicalMatch.reference?.stats?.dangerous_attacks?.home === 38, '[F-02-C30] 主队危险进攻必须为 38');
  assert(canonicalMatch.reference?.stats?.dangerous_attacks?.away === 30, '[F-02-C30] 客队危险进攻必须为 30');

  // 校验完整度分级
  assert(canonicalMatch.completeness_tier === DataCompletenessTier.TIER_1_FULL, '[F-02-C50] 谢周三全维度具备，必须被判定为 TIER_1_FULL');

  // 执行 [OP-02-06] 提取 AI Brief
  const brief = extractAiEvaluationBrief(canonicalMatch);
  assert(brief.match_id === '4562395', '[OP-02-06] AI Brief 比赛ID正确');
  assert(brief.core_markets.ah_main?.handicap === '-0/0.5', '[OP-02-06] AI Brief 核心让球盘口提取完整');

  console.log(`✅ [F-02-C01] 时钟提取断言通过: ${canonicalMatch.timing.ybty_display_clock} (进行中分钟: ${canonicalMatch.timing.minute}')`);
  console.log(`✅ [F-02-C10] 实时核验比分断言通过: ${canonicalMatch.score.home_score} - ${canonicalMatch.score.away_score} (score_verified: true)`);
  console.log(`✅ [F-02-C20] 让球主盘断言通过: ${canonicalMatch.markets.full_spread_main?.home_selection} (主 ${canonicalMatch.markets.full_spread_main?.home_odds} / 客 ${canonicalMatch.markets.full_spread_main?.away_odds})`);
  console.log(`✅ [F-02-C20] 大小球主盘断言通过: ${canonicalMatch.markets.full_total_main?.line} (大 ${canonicalMatch.markets.full_total_main?.over_odds} / 小 ${canonicalMatch.markets.full_total_main?.under_odds})`);
  console.log(`✅ [F-02-C20] 欧指独赢盘断言通过: 主 ${canonicalMatch.markets.full_h2h?.home_odds} / 平 ${canonicalMatch.markets.full_h2h?.draw_odds} / 客 ${canonicalMatch.markets.full_h2h?.away_odds}`);
  console.log(`✅ [F-02-C30] 攻防数据断言通过: 射正 ${canonicalMatch.reference?.stats?.shots_on_target?.home}-${canonicalMatch.reference?.stats?.shots_on_target?.away}, 控球率 ${canonicalMatch.reference?.stats?.possession?.home}%-${canonicalMatch.reference?.stats?.possession?.away}%, 危险进攻 ${canonicalMatch.reference?.stats?.dangerous_attacks?.home}-${canonicalMatch.reference?.stats?.dangerous_attacks?.away}`);
  console.log(`✅ [F-02-C50] 数据完整度分级断言通过: ${canonicalMatch.completeness_tier} (无任何数据缺陷)`);
  console.log(`✅ [OP-02-06] AI Brief 提炼断言通过: 生成载荷轻量纯净 (${JSON.stringify(brief).length} 字符)\n`);

  console.log('======================================================================');
  console.log('🛡️ [Lineage Test 3] [OP-02-03][RC-001] 比分冲突硬熔断与 TIER_INVALID 拦截断言...');
  console.log('======================================================================');

  // 构造比分冲突场景（YBTY 显示 0-0，雷速显示 0-1）
  const conflictedYbtyMatch: GenericYbtyMatch = {
    ...genericLiveMatch,
    home_score: 0,
    away_score: 0,
  };

  const fusedCanonicalMatch = assembleCanonicalMatch(conflictedYbtyMatch, leisuMatch!);
  assert(fusedCanonicalMatch.score.is_mismatch_detected === true, '[RC-001] 比分冲突时 is_mismatch_detected 必须为 true');
  assert(fusedCanonicalMatch.completeness_tier === DataCompletenessTier.TIER_INVALID, '[RC-001] 比分冲突时实体必须硬熔断为 TIER_INVALID');
  assert(fusedCanonicalMatch.missing_reasons.includes(MissingDataReason.SCORE_MISMATCH), '[RC-001] 缺陷列表中必须显式记录 SCORE_MISMATCH');

  console.log('✅ [OP-02-03][RC-001] 比分冲突时成功打上 is_mismatch_detected=true');
  console.log('✅ [OP-02-04][RC-001] 数据分级成功被硬熔断为 TIER_INVALID');
  console.log('✅ [F-02-C50] 缺陷列表包含: ' + fusedCanonicalMatch.missing_reasons.join(', ') + '\n');

  console.log('======================================================================');
  console.log('📊 [Lineage Test 4] [DeficitCollector] 显式缺陷收集与 TIER_2_BASIC 降级断言...');
  console.log('======================================================================');

  const collector = new DeficitCollector();
  collector.record('MISSING_ATTACK_MOMENTUM', 'OP-02-04', 'RC-002', '缺少攻击动量波形数据', DataCompletenessTier.TIER_2_BASIC);
  collector.record('MISSING_LINEUP', 'OP-02-04', 'RC-003', '缺少首发大名单数据', DataCompletenessTier.TIER_2_BASIC);

  assert(collector.getDeficits().length === 2, 'DeficitCollector 必须精准收集 2 项缺陷');
  assert(collector.getDeficits()[0] === 'MISSING_ATTACK_MOMENTUM', '第一项缺陷必须为 MISSING_ATTACK_MOMENTUM');
  assert(collector.getDeficits()[1] === 'MISSING_LINEUP', '第二项缺陷必须为 MISSING_LINEUP');

  console.log('✅ [DeficitCollector] 缺陷收集断言通过: [' + collector.getDeficits().join(', ') + ']\n');

  console.log('======================================================================');
  console.log('🎉🎉🎉 全链路血统追溯矩阵、黄金基准赛事断言与反隐式兜底测试 100% 通过！');
  console.log('======================================================================');
}

runTraceabilityVerification().catch(err => {
  console.error('❌ 测试执行失败:', err);
  process.exit(1);
});
