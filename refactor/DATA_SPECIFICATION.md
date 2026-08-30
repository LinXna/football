# 足球量化系统：重构目录数据规范与字段权威说明 (Refactor Data Specification)

> **版本**：v1.0 (重构定稿版)  
> **更新时间**：2026-08-29  
> **核心原则**：纯净无冗余、单一事实来源 (SSOT)、零派生噪音字段。

---

## 一、当前已落地目录与职责说明

当前重构已完成目录及职责如下（后续层级在实际开发落地时再行增补）：

| 目录路径 | 作用与职责说明 |
| :--- | :--- |
| `refactor/00_common/` | **【00 全局基石】** 全局跨模块枚举 (`enums.ts`)、统一领域异常与弹窗通知总线 (`errors.ts`)。 |
| `refactor/01_data_ingestion/ybty/` | **【01 接入层】** YBTY 数据强类型契约 (`types.ts`)、专属枚举分类管理 (`enums.ts`)、滚球提取器 (`ybtyLiveExtractor.ts`) 与赛前提取器 (`ybtyPrematchExtractor.ts`)。 |
| `refactor/01_data_ingestion/leisu/` | **【01 接入层】** 雷速数据强类型契约 (`types.ts`)、专属枚举分类管理 (`enums.ts`) 与接口数据提取器 (`leisuInterfaceExtractor.ts`)。 |
| `refactor/02_canonical_model/` | **【02 核心实体层】** 标准赛事契约 (`types.ts`)、对齐枚举分类 (`enums.ts`)、纯文本顺序实体对齐器 (`matchAligner.ts`) 与双源标准赛事装配器 (`canonicalMatchAssembler.ts`)。 |
| `refactor/samples/01_data_ingestion/` | **【样例数据区】** 存放清洗提取后生成的标准 JSON 样例文件与中英文档索引 ([`README.md`](./samples/01_data_ingestion/README.md))。 |
| `refactor/samples/02_canonical_model/` | **【样例数据区】** 存放标准赛事对象 (`CanonicalMatch`) 与 AI 提炼包 (`AiEvaluationBrief`) 样本与说明文档 ([`README.md`](./samples/02_canonical_model/README.md))。 |
| `refactor/fixtures/` | **【测试样本区】** 存放用于单元测试的真实原始抓取数据文件。 |
| `refactor/tests/` | **【测试用例区】** 存放针对各模块的单元测试脚本与断言验证。 |

---

## 二、YBTY 滚球清洗后标准数据结构 (`ybty_live`)

* 样例文件路径：`refactor/samples/01_data_ingestion/ybty/ybty_live_extracted_sample.json`
* 样例中文全量字段对照文档：`refactor/samples/01_data_ingestion/ybty/README.md`
* 提取器实现：`refactor/01_data_ingestion/ybty/ybtyLiveExtractor.ts`
* 强类型定义：`refactor/01_data_ingestion/ybty/types.ts`

### 1. 文件顶层字段说明 (Root Level)

```json
{
  "schema_version": 2,
  "export_version": "2.8.0",
  "captured_at": "2026-08-20T20:20:13.747Z",
  "matches": []
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `schema_version` | `number` | `2` | **协议大版本号**。作为入口强类型守卫，若插件重大改版导致版本不匹配则直接拦截，防止崩溃。 |
| `export_version` | `string` | `"2.8.0"` | **导出插件版本号**。用于排查浏览器插件版本与 DOM 解析兼容性。 |
| `captured_at` | `string` | `"2026-08-20T20:20:13.747Z"` | **全量抓取时间戳 (UTC ISO 8601)**。全文件仅存一份，用于时效性判定与赛事匹配时间窗口对齐。 |
| `matches` | `Array` | `[...]` | **滚球赛事明细列表**。包含本批次抓取到的全部滚球赛事。 |

---

### 2. 赛事基础信息字段说明 (Match Level)

```json
{
  "league": "英格兰甲级联赛",
  "home": "谢周三",
  "away": "布拉德福德城",
  "home_score": 0,
  "away_score": 1,
  "clock": "62:25",
  "clock_status": "62:25",
  "markets": {}
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `league` | `string` | `"英格兰甲级联赛"` | **YBTY 原始联赛名**。赛事层级识别与别名映射依据。 |
| `home` | `string` | `"谢周三"` | **YBTY 原始主队名**。系统绝对事实基准主队名（推荐与台账均以此为准）。 |
| `away` | `string` | `"布拉德福德城"` | **YBTY 原始客队名**。系统绝对事实基准客队名（推荐与台账均以此为准）。 |
| `home_score` | `number \| null` | `0` | **主队即时进球数**。数字类型，后续需与雷速比分画布交叉核验。 |
| `away_score` | `number \| null` | `1` | **客队即时进球数**。数字类型，后续需与雷速比分画布交叉核验。 |
| `clock` | `string \| null` | `"62:25"` / `null` | **正在踢球进行中的即时分钟**。⚠️ 仅在比赛踢球时有值；中场休息或暂停时恒为 `null`。 |
| `clock_status` | `string` | `"62:25"` / `"中场休息"` | **全周期比赛状态文本**。比赛踢球中与 `clock` 一致；中歇期为 `"中场休息"`。 |
| `markets` | `object` | `{...}` | **即时盘口数据集合**。包含全场独赢、全场让球、全场大小球及半场盘口。 |

---

### 3. 盘口数据字段说明 (Markets Level)

#### (1) 全场独赢 (`markets.full_h2h`) 与 半场独赢 (`markets.half_h2h`)
| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `home_odds` | `number` | `8.7` | **主胜欧赔 (含本金)**。数字类型，用于去抽水计算公允胜率。 |
| `draw_odds` | `number` | `3.75` | **平局欧赔 (含本金)**。数字类型。 |
| `away_odds` | `number` | `1.43` | **客胜欧赔 (含本金)**。数字类型。 |

#### (2) 全场让球 (`markets.full_spread_main`, `markets.full_spread_subs`) 与 半场让球 (`markets.half_spread_main`)
> ⚠️ **核心口径**：滚球让球盘口表示**自推荐时刻起双方比分视为 0:0，仅结算后续剩余时段的新增进球净胜**。

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `line_index` | `number` | `0` (主盘) / `1` (副盘) | **盘口深度索引**。`0` 表示核心主盘口，`1`、`2` 表示深度副盘。 |
| `home_selection` | `string` | `"-0/0.5"` / `"0"` / `"-0.5"` | **主队让球/受让盘口线**。字符串标准格式，支持四分之一盘。 |
| `home_odds` | `number` | `2.2` | **主队让球水位赔率**。数字类型。 |
| `away_selection` | `string` | `"+0/0.5"` / `"0"` / `"+0.5"` | **客队让球/受让盘口线**。字符串标准格式。 |
| `away_odds` | `number` | `1.71` | **客队让球水位赔率**。数字类型。 |

#### (3) 全场大小球 (`markets.full_total_main`, `markets.full_total_subs`) 与 半场大小球 (`markets.half_total_main`)
| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `line_index` | `number` | `0` (主盘) / `1` (副盘) | **盘口深度索引**。`0` 表示核心主盘口，`1`、`2` 表示高低副盘。 |
| `line` | `string` | `"2"` / `"2/2.5"` / `"1.5/2"` | **大小球分界线**。从原始 options 中直接提取，支持四分之一盘口。 |
| `over_odds` | `number` | `1.91` | **大球 (Over) 水位赔率**。数字类型。 |
| `under_odds` | `number` | `1.95` | **小球 (Under) 水位赔率**。数字类型。 |

---

## 三、YBTY 赛前清洗后标准数据结构 (`ybty_prematch`)

* 样例文件路径：`refactor/samples/01_data_ingestion/ybty/ybty_prematch_extracted_sample.json`
* 提取器实现：`refactor/01_data_ingestion/ybty/ybtyPrematchExtractor.ts`
* 强类型定义：`refactor/01_data_ingestion/ybty/types.ts`

### 1. 文件顶层字段说明 (Root Level)

```json
{
  "schema_version": 2,
  "export_version": "2.8.0",
  "captured_at": "2026-08-23T01:04:18.978Z",
  "matches": []
}
```

### 2. 赛前赛事基础信息字段说明 (Match Level)

```json
{
  "league": "美国职业大联盟",
  "home": "温哥华白帽",
  "away": "达拉斯FC",
  "clock_status": "25分钟后开赛",
  "markets": {}
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `league` | `string` | `"美国职业大联盟"` | **YBTY 原始联赛名**。 |
| `home` | `string` | `"温哥华白帽"` | **YBTY 原始主队名**。系统绝对事实基准主队名。 |
| `away` | `string` | `"达拉斯FC"` | **YBTY 原始客队名**。系统绝对事实基准客队名。 |
| `clock_status` | `string` | `"即将开赛"` / `"25分钟后开赛"` | **开赛前状态描述**。 |
| `markets` | `object` | `{...}` | **赛前盘口集合**（全场/半场独赢、全场/半场主副盘让球与大小球）。 |

> 📌 **开赛时间说明**：开赛时间统一由雷速等权威数据源提供，YBTY 不再存储或推算 `countdown`、`commence_time` 或 `play_count`。

---

## 四、雷速 (Leisu) 接口清洗后标准数据结构 (`leisu_interface`)

* 样例文件路径：`refactor/samples/01_data_ingestion/leisu/leisu_extracted_sample.json`
* 样例中文全量字段对照文档：`refactor/samples/01_data_ingestion/leisu/README.md`
* 提取器实现：`refactor/01_data_ingestion/leisu/leisuInterfaceExtractor.ts`
* 强类型定义：`refactor/01_data_ingestion/leisu/types.ts`
* 集中枚举管理器：`refactor/01_data_ingestion/leisu/enums.ts`

### 1. 文件顶层字段说明 (Root Level)

```json
{
  "export_version": "2.8.0",
  "export_type": "leisu_interface_data",
  "captured_at": "2026-08-20T20:20:34.703Z",
  "matches": []
}
```

### 2. 雷速赛事核心字段说明 (Match Level)

```json
{
  "match_id": "4562395",
  "competition_id": 84,
  "home_team_id": 10101,
  "away_team_id": 10102,
  "home_team": "谢周三",
  "away_team": "布拉德福德",
  "competition": "英甲",
  "commence_time": "2026-08-20T19:00:00.000Z",
  "status_id": 4,
  "status_text": "下半场",
  "is_live": true,
  "score": { "home": 0, "away": 1 },
  "half_score": { "home": 0, "away": 0 },
  "score_verified": true,
  "venue": {
    "name": "希尔斯堡球场",
    "city": "谢菲尔德",
    "country": "England",
    "capacity": 34835
  },
  "environment": {
    "weather": "局部有云",
    "temperature": "14°C",
    "humidity": "89%",
    "wind": "4.5m/s",
    "pressure": "757mmHg"
  },
  "stats": {
    "corners": { "home": 6, "away": 7 },
    "yellow_cards": { "home": 1, "away": 0 },
    "red_cards": { "home": 0, "away": 0 },
    "attacks": { "home": 61, "away": 70 },
    "dangerous_attacks": { "home": 38, "away": 30 },
    "possession": { "home": 60, "away": 40 },
    "shots_on_target": { "home": 3, "away": 3 },
    "shots_off_target": { "home": 5, "away": 3 },
    "shots": { "home": 8, "away": 6 }
  },
  "attack_momentum": {
    "available": true,
    "segment_count": 2,
    "nominal_segment_minutes": 45,
    "data": [[...], [...]]
  },
  "timeline_events": [],
  "lineups": {
    "confirmed": true,
    "venue": { ... },
    "home_formation": "4-2-3-1",
    "away_formation": "3-4-2-1",
    "home_manager": "佩德森",
    "away_manager": "亚历山大",
    "home_starters": [],
    "away_starters": [],
    "home_substitutes": [],
    "away_substitutes": [],
    "home_injuries": [],
    "away_injuries": [],
    "home_market_value": "1230万欧",
    "away_market_value": "402.5万欧",
    "home_average_age": "27.5岁",
    "away_average_age": "28.9岁"
  },
  "odds_matrix": {
    "company_name": "3*",
    "initial": { ... },
    "pregame": { ... },
    "live": { ... }
  },
  "tactical_context": {
    "head_to_head_count": 6,
    "home_recent_matches_count": 40,
    "away_recent_matches_count": 40,
    "h2h_raw": [],
    "home_recent_matches": [],
    "away_recent_matches": []
  },
  "league_standings": {
    "has_data": true,
    "home_team": { "team_id": 10101, "team_name": "谢周三", "overall": { "position": 6, "points": 3 } },
    "away_team": { "team_id": 10102, "team_name": "布拉德福德", "overall": { "position": 3, "points": 3 } }
  },
  "goal_distribution": {
    "has_data": true,
    "home_team": { "all": { "matches_count": 1, "scored_intervals": [], "first_scored_intervals": [] } },
    "away_team": { "all": { "matches_count": 1, "scored_intervals": [], "first_scored_intervals": [] } }
  }
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `match_id` | `string` | `"4562395"` | **雷速系统全局唯一比赛 ID**。 |
| `competition_id` | `number \| null` | `84` | **所属赛事/联赛唯一 ID**。用于同赛事比赛关联与杯赛/联赛特征归类。 |
| `home_team_id` | `number \| null` | `10101` | **主队唯一 ID**。作为实体对齐层（Layer 02）**首选强匹配依据**（有 ID 先匹配 ID 锁定，无 ID 再走队名别名相似度）。 |
| `away_team_id` | `number \| null` | `10102` | **客队唯一 ID**。作为实体对齐层首选强匹配依据。 |
| `home_team` | `string` | `"谢周三"` | **雷速标准主队名**。 |
| `away_team` | `string` | `"布拉德福德"` | **雷速标准客队名**。 |
| `competition` | `string` | `"英甲"` | **雷速标准联赛/杯赛名称**。 |
| `commence_time` | `string \| null` | `"2026-08-20T19:00:00.000Z"` | **比赛开赛时间（UTC ISO 8601 格式）**。由 `matchTime` 秒级时间戳转换。 |
| `status_id` | `number` | `4` | **比赛状态枚举代码**（见下方枚举字典）。 |
| `status_text` | `string` | `"下半场"` | **比赛状态文本**。 |
| `is_live` | `boolean` | `true` | **是否为滚球进行中比赛**（`2 <= status_id <= 7`）。 |
| `score` | `object \| null` | `{ "home": 0, "away": 1 }` | **即时全场比分**。 |
| `half_score` | `object \| null` | `{ "home": 0, "away": 0 }` | **半场比分**。 |
| `score_verified` | `boolean` | `true` | **比分核验标记**（必须经过可靠接口/画布交叉校验，未核验禁止给 A 级推荐）。 |
| `venue` | `object \| null` | `{...}` | **比赛场地信息**（球场名 `name`、城市 `city`、国家 `country`、容量 `capacity`）。 |
| `environment` | `object` | `{...}` | **天气与物理环境**（气温、天气、风速、气压、湿度）。 |
| `stats` | `object` | `{...}` | **8大核心攻防统计**（角球、黄牌、红牌、进攻、危险进攻、控球率、射正、射偏、总射门）。 |
| `attack_momentum` | `object` | `{...}` | **实时攻防动量波形时序数据**（包含上下半场每分钟压迫指数矩阵。⚠️ **雷速端唯一合法的时间轴点阵**，点阵长度即代表已进行分钟数）。 |
| `timeline_events` | `array` | `[...]` | **文字直播事件时序**（由枚举管理器统一解析 `type`、`type_name`、`side`、`minute`、`text`。⚠️ **仅代表离散历史事件发生时间，严禁当做比赛当前进行的即时时钟！**）。 |
| `lineups` | `object` | `{...}` | **首发阵型与球员阵容**（阵型、主教练、身价、平均年龄、首发/替补/伤停名单及球员详细字段）。 |
| `odds_matrix` | `object` | `{...}` | **初盘/即盘/滚球赔率矩阵**（让球、独赢、大小球、角球盘）。 |
| `tactical_context` | `object` | `{...}` | **基本面深度上下文**（历史交锋、主客队近期全量战绩明细）。 |
| `league_standings` | `object` | `{...}` | **联赛积分榜与主客场排名**（总/主/客 3 维度战绩，包含排名、胜平负、进失球、净胜球、积分、胜率）。 |
| `goal_distribution` | `object` | `{...}` | **进球时间分布与首球偏好**（1-15'、16-30'、31-45'、46-60'、61-75'、76-90' 六大时段进球与首开纪录占比）。 |

---

### 3. 雷速全局类型与枚举管理登记表 (Enum Registry)

系统通过 `refactor/01_data_ingestion/leisu/enums.ts` 集中管理所有枚举值，并在解析时挂载**未知枚举捕获与告警收集器**（发现未登记的新 `type` 会立即控制台告警并收集，便于开发与分析人员快速登记）。

#### (1) 比赛状态枚举 (`LeisuMatchStatus`)
| 代码 (`Code`) | 枚举标识符 | 中文语义说明 |
| :---: | :--- | :--- |
| `1` | `NOT_STARTED` | 未开赛 |
| `2` | `FIRST_HALF` | 上半场 |
| `3` | `HALF_TIME` | 中场休息 |
| `4` | `SECOND_HALF` | 下半场 |
| `5` | `OVERTIME` | 加时赛 |
| `7` | `PENALTY_SHOOTOUT` | 点球大战 |
| `8` | `FINISHED` | 完场 |
| `9` | `POSTPONED` | 推迟 |
| `10` | `INTERRUPTED` | 中断 |
| `11` | `CANCELLED_CUT` | 腰斩 |
| `12` | `CANCELLED` | 取消 |

#### (2) 触发方方位枚举 (`LeisuMatchSide`)
| 标识符 | 对应原始 `position` | 中文语义说明 |
| :--- | :---: | :--- |
| `"home"` | `1` | 主队触发 |
| `"away"` | `2` | 客队触发 |
| `"neutral"` | `0` | 中立/裁判/系统提示 |

#### (3) 文字直播时序事件类型枚举 (`LeisuTimelineEventType`)
| 代码 (`Code`) | 枚举标识符 | 中文名称 | 语义说明 |
| :---: | :--- | :--- | :--- |
| `0` | `SYSTEM_NOTICE` | 系统提示/准备 | 开赛前准备、热身等系统消息 |
| `1` | `GOAL` | 进球 | 进球事件 |
| `2` | `CORNER` | 角球 | 获得角球 |
| `3` | `YELLOW_CARD` | 黄牌 | 出示黄牌 |
| `4` | `RED_CARD` | 红牌 | 直接出示红牌 |
| `5` | `OFFSIDE` | 越位 | 进攻越位 |
| `9` | `SUBSTITUTION` | 换人 | 球员换人调整 |
| `10` | `KICK_OFF` | 开球 | 比赛开始/上半场开球 |
| `11` | `HALF_TIME_WHISTLE` | 半场结束 | 半场哨响 |
| `12` | `FULL_TIME_WHISTLE` | 全场结束 | 完场哨响 |
| `16` | `PENALTY_MISSED` | 点球射失 | 点球未进/射偏/被扑 |
| `21` | `SHOT_ON_TARGET` | 射正 | 射中门框范围以内 |
| `22` | `SHOT_OFF_TARGET` | 射偏 | 射出门框范围以外 |
| `23` | `TWO_YELLOW_TO_RED` | 两黄变红 | 累计两张黄牌罚下 |
| `28` | `VAR_INCIDENT` | VAR核查 | 视频助理裁判介入 |
| `30` | `FOUL` | 犯规 | 犯规判罚 |

#### (4) 球员个人事件类型枚举 (`LeisuPlayerIncidentType` - 独立命名空间)
| 代码 (`Code`) | 枚举标识符 | 中文名称 | 语义说明 |
| :---: | :--- | :--- | :--- |
| `1` | `GOAL` | 进球 | 球员个人进球 |
| `3` | `YELLOW_CARD` | 黄牌 | 球员吃黄牌 |
| `4` | `RED_CARD` | 红牌 | 球员吃红牌 |
| `8` | `SAVE` | 扑救 | 门将扑救/防线关键解围 |
| `9` | `INJURY_SUB` | 受伤换人 | 球员因伤下场换人 |
| `16` | `PENALTY_MISSED` | 射失点球 | 球员主罚点球射失 |
| `23` | `TWO_YELLOW_TO_RED` | 两黄变红 | 球员两黄变红罚下 |
| `28` | `SPECIAL_EVENT` | 特殊事件 | 球员特殊技术事件 |
| `99` | `ASSIST` | 助攻 | 球员关键助攻 |

#### (5) 球员阵容出场与伤停状态枚举 (`LeisuPlayerStatus`)
| 代码 (`Code`) | 枚举标识符 | 中文名称 | 语义说明 |
| :---: | :--- | :--- | :--- |
| `1` | `STARTER` | 首发出场 | 官方首发 11 人阵容 |
| `0` | `SUBSTITUTE` | 替补待命 | 替补席球员 |
| `2` | `INJURED_ABSENT` | 伤停 | 伤病缺阵名单球员 |
| `3` | `SUSPENDED` | 停赛 | 停赛缺阵名单球员 |
| `-1` | `UNKNOWN` | 未指定 | 未知/未指定状态 |

#### (6) 文字直播事件时序保真规则 (Timeline Chronological Order)
* 雷速接口文字直播数组 `text_live` **本身即为比赛正向发生的时序**（包含开场提示、射偏、射正、越位、进球等全部明细）。
* 提取器 `timeline_events` **100% 保持原始时间先后顺序进行序列化**，严禁任何逆序翻转或漏项截断。在同分钟（例如 6'）存在多个事件时，严格按照雷速接口推送的先后索引保存（如先 `6' 射正` 再 `6' 越位`）。

---

## 五、亚洲让球盘 (Asian Handicap) 权威符号契约、换算规则与全生命周期结算口径

本章为全系统**亚洲让球盘唯一事实来源 (SSOT)**。全链路所有模块（数据清洗、实体对齐、量化推演、AI评估、风控台账、赛后核销）必须 100% 遵照本规范执行。

---

### 1. 符号定义与数值契约对照 (Sign Conventions)

| 盘口类型 (中文) | 雷速数值 `line` (浮点数) | YBTY 原始盘口文本 (`home_selection` / `away_selection`) | 盘口拆解与让球方归属 |
| :--- | :---: | :--- | :--- |
| **平手盘** | `0.0` / `0` | 主: `"0"` 或 `"0.0"`<br>客: `"0"` 或 `"0.0"` | 双方互不让球（走水退本） |
| **主让平半** | `+0.25` | 主: `"-0/0.5"` 或 `"-0.25"`<br>客: `"+0/0.5"` 或 `"+0.25"` | 主让 0 与 主让 0.5 各占 50% 额度 |
| **主让半球** | `+0.5` | 主: `"-0.5"`<br>客: `"+0.5"` | 主让 0.5 球（赢球全赢，打平全输） |
| **主让半一** | `+0.75` | 主: `"-0.5/1"` 或 `"-0.75"`<br>客: `"+0.5/1"` 或 `"+0.75"` | 主让 0.5 与 主让 1.0 各占 50% 额度 |
| **主让一球** | `+1.0` | 主: `"-1"` 或 `"-1.0"`<br>客: `"+1"` 或 `"+1.0"` | 主让 1.0 球（净胜 1 球走盘退本） |
| **主让一球/球半** | `+1.25` | 主: `"-1/1.5"` 或 `"-1.25"`<br>客: `"+1/1.5"` 或 `"+1.25"` | 主让 1.0 与 主让 1.5 各占 50% 额度 |
| **主受让平半 (客让平半)** | `-0.25` | 主: `"+0/0.5"` 或 `"+0.25"`<br>客: `"-0/0.5"` 或 `"-0.25"` | 客让 0 与 客让 0.5 各占 50% 额度 |
| **主受让半球 (客让半球)** | `-0.5` | 主: `"+0.5"`<br>客: `"-0.5"` | 客让 0.5 球 |
| **主受让半一 (客让半一)** | `-0.75` | 主: `"+0.5/1"` 或 `"+0.75"`<br>客: `"-0.5/1"` 或 `"-0.75"` | 客让 0.5 与 客让 1.0 各占 50% 额度 |
| **主受让一球 (客让一球)** | `-1.0` | 主: `"+1"` 或 `"+1.0"`<br>客: `"-1"` 或 `"-1.0"` | 客让 1.0 球 |

> 📌 **核心符号记忆律**：
> - **雷速接口浮点数**：`line > 0` 为**主让**（主队优势）；`line < 0` 为**主受让**（客队优势）。
> - **YBTY 盘口字符串**：`"-"` 开头为**让球方**；`"+"` 开头为**受让方**。

---

### 2. 全生命周期计算时机与阶段职责 (When & Where Calculations Happen)

在整套 6 层数据流水线中，让球盘的计算与校验严格分布在不同阶段：

```
[Layer 01: 01_data_ingestion]      ── 原始字符标准化、四分之一盘提取、浮点数转换 (不修改盘口语义)
              │
              ▼
[Layer 02: 02_canonical_model]     ── YBTY 字符盘口与雷速数值盘口双向映射对齐，校验主客一致性
              │
              ▼
[Layer 03: 03_quant_engine]        ── 【核心量化计算】：
                                      1. 赛前盘：基于泊松分布计算各净胜球概率矩阵 P(Home - Away = k)
                                      2. 滚球盘【强制 0:0 重置】：基于剩余时间与危攻斜率推演剩余时段净胜期望
              │
              ▼
[Layer 04: 04_ai_evaluator]        ── 【风控与价值校验】：
                                      1. 校验期望净胜与盘口线是否具备 +EV 安全边际
                                      2. 杯赛/弱旅深盘 (Line >= 1.0) 硬性阵容核验与阻断
              │
              ▼
[Layer 05: 05_portfolio_risk]      ── 组合风控：A/B 级推荐准入，单场与串关腿数隔离
              │
              ▼
[Layer 06: 06_settlement_audit]    ── 【精确赛后核销】：
                                      1. 赛前盘核销：全场净胜球 vs 盘口线
                                      2. 滚球盘核销：(完场比分 - 推荐时比分) vs 盘口线
```

---

### 3. 精确数学核销算法与算式 (Settlement Formulas)

设净胜球判定基准为 $\Delta G$：
* **赛前让球**：$\Delta G = \text{Score}_{\text{home}} - \text{Score}_{\text{away}}$
* **滚球让球 (0:0 规则)**：$\Delta G = (\text{Final}_{\text{home}} - \text{LiveRec}_{\text{home}}) - (\text{Final}_{\text{away}} - \text{LiveRec}_{\text{away}})$

以**投注主队**、雷速让球基准线 $L = \text{line}$（如主让平半 $L = +0.25$，主让半球 $L = +0.5$）为例：
* 设净让球差值 $D = \Delta G - L$

| 净差值 $D = \Delta G - L$ | 结算状态 (`SettlementOutcome`) | 盈亏结算乘数 ($\times \text{本金}$) | 说明 |
| :---: | :---: | :---: | :--- |
| $D \ge +0.5$ | `WIN` (全赢) | $+ \text{Odds}_{\text{net}}$ | 净胜球完全穿盘，收获全额盈利 |
| $D = +0.25$ | `HALF_WIN` (赢半) | $+ 0.5 \times \text{Odds}_{\text{net}}$ | 四分之一盘半盘赢，半盘走水 |
| $D = 0$ | `PUSH` (走水) | $0.0$ | 全额退还本金 |
| $D = -0.25$ | `HALF_LOSS` (输半) | $- 0.5$ | 四分之一盘半盘输，半盘走水（损失 50% 本金） |
| $D \le -0.5$ | `LOSS` (全输) | $- 1.0$ | 完全未穿盘，损失全部本金 |

---

## 六、Layer 02: CanonicalMatch 标准赛事合并实体规范 (纯净未计算)

* 模块路径：`refactor/02_canonical_model/`
* 样例文件路径：`refactor/samples/02_canonical_model/canonical_match_sample.json`
* 样例中英文档索引：`refactor/samples/02_canonical_model/README.md`
* 装配器实现：`refactor/02_canonical_model/canonicalMatchAssembler.ts`
* 实体对齐器实现：`refactor/02_canonical_model/matchAligner.ts`
* 强类型定义：`refactor/02_canonical_model/types.ts`
* 专属枚举管理：`refactor/02_canonical_model/enums.ts`

### 1. 核心定位与设计红线 (Core Architecture Laws)

`CanonicalMatch` 是全量化评估系统全生命周期流转的**唯一标准赛事实体 (Single Source of Truth, SSOT)**。它在第 4 步导入核准后，将 YBTY 交易盘口数据与雷速全量基本面/时序数据进行深度绑定装配：

1. **纯净未计算原则 (Pure Uncalculated State)**：
   - 处于 Layer 02 的 `CanonicalMatch` 仅负责多源数据的清洗、融合、对齐与完整度判定；
   - **绝对不包含任何主观量化计算或衍生特征**（如泊松推演剩余进球期望、剥水公允赔率、+EV 价值、进攻危攻斜率等全部留给 Layer 03 `03_quant_engine` 纯函数计算）；
   - 保留最客观、无偏的原始融合状态。
2. **权责分工与数据流向绝对边界 (Strict Data Flow & Responsibility Boundary)**：
   - **YBTY 盘口与滚球时钟数据**：**深度参与计算与预测**。负责提供让球/大小球/独赢/主副盘精确盘口线与赔率，以及滚球进行中的即时分钟数 (`minute`，从 `ybty_display_clock` 解析)，用于 Layer 03 泊松时间衰减推演、剥水公允概率、+EV 计算与盘口深度比对；
   - **YBTY 队名与联赛名**：**纯出票展示与投注映射，绝不参与预测计算**。仅用于在管理面板、推荐结果中直观展示，让你在 YBTY 上零认知转换直接出票；
   - **雷速全量数据**：**深度参与计算与预测**。负责提供开赛时间转换 (`beijing_start_time`)、比分画布校验 (`score_verified`)、8 大攻防技术统计 (`stats`)、动量波形时序 (`attack_momentum`)、首发阵型阵容 (`lineups`)、联赛积分榜 (`league_standings`) 与时段进球分布 (`goal_distribution`)。雷速不提供滚球时钟，严禁从雷速事件时间臆造当前时间。
3. **导入拦截与深度绑定 (Pre-Import Gate & Deep Binding)**：
   - YBTY 与雷速匹配不上的比赛，在导入弹窗中明确展示并禁止勾选导入；
   - 只有经人工视觉确认并勾选导入的比赛，才正式生成 `CanonicalMatch`；
   - 进入系统的每场合法比赛均深度绑定雷速 `match_id` 与全量基本面数据。
4. **比分冲突一票熔断机制 (Score Mismatch Safety Fuse)**：
   - 滚球赛事若检测到 YBTY 与雷速即时比分不一致，立即标记 `is_mismatch_detected = true` 并将完整度降为 `TIER_INVALID`，下游严格阻断 AI 推荐与串关准入。

---

### 2. CanonicalMatch 顶层字段规范 (Top-Level Fields)

```json
{
  "canonical_id": "4562395",
  "match_slug": "英格兰甲级联赛_谢周三_vs_布拉德福德城",
  "created_at": "2026-08-29T23:32:51.887Z",
  "completeness_tier": "TIER_1_FULL",
  "missing_reasons": [],
  "alignment": { ... },
  "league_name": "英格兰甲级联赛",
  "home_team_name": "谢周三",
  "away_team_name": "布拉德福德城",
  "timing": { ... },
  "score": { ... },
  "markets": { ... },
  "reference": { ... }
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 数据源头 (`Data Source`) | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- | :--- |
| `canonical_id` | `string` | `"4562395"` | **雷速 (Leisu)** | **赛事全局唯一物理主键**。严格确立为雷速赛事 ID (`leisu_match_id`)，物理世界唯一且不可重复，作为全系统跨模块流转与推荐台账唯一主键。 |
| `match_slug` | `string` | `"英格兰甲级联赛_谢周三_vs_布拉德福德城"` | **双源合成** | **业务自然语言对阵标识**。格式：`${league_name}_${home_team_name}_vs_${away_team_name}`，作为辅助人类可读检索。 |
| `created_at` | `string` | `"2026-08-29T23:32:51.887Z"` | **系统流水线** | **实体装配 UTC ISO 8601 时间戳**。记录装配流水线执行的具体时点。 |
| `completeness_tier` | `DataCompletenessTier` | `"TIER_1_FULL"` | **系统判定** | **数据完整度分级**（`TIER_1_FULL`, `TIER_2_BASIC`, `TIER_3_SPARSE`, `TIER_INVALID`），作为风控与推荐门槛准入核心依据。 |
| `missing_reasons` | `MissingDataReason[]` | `[]` | **系统判定** | **数据缺口枚举清单**。显式罗列当前赛事缺失的维度（如阵型、时序、积分或比分未校验）。 |
| `alignment` | `MatchAlignmentDecision` | `{...}` | **系统对齐引擎** | **数据源关联溯源与对齐元数据**。作为入库审计凭证与排错追溯元数据，记录对齐状态、置信分、关联 ID 与说明。主系统量化与分析层不依赖底层算分过程。 |
| `league_name` | `string` | `"英格兰甲级联赛"` | **YBTY (法定)** | **YBTY 原始法定联赛名**。系统法定基准。 |
| `home_team_name` | `string` | `"谢周三"` | **YBTY (法定)** | **YBTY 原始法定主队名**。系统法定基准，推荐与出票一律以此为准。 |
| `away_team_name` | `string` | `"布拉德福德城"` | **YBTY (法定)** | **YBTY 原始法定客队名**。系统法定基准，推荐与出票一律以此为准。 |
| `timing` | `CanonicalTimingState` | `{...}` | **双源综合** | **标准时点与进行状态**。包含北京开赛时间、时间来源、滚球分钟（YBTY唯一权威）、半场/加时标记。 |
| `score` | `CanonicalScoreState` | `{...}` | **双源交叉校验** | **双源校验比分状态**。包含即时比分、半场比分、校验源、校验标记与冲突警告。 |
| `markets` | `CleanMarketsGroup` | `{...}` | **YBTY (唯一交易源)** | **YBTY 法定交易盘口组**（全场/半场独赢、全场/半场让球主副盘、全场/半场大小球主副盘，100%来自YBTY）。 |
| `reference` | `CanonicalLeisuReference \| null` | `{...}` / `null` | **雷速 (Leisu)** | **雷速基本面与时序增强包**。未匹配雷速或数据缺失时为 `null`。 |

---

### 3. 核心子模块强类型结构拆解

#### (1) 数据源关联溯源元数据 (`alignment: MatchAlignmentDecision`)

> ⚠️ **架构权责边界**：  
> 队名清洗、别名学习、文本相似度比对与主客颠倒排查已**在 Layer 01/02 智能导入向导阶段一次性完成**。进入 `CanonicalMatch` 标准实体后，仅保留最简对齐结论与溯源元数据，严禁在后续量化与分析层暴露或依赖底层相似度算分过程。

```typescript
export interface MatchAlignmentDecision {
  status: MatchAlignmentStatus;        // 对齐状态枚举
  confidence_score: number;            // 0 ~ 100 综合置信分
  home_team_match: TeamNameMatchResult;// 主队匹配明细 (含 raw_text_similarity, is_alias_exact_hit)
  away_team_match: TeamNameMatchResult;// 客队匹配明细
  league_match: LeagueMatchResult;     // 联赛匹配明细 (含 similarity, is_alias_exact_hit)
  league_match_score: number;          // 0.0 ~ 1.0 联赛相似度
  is_swapped_suspected: boolean;       // ⚠️ 是否疑似主客场颠倒
  alignment_reason: string;            // 对齐决策文字说明
}
```

* **对齐状态枚举 (`MatchAlignmentStatus`)**：
  - `MATCHED_BY_ALIAS`：通过别名库精确命中（置信分 100）；
  - `MATCHED_AUTO`：纯文本顺序高相似度自动对齐（置信分 $\ge 85$）；
  - `NEEDS_MANUAL_SELECTION`：低置信度待选（$50 \le \text{分} < 85$），需人工确认；
  - `SWAPPED_HOME_AWAY`：主客颠倒严重警报；
  - `UNMATCHED`：未匹配（置信分 $< 50$）。

#### (2) 标准时点与进行状态 (`timing: CanonicalTimingState`)

时间统一标准化转换为**北京时间 (UTC+8, 格式 `YYYY-MM-DD HH:mm:ss`)**，杜绝裸露的 'T'、'Z' 或 UTC 零时区时间。

```typescript
export interface CanonicalTimingState {
  stage: MatchStage;                  // PREMATCH (赛前) | LIVE (滚球) | FINISHED (完场)
  beijing_start_time: string;         // YYYY-MM-DD HH:mm:ss 标准北京时间
  start_time_source: "YBTY_EXACT" | "YBTY_ESTIMATED" | "LEISU_SUPPLEMENTED";
  minute: number | null;              // 滚球进行分钟 (严格由 YBTY 即时盘口时钟 ybty_display_clock 解析，中场锁定 45，赛前为 null；雷速不提供滚球时钟)
  is_half_time: boolean;              // 是否中场休息
  is_extra_time: boolean;             // 是否加时赛
  is_overtime_or_penalty: boolean;    // 是否点球大战
  ybty_display_clock: string | null;  // YBTY 即时时钟文本 (如 "23:23", "45'", "HT", "即将开赛")
}
```

#### (3) 双源校验比分状态 (`score: CanonicalScoreState`)

```typescript
export interface CanonicalScoreState {
  home_score: number;                 // 即时主队得分
  away_score: number;                 // 即时客队得分
  home_half_score: number | null;     // 半场主队得分
  away_half_score: number | null;     // 半场客队得分
  score_verified: boolean;            // 是否通过可靠校验 (YBTY一致且雷速比分画布校验通过)
  score_source: "LEISU_CANVAS" | "LEISU_INTERFACE" | "YBTY_DIRECT" | "UNVERIFIED";
  is_mismatch_detected: boolean;      // 是否检测到双源比分冲突
  mismatch_details?: string | null;   // 冲突明细 (如 "比分冲突: YBTY(0-0) vs 雷速(0-1)")
}
```

#### (4) 雷速全量基本面增强包 (`reference: CanonicalLeisuReference`)

```typescript
export interface CanonicalLeisuReference {
  leisu_match_id: string;             // 雷速比赛唯一 ID
  leisu_home_name: string;            // 雷速主队名
  leisu_away_name: string;            // 雷速客队名
  leisu_league_name: string;          // 雷速联赛名
  stats: ParsedLeisuStats | null;     // 8 大核心攻防统计
  attack_momentum: ParsedLeisuMomentum | null; // 分钟级压迫动量波形
  timeline_events: ParsedLeisuTimelineEvent[]; // 正向时序文字直播事件
  lineups: ParsedLeisuLineup | null;  // 首发阵型与球员身价/年龄名单
  tactical_context: ParsedLeisuTacticalContext | null; // 历史交锋与近期战绩
  odds_matrix: ParsedLeisuOddsMatrix | null;   // 初/即/滚三阶段参考赔率
  league_standings: ParsedLeagueStandings | null; // 联赛总/主/客积分榜与排名
  goal_distribution: ParsedGoalDistribution | null; // 6 大时段进球分布与首球偏好
}
```

---

### 4. 数据完整度分级与风控准入依据

| 完整度等级 (`DataCompletenessTier`) | 判定标准 | 风控与推荐准入权限 |
| :--- | :--- | :--- |
| `TIER_1_FULL` | 阵型/首发、攻防统计、动量波形、积分榜与进球分布**全维度具备**，且比分核验通过 | **全量准入**：支持生成 A/B/C 级正式单场推荐与多组正式串关。 |
| `TIER_2_BASIC` | 具备 8 大攻防统计与基础数据，但阵型未公布或缺少部分动量时序 | **受限准入**：最高只允许 B 级推荐，且同一方向最多进入一组串关。 |
| `TIER_3_SPARSE` | 未匹配到雷速或仅有基础盘口比分，缺少深度统计 | **严禁推荐**：仅作行情监控，严禁进入正式 AI 评估与串关。 |
| `TIER_INVALID` | 检测到双源比分冲突、主客颠倒或源头数据损坏 | **一票熔断**：标记为脏数据，禁止一切评估与投注。 |

---

### 5. 极简 AI 提炼包规范 (`AiEvaluationBrief`)

为了避免将上万行 DOM 结构与冗长字段直接喂给大模型导致 Token 暴涨和注意力分散，装配器内置了 `extractAiEvaluationBrief(canonicalMatch)` 纯函数，提纯为每场仅占 **200~400 Tokens** 的超轻量高信息密度载体：

```typescript
export interface AiEvaluationBrief {
  match_id: string;                    // 唯一主键
  league: string;                      // 联赛
  kickoff_time: string;                // 北京开赛时间
  status_summary: string;              // 例如 "LIVE 68' (1-0, 0红)" 或 "PREMATCH"
  teams: { home: string; away: string };// YBTY 法定队名
  score_verification: {
    is_verified: boolean;
    current_score: string;             // "1 - 0"
  };
  core_markets: {
    ah_main?: { handicap: string; home_odds: number; away_odds: number } | null;
    ou_main?: { handicap: string; over_odds: number; under_odds: number } | null;
    euro_1x2?: { home_win: number; draw: number; away_win: number } | null;
    ah_half?: { handicap: string; home_odds: number; away_odds: number } | null;
    ou_half?: { handicap: string; over_odds: number; under_odds: number } | null;
  };
  condensed_features: {
    possession?: { home: number; away: number } | null;
    shots_on_target?: { home: number; away: number } | null;
    dangerous_attacks?: { home: number; away: number } | null;
    corners?: { home: number; away: number } | null;
    recent_momentum_5min?: { home: number; away: number } | null;
    recent_momentum_15min?: { home: number; away: number } | null;
    formations?: { home: string; away: string } | null; // 如 "4-3-3 vs 5-3-2"
    h2h_summary?: string | null;                        // 如 "10场 4胜3平3负"
    league_rank?: { home: number; away: number } | null;
  };
  data_deficits: string[];             // 明确的数据缺口提示，供 AI 评估时作不稳定性熔断
}
```

---

## 五、Layer 03 确定性量化与博弈特征规范 (`QuantitativeFeatures`)

* 样例文件路径：`refactor/samples/03_quant_engine/quant_features_sample.json`
* 引擎实现：`refactor/03_quant_engine/index.ts`
* 强类型定义：`refactor/03_quant_engine/types.ts`
* 包含 **37 项不可变量化要素**，分为 6 大领域子系统：

### 1. 顶层结构与统帅部综合指标 (`Root Level`)

```typescript
export interface QuantitativeFeatures {
  schema_version: 1;
  match_id: string;
  calculated_at: string;
  context: CleanedContextFeatures;               // 1. 基本面清洗与环境修正
  momentum: MomentumTimelineFeatures;            // 2. 动量时序与动态压迫特征
  physical_stats: RealTimePhysicalStatsFeatures; // 3. 现场物理攻防与威胁转化
  poisson: InPlayPoissonFeatures;                // 4. 滚球 Forward 泊松与剩余期望
  devig: MarketDevigFeatures;                    // 5. 市场去抽水与全盘口 EV
  battlefield_dominance_index: number;           // 6. 战场统治权指数 (BDI: -100 ~ +100)
  confidence_score: number;                      // 7. 量化计算置信度 (0 ~ 100)
  goal_phase_alert: GoalPhaseAlert;              // 8. 破门相变预警等级
  positive_ev_signals: PositiveEVSignal[];       // 9. 发现的 +EV 投资机会列表
  risk_flags: QuantAlert[];                      // 10. 触发的量化风控警报代码
  data_deficits: DataDeficitPayload[];           // 11. 收集的数据缺陷明细
}
```

### 2. 37 项量化要素明细对照表

| 序号 | 要素标识 (Feature ID) | 字段路径 | 数据类型 | 取值范围 / 枚举 | 权威业务含义与计算公式 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `F01_BDI` | `battlefield_dominance_index` | `number` | `[-100, +100]` | **战场统治权指数**：融合压迫动量(40%)、xT真实威胁(30%)与攻防折损(30%)。正数为主队占优，负数为客队占优。 |
| 2 | `F02_CONF` | `confidence_score` | `number` | `[0, 100]` | **综合量化置信度**：基础分 100，扣减数据缺口、样本稀疏度与动量震荡惩罚。 |
| 3 | `F03_PHASE` | `goal_phase_alert` | `GoalPhaseAlert` | `NONE` / `SIEGE_PRESSURE_HIGH` / `COUNTER_THREAT_HIGH` / `DEADLOCK_STALEMATE` / `DESPERATION_SURGE` | **破门相变预警**：基于动量爆发斜率与持续围攻状态判定的进球临界状态。 |
| 4 | `F04_L0_STATUS` | `context.circuit_breaker.is_triggered` | `boolean` | `true / false` | **L0 致命熔断状态**：比分冲突、非法时钟或盘口缺失时触发。 |
| 5 | `F05_H2H_DECAY` | `context.h2h_weights[i].decay_weight` | `number` | `[0, 1]` | **历史交锋时间衰减权重**：基于 730 天半衰期指数衰减 $w = e^{-\lambda \Delta t}$。 |
| 6 | `F06_HOME_LIS` | `context.lineup_impact.home_lis` | `number` | `[0, 1]` | **主队阵容战力折损指数 (LIS)**：基于缺席主力身价与出场时间折算。 |
| 7 | `F07_AWAY_LIS` | `context.lineup_impact.away_lis` | `number` | `[0, 1]` | **客队阵容战力折损指数 (LIS)**。 |
| 8 | `F08_HOME_MUI` | `context.motivation_urgency.home_mui` | `number` | `[0.7, 1.3]` | **主队战意紧迫度指数 (MUI)**：基于积分榜保级/争冠/死水区及杯赛淘汰轮次。 |
| 9 | `F09_AWAY_MUI` | `context.motivation_urgency.away_mui` | `number` | `[0.7, 1.3]` | **客队战意紧迫度指数 (MUI)**。 |
| 10 | `F10_GOAL_TIME_VALID` | `context.goal_timing_validity.is_valid_sample` | `boolean` | `true / false` | **进球时段样本有效性**：样本量 $\ge 6$ 且覆盖率合格。 |
| 11 | `F11_MOM_SLOPE_5M` | `momentum.slope_5m` | `number` | `[-100, +100]` | **5分钟动量最小二乘斜率 (OLS Slope)**：表征最近 5 分钟攻防突变加速度。 |
| 12 | `F12_MOM_SLOPE_10M` | `momentum.slope_10m` | `number` | `[-100, +100]` | **10分钟动量最小二乘斜率**。 |
| 13 | `F13_MOM_SLOPE_15M` | `momentum.slope_15m` | `number` | `[-100, +100]` | **15分钟动量最小二乘斜率**。 |
| 14 | `F14_AUC_5M_NET` | `momentum.integral_5m.net` | `number` | `[-500, +500]` | **5分钟净动量积分 (AUC)**：采用梯形数值积分法计算主客净进攻能量。 |
| 15 | `F15_AUC_15M_NET` | `momentum.integral_15m.net` | `number` | `[-1500, +1500]` | **15分钟净动量积分 (AUC)**。 |
| 16 | `F16_AUC_FULL_NET` | `momentum.integral_full_match.net` | `number` | `[-9000, +9000]` | **全场累计净动量积分 (AUC)**。 |
| 17 | `F17_MOM_DOMINANCE` | `momentum.dominance_side` | `string` | `'home' \| 'away' \| 'neutral'` | **动量主导方**。 |
| 18 | `F18_SUSTAINED_SIEGE` | `momentum.is_sustained_siege` | `boolean` | `true / false` | **持续围攻状态**：15 分钟内持续处于强攻压迫且斜率稳定。 |
| 19 | `F19_COUNTER_SURGE` | `momentum.is_counter_attack_surge` | `boolean` | `true / false` | **反击爆发状态**：弱势方在短时间内动量出现逆转突变。 |
| 20 | `F20_XT_HOME` | `physical_stats.xt_proxy.home_xt` | `number` | `[0, 10]` | **主队真实威胁代理值 (xT Proxy)**：综合射正、危攻与角球加权折算。 |
| 21 | `F21_XT_AWAY` | `physical_stats.xt_proxy.away_xt` | `number` | `[0, 10]` | **客队真实威胁代理值 (xT Proxy)**。 |
| 22 | `F22_CONV_HOME` | `physical_stats.conversion_efficiency.home_conversion` | `number` | `[0, 1]` | **主队射门转化率**：进球数 / 总射门数。 |
| 23 | `F23_CONV_AWAY` | `physical_stats.conversion_efficiency.away_conversion` | `number` | `[0, 1]` | **客队射门转化率**。 |
| 24 | `F24_PRESSURE_INDEX` | `physical_stats.pressure_index` | `number` | `[-1, +1]` | **即时压迫净差指数**：$(\text{危攻}_H - \text{危攻}_A) / (\text{危攻}_H + \text{危攻}_A)$。 |
| 25 | `F25_BARREN_DOM` | `physical_stats.tactical_anomaly.home_barren_dominance` | `boolean` | `true / false` | **无效控球/干打雷不下雨**：控球率高但射正与 xT 极低。 |
| 26 | `F26_RED_PENALTY` | `physical_stats.red_card_penalty` | `object` | `{...}` | **红牌战力衰减系数**：进攻衰减 0.75，防守漏洞扩大 1.30。 |
| 27 | `F27_TIME_REMAINING` | `poisson.remaining_minutes` | `number` | `[0, 90]` | **剩余法定比赛分钟**：$90 - \text{minute}$。 |
| 28 | `F28_LAMBDA_HOME_REST` | `poisson.lambda_home_rest` | `number` | `[0, 8]` | **主队滚球 0:0 剩余进球期望 ($\lambda_{H,\text{rest}}$)**。 |
| 29 | `F29_LAMBDA_AWAY_REST` | `poisson.lambda_away_rest` | `number` | `[0, 8]` | **客队滚球 0:0 剩余进球期望 ($\lambda_{A,\text{rest}}$)**。 |
| 30 | `F30_EXP_GOALS_REST` | `poisson.expected_goals_rest` | `number` | `[0, 16]` | **剩余时段总进球期望**：$\lambda_{H,\text{rest}} + \lambda_{A,\text{rest}}$。 |
| 31 | `F31_REST_WIN_PROB` | `poisson.rest_score_matrix.prob_home_win_rest` | `number` | `[0, 1]` | **滚球 0:0 后续时段主队净胜概率**。 |
| 32 | `F32_REST_DRAW_PROB` | `poisson.rest_score_matrix.prob_draw_rest` | `number` | `[0, 1]` | **滚球 0:0 后续时段双方打平概率**。 |
| 33 | `F33_REST_AWAY_PROB` | `poisson.rest_score_matrix.prob_away_win_rest` | `number` | `[0, 1]` | **滚球 0:0 后续时段客队净胜概率**。 |
| 34 | `F34_DEVIG_H2H` | `devig.h2h_devig.fair_probabilities` | `number[]` | `[0, 1]` | **独赢市场 Shin 去抽水公允概率** (主/平/客之和恒等于 1.0)。 |
| 35 | `F35_SPREAD_MAIN_EV` | `devig.spread_main_ev` | `SpreadEVAssessment` | `{...}` | **让球主盘 EV 评估** (支持四分之一盘复合期望与半赢半输结算)。 |
| 36 | `F36_TOTAL_MAIN_EV` | `devig.total_main_ev` | `TotalEVAssessment` | `{...}` | **大小球主盘 EV 评估**。 |
| 37 | `F37_BOOKMAKER_POSTURE` | `devig.bookmaker_posture` | `BookmakerPosture` | `NEUTRAL_BALANCED` / `TRAP_HIGH_ODDS` / `DEFENSIVE_SHORTENING` / `PANIC_DRIFT` | **庄家操盘意图识别**：诱高、防范降赔或慌乱漂移。 |
