# 足球比赛分析系统：数据架构审计与全面重构实施总结报告
# CODEX SYSTEM V3.0 CANONICAL DATA ARCHITECTURE IMPLEMENTATION REPORT

**日期**: 2026-08-21  
**状态**: `IMPLEMENTATION_COMPLETED_AND_VERIFIED`  
**版本**: `v3.0.0-CANONICAL`  
**测试与构建状态**: TypeScript Lint (0 Errors) | Python Test Pipeline (PASS) | Vite Applet Compilation (PASS)

---

## 1. 重构背景与执行目标

在系统历史迭代中，由于数据源演进（早期 DOM 抓取与 SofaScore 格式逐步演化为雷速官方 `leisu_interface_data` 深度接口格式），前端与 Python 管道层存在以下遗留痛点：
1. **多重类型冗余与断层**：前端存在 `LiveMatch`、`StandardMatchData`、`CanonicalMatchData` 等多套重叠结构，部分字段存在未对齐现象。
2. **数据源加载器不兼容**：Python 管道 `football_live.py` 仍保留了对旧 DOM/SofaScore 字段的直接访问，未能充分提取雷速 `results[].formal` 中的战术首发阵容、8大核心统计、历史交锋与攻守动量时序（Attack Momentum Timeline）。
3. **风控门禁与比分核验断口**：比分数据源字段命名不一致导致部分合法比分未能识别为 `score_verified=true`，影响高评级推荐的输出。

本次重构按照 `docs/data_audit/04_STEP_BY_STEP_IMPLEMENTATION_PLAN.md` 规划，在五大阶段内完成了全系统无缝对齐与升级。

---

## 2. 五大阶段实施详情与代码变更清单

### 阶段一：前端核心类型系统全面重构与契约对齐 (Phase 1)
- **`src/types.ts` 全面升级**：
  - 确立 `StandardMatchData` 作为全系统唯一官方比赛接口；
  - 规范化 `score: { home: number; away: number }`、`minute: number | null` 等数值类型，杜绝 `string` 造成的 `NaN` 计算异常；
  - 完善 `UnifiedMatchStats`（控球率、射门、射正、角球、危险进攻、红黄牌等 8 大核心指标）；
  - 完善 `TacticalContext`（阵型克制、首发确认状态、主力伤停数、近期战绩列表、历史交锋明细）；
  - 完善 `LineupData` 与 `PlayerInfo`（首发、替补、伤停、主帅、阵型站位坐标）；
  - 完善 `HistoricalAnalysisData`（近期走势、进球时段分布、未来赛程安排）。
- **新建通用数据清洗适配库 `src/utils/dataAdapter.ts`**：
  - 提供 `safeNumber(val, fallback)` 防御函数，防止任何 `undefined` / `null` / 非数字导致的 UI 崩溃；
  - 提供 `adaptToStandardMatch(raw)` 适配函数，对任意来源（原始 JSON、Python 输出、API 返回）进行全字段保底映射与清洗；
  - 严格保持 YBTY 原始队名权威性（`ybty_home` / `ybty_away`）。

### 阶段二：Python 管道层数据加载与匹配逻辑归一化 (Phase 2)
- **重构 `scripts/python/football_live.py`**：
  - 新增 `load_leisu_interface_file(path)` 解析函数，精准提取 `leisu_interface_data`（`results[].formal`）中的 `static_match`、`live_match`、`odds`、`lineup` 与 `historical_analysis`；
  - 统一映射 8 大核心技术统计，当射门总数缺失时自动依据 `shots_on_target + shots_off_target` 补充计算；
  - 正确提取比赛事件流（红黄牌、进球等 `incidents`）并标记 `incidentClass="red"` 与 `isGoal=True`；
  - 自动保留 `attack_momentum_timeline` 时序动量数组供前端渲染；
  - 修复 CLI 参数与管道自动识别机制，同时支持滚球（`--mode live`）与赛前（`--mode prematch`）。
- **重构 `scripts/python/interface_features.py`**：
  - 统一从标准化对象中提取控球率、射正率、危险进攻转化率与动量斜率；
  - 增加数值安全保护，避免除零或缺失字段报错。

### 阶段三：推荐引擎与风控门禁升级 (Phase 3)
- **升级 `scripts/python/recommend_live.py`**：
  - 扩展比分可信源集合，支持 `{"ybty_market", "score_canvas", "leisu_text_live", "leisu_api", "provider_api"}`；
  - 严守比分核验门禁：比分未核验时绝不发放 A 级推荐，禁止结算剩余进球或后续时段让球；
  - 完善盘口与水位约束、四分之一盘口（赢半/输半/走盘）结算逻辑与凯利仓位计算。
- **升级 `scripts/python/recommend_prematch.py`**：
  - 综合首发阵容确认状态（`confirmed`）、核心伤停数与即初盘口异动；
  - 严格执行深盘拦截规则（强队非全主力/战意不明时最高评 C 级，不入正式串关）。

### 阶段四：前端各功能视图组件全面对齐与视觉增强 (Phase 4)
- **`src/components/LiveMatchesView.tsx`**：
  - 全面基于 `StandardMatchData` 渲染比赛卡片、即时技术统计对比条与微型动量火花线 (`MiniMomentumSparkline`)；
  - 明确标注比分核验标识（绿色安全徽章）与 YBTY 原始盘口深度。
- **`src/components/PrematchMatchesView.tsx`**：
  - 强化赛前分析卡片，展示初盘与即时盘对比、阵型克制与伤停情况；
  - 提供一键打开战术阵型弹窗与近期交锋弹窗。
- **`src/components/BettingRecommendationsView.tsx`**：
  - 区分机器初筛与正式推荐，高亮 A/B 级推荐方案、推荐时比分/分钟、凯利建议仓位与风控警告标签。
- **`src/components/AttackMomentumTimelineWidget.tsx`**：
  - 支持 90 分钟全场攻守压制波形图与半场切换；
  - 针对二维数组 `data[0]` (上半场) 与 `data[1]` (下半场) 提供完整的长度与边界保护。
- **`src/components/FormationClashModal.tsx` & `RecentFormModal.tsx`**：
  - 战术阵型模拟视图对齐 `PlayerInfo` 球员结构，按球衣号与姓名渲染战术站位；
  - 历史交锋与走势图清晰展示进球分布与胜负走势。
- **`src/components/LedgerView.tsx` & `ExportDataView.tsx`**：
  - 台账系统支持单场/串关精准核销、四分之一盘口结算；
  - 整合导出支持全量保留 YBTY、雷速原始数据、成功匹配及未匹配明细。

### 阶段五：系统构建、端到端集成验证与排查封板 (Phase 5)
- **TypeScript 编译检查**：运行 `npm run lint` (`tsc --noEmit`)，零类型错误，零缺失导入。
- **Python 管道执行验证**：
  - `python3 scripts/python/football_live.py ... --mode live` 成功完成双源 6 场赛事全量匹配，生成合法 Candidate。
  - `python3 scripts/python/recommend_live.py` 成功执行风控初筛并生成决策文件。
- **应用构建验证**：运行 `compile_applet` (`vite build`)，构建完全通过，静态产物打包无异常。

---

## 3. 系统核心数据契约规范参考

| 数据模块 | 核心字段 | 权威来源 | 规范要求 |
|---|---|---|---|
| 比赛基本标识 | `id`, `match`, `ybty_home`, `ybty_away`, `league` | YBTY 原始抓取 | 保持 YBTY 原始字串，不得任意改名 |
| 即时比分 | `score: { home, away }`, `score_verified`, `score_source` | YBTY + 雷速 API 交叉校验 | 必须经双源核验方可推荐 A 级 |
| 核心技术统计 | `unified_stats` (8项核心指标) | 雷速 `live_match.confirmed_statistics` | 结构化数字对象，禁止 string |
| 战术与阵型 | `tactical_context`, `lineups` | 雷速 `lineup` & `match_analysis` | 包含首发球员、阵型、伤停统计 |
| 攻守动量时序 | `attack_momentum_timeline` | 雷速 `live_match.attack_momentum_timeline` | 90分钟双半场压制数值数组 |
| 可投注盘口 | `ybty_raw_markets`, `market_snapshots` | YBTY `markets` | 包含全场/半场让球、大小球、独赢 |
| 参考初即盘 | `reference_market` | 雷速 `odds` | 仅作参考与走势比对，不可作为投注项 |

---

## 4. 阶段六：全场大小球/让球/独赢“无真实赔率”彻底修复 (Phase 6 - v3.0.2)

- **问题根因定位**：
  1. `verifiedMarket`（`src/lib/extendedRecommendation.ts`）在匹配 market_snapshots 时，写死 `market_type === 'total'`，无法识别 `full_total`、`total`、`全场大小球`、`over_under`、`OU` 等命名变体；
  2. YBTY 标准数据结构中，具体盘口选项以 `options: [{ side, line, odds, suspended }]` 数组保存，而原代码只检索了平铺的 `home_or_over_odds` / `away_or_under_odds`；
  3. `types.ts` 中的 `toStandardMatchData` 未对 `options` 数组与平铺赔率字段进行双向对称填充。
- **实施完成项**：
  - **`src/lib/extendedRecommendation.ts` 升级**：实现了 `matchesMarketCategory` 语义匹配器和 `extractOptionsFromMarket` 结构解析器，并在 `verifiedMarket` 中实现 7 级多源连锁回退；
  - **`src/components/BettingRecommendationsView.tsx` 升级**：市场基准行统一调用 `verifiedMarket` 提取权威基准；
  - **`src/lib/snapshotDeltaEngine.ts` 升级**：`ou_market` 与 `handicap_market` 统一调用 `verifiedMarket`；
  - **`src/utils/momentumAnalytics.ts` 升级**：强化让球盘口与赔率水位提取；
  - **`src/types.ts` 升级**：`toStandardMatchData` 实现 `options` 数组与平铺赔率双向互补；
  - **`src/components/ExportDataView.tsx` 升级**：导出 `verified_ybty_markets` 时完整保留 `options`。

---

## 5. 阶段七：初盘 vs 即盘对照穿透提取与双轨盘口权责固化 (Phase 7 - v3.0.3)

- **问题背景与业务诉求**：
  1. “赛前初盘 vs 滚球即盘对照”栏中，部分比赛出现 `让球 [初: +0.25 ➔ 现: -]` 或 `大小 [初: 2.5 ➔ 现: -]` 即盘为破折号的问题；
  2. 系统必须明确贯彻**双轨盘口权责**：YBTY 盘口是唯一真实的投注与结算执行盘口，雷速初盘、赛前盘与滚球即盘都是作为核心参考与辅助预测功能。
- **实施完成项**：
  - **`src/lib/snapshotDeltaEngine.ts` & `server/services/snapshotDeltaEngine.ts` 深度重构**：
    - 建立多层级即盘提取链路：优先提取 YBTY 实时导出的让球/大小球主盘；若 YBTY 暂缺或封盘，自动向下穿透提取雷速即盘数据 `reference_market.instant_handicap/instant_total`、`current_line` 及 `markets.*.live`，彻底消除破折号空值。
    - 结合雷速初盘基准（`initial_handicap/total`）与即盘数值，精准计算盘口衰减（`handicap_decay`, `total_decay`），自动识别“强队破门迟滞·初盘折价黄金期”与“攻势疲软·谨防初盘诱深”等战术成色模式。
  - **全系统规范文档更新**：同步更新 `README.md`、`docs/AI_SYSTEM_AND_DATA_CONTRACT.md`、`docs/SYSTEM_DATA_CONTRACT_AND_MAPPING.md`、`docs/PREDICTION_FEATURE_METHODOLOGY.md`、`CUSTOM_INSTRUCTIONS_COMPLETE.md` 以及 `docs/data_audit/` 目录下全部拓扑、契约与审计报告。

---

## 6. 后续运维与操作指引

1. **日常分析流水线调用**：
   - 滚球分析：
     ```bash
     python3 scripts/python/football_live.py sources/ybty_live.json --live-fixture sources/leisu_live.json --output output/ybty_leisu_candidates.json --mode live
     python3 scripts/python/recommend_live.py output/ybty_leisu_candidates.json --output output/ybty_leisu_decisions.json
     ```
   - 赛前分析：
     ```bash
     python3 scripts/python/football_live.py sources/ybty_prematch.json --live-fixture sources/leisu_prematch.json --output output/ybty_leisu_prematch_candidates.json --mode prematch
     python3 scripts/python/recommend_prematch.py output/ybty_leisu_prematch_candidates.json --output output/ybty_leisu_prematch_decisions.json
     ```
2. **开发与构建规范**：
   - 前端增加新字段时，必须首先在 `src/types.ts` 更新 `StandardMatchData` 接口并在 `src/utils/dataAdapter.ts` 中补充安全回退；
   - 每次代码提交前执行 `npm run lint` 验证类型安全。
