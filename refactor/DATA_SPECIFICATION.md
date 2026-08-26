# 足球量化系统：重构目录数据规范与字段权威说明 (Refactor Data Specification)

> **版本**：v1.0 (重构定稿版)  
> **更新时间**：2026-08-23  
> **核心原则**：纯净无冗余、单一事实来源 (SSOT)、零派生噪音字段。

---

## 一、当前已落地目录与职责说明

当前重构已完成目录及职责如下（后续层级在实际开发落地时再行增补）：

| 目录路径 | 作用与职责说明 |
| :--- | :--- |
| `refactor/00_common/` | **【00 全局基石】** 全局跨模块枚举 (`enums.ts`)、统一领域异常与弹窗通知总线 (`errors.ts`)。 |
| `refactor/01_data_ingestion/ybty/` | **【01 接入层】** YBTY 数据强类型契约 (`types.ts`)、专属枚举分类管理 (`enums.ts`)、滚球提取器 (`ybtyLiveExtractor.ts`) 与赛前提取器 (`ybtyPrematchExtractor.ts`)。 |
| `refactor/01_data_ingestion/leisu/` | **【01 接入层】** 雷速数据强类型契约 (`types.ts`)、专属枚举分类管理 (`enums.ts`) 与接口数据提取器 (`leisuInterfaceExtractor.ts`)。 |
| `refactor/samples/01_data_ingestion/` | **【样例数据区】** 存放清洗提取后生成的标准 JSON 样例文件与中英文档索引 ([`README.md`](./samples/01_data_ingestion/README.md))。 |
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
  "captured_at": "2026-08-23T21:55:11.819Z",
  "matches": []
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `schema_version` | `number` | `2` | **协议大版本号**。作为入口强类型守卫，若插件重大改版导致版本不匹配则直接拦截，防止崩溃。 |
| `export_version` | `string` | `"2.8.0"` | **导出插件版本号**。用于排查浏览器插件版本与 DOM 解析兼容性。 |
| `captured_at` | `string` | `"2026-08-23T21:55:11.819Z"` | **全量抓取时间戳 (UTC ISO 8601)**。全文件仅存一份，用于时效性判定与赛事匹配时间窗口对齐。 |
| `matches` | `Array` | `[...]` | **滚球赛事明细列表**。包含本批次抓取到的全部滚球赛事。 |

---

### 2. 赛事基础信息字段说明 (Match Level)

```json
{
  "league": "巴西甲级联赛",
  "home": "沙佩科人SC",
  "away": "圣保罗SP",
  "home_score": 0,
  "away_score": 0,
  "clock": "23:23",
  "clock_status": "23:23",
  "markets": {}
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `league` | `string` | `"巴西甲级联赛"` | **YBTY 原始联赛名**。赛事层级识别与别名映射依据。 |
| `home` | `string` | `"沙佩科人SC"` | **YBTY 原始主队名**。系统绝对事实基准主队名（推荐与台账均以此为准）。 |
| `away` | `string` | `"圣保罗SP"` | **YBTY 原始客队名**。系统绝对事实基准客队名（推荐与台账均以此为准）。 |
| `home_score` | `number \| null` | `0` | **主队即时进球数**。数字类型，后续需与雷速比分画布交叉核验。 |
| `away_score` | `number \| null` | `0` | **客队即时进球数**。数字类型，后续需与雷速比分画布交叉核验。 |
| `clock` | `string \| null` | `"23:23"` / `null` | **正在踢球进行中的即时分钟**。⚠️ 仅在比赛踢球时有值；中场休息或暂停时恒为 `null`。 |
| `clock_status` | `string` | `"23:23"` / `"中场休息"` | **全周期比赛状态文本**。比赛踢球中与 `clock` 一致；中歇期为 `"中场休息"`。 |
| `markets` | `object` | `{...}` | **即时盘口数据集合**。包含全场独赢、全场让球、全场大小球及半场盘口。 |

---

### 3. 盘口数据字段说明 (Markets Level)

#### (1) 全场独赢 (`markets.full_h2h`) 与 半场独赢 (`markets.half_h2h`)
| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `home_odds` | `number` | `3.90` | **主胜欧赔 (含本金)**。数字类型，用于去抽水计算公允胜率。 |
| `draw_odds` | `number` | `2.99` | **平局欧赔 (含本金)**。数字类型。 |
| `away_odds` | `number` | `2.16` | **客胜欧赔 (含本金)**。数字类型。 |

#### (2) 全场让球 (`markets.full_spread_main`, `markets.full_spread_subs`) 与 半场让球 (`markets.half_spread_main`)
> ⚠️ **核心口径**：滚球让球盘口表示**自推荐时刻起双方比分视为 0:0，仅结算后续剩余时段的新增进球净胜**。

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `line_index` | `number` | `0` (主盘) / `1` (副盘) | **盘口深度索引**。`0` 表示核心主盘口，`1`、`2` 表示深度副盘。 |
| `home_selection` | `string` | `"+0.5"` / `"-0/0.5"` | **主队让球/受让盘口线**。字符串标准格式，支持四分之一盘。 |
| `home_odds` | `number` | `1.81` | **主队让球水位赔率**。数字类型。 |
| `away_selection` | `string` | `"-0.5"` / `"+0/0.5"` | **客队让球/受让盘口线**。字符串标准格式。 |
| `away_odds` | `number` | `2.09` | **客队让球水位赔率**。数字类型。 |

#### (3) 全场大小球 (`markets.full_total_main`, `markets.full_total_subs`) 与 半场大小球 (`markets.half_total_main`)
| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `line_index` | `number` | `0` (主盘) / `1` (副盘) | **盘口深度索引**。`0` 表示核心主盘口，`1`、`2` 表示高低副盘。 |
| `line` | `string` | `"1.5/2"` / `"2"` / `"0.5"` | **大小球分界线**。从原始 options 中直接提取，支持四分之一盘口。 |
| `over_odds` | `number` | `1.82` | **大球 (Over) 水位赔率**。数字类型。 |
| `under_odds` | `number` | `2.06` | **小球 (Under) 水位赔率**。数字类型。 |

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
  "minute": 63,
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
| `minute` | `number \| null` | `63` | **最新进行中分钟数**（纯数字，去除了冗余的 `display_time`）。 |
| `score` | `object \| null` | `{ "home": 0, "away": 1 }` | **即时全场比分**。 |
| `half_score` | `object \| null` | `{ "home": 0, "away": 0 }` | **半场比分**。 |
| `score_verified` | `boolean` | `true` | **比分核验标记**（必须经过可靠接口/画布交叉校验，未核验禁止给 A 级推荐）。 |
| `venue` | `object \| null` | `{...}` | **比赛场地信息**（球场名 `name`、城市 `city`、国家 `country`、容量 `capacity`）。 |
| `environment` | `object` | `{...}` | **天气与物理环境**（气温、天气、风速、气压、湿度）。 |
| `stats` | `object` | `{...}` | **8大核心攻防统计**（角球、黄牌、红牌、进攻、危险进攻、控球率、射正、射偏、总射门）。 |
| `attack_momentum` | `object` | `{...}` | **实时攻防动量波形时序数据**（包含上下半场每分钟压迫指数矩阵）。 |
| `timeline_events` | `array` | `[...]` | **文字直播事件时序**（由枚举管理器统一解析 `type`、`type_name`、`side`、`minute`、`text`）。 |
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




