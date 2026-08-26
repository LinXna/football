# 01 数据接入层 - 雷速 (Leisu) 清洗样例数据与中英全量字段对照备注

本文档为 `refactor/samples/01_data_ingestion/leisu/leisu_extracted_sample.json` 的**全量中文备注与字段规范手册**。

该样例文件由 `refactor/01_data_ingestion/leisu/leisuInterfaceExtractor.ts` 从雷速原始接口抓取数据中纯净提取生成，严格服从 `refactor/01_data_ingestion/leisu/types.ts` 与 `refactor/01_data_ingestion/leisu/enums.ts` 定义。

---

## 📑 雷速核心数据板块与主要数据集全景目录 (Datasets Catalog)

为了便于全局快速查阅雷速接口当前包含的全部维度数据，系统将雷速数据划分为 **10 大核心主要数据集**：

| 数据集编号 | 主要数据集名称 (Dataset Name) | 核心包含内容与业务指标 | 对应文档章节 | 典型应用层级 (Layer) |
| :--- | :--- | :--- | :--- | :--- |
| **DS-01** | **实时赛事元数据与比分流**<br>`(Realtime Match & Score Stream)` | 比赛 ID、主客队 ID/队名、赛事 ID/赛事名、开赛时间、比赛阶段状态 (`status_id`)、进行分钟数、全场/半场比分、比分可靠性核验标记 (`score_verified`) | [第 1、2 节](#1-顶层元数据结构-root-level) | Layer 01 / 02 实体对齐与比分核验 |
| **DS-02** | **天气环境与球场物理集**<br>`(Environment & Venue Dataset)` | 比赛现场气象（天气状况、温度、湿度、风速、气压）、球场实体（球场名、城市、国家、容纳观众人数） | [第 3 节](#3-天气环境与球场场地-environment--venue) | Layer 04 AI 环境因子与主场气象加权 |
| **DS-03** | **实时技术统计集**<br>`(Live Match Stats Dataset)` | 射门总数、射正、射偏、点球、角球、进攻/危险进攻次数、控球率、红黄牌、换人、救球、越位、犯规、界外球、任意球、球门球、传球成功率 | [第 4 节](#4-实时技术统计-stats) | Layer 03 泊松衰减、压迫指数与场面评估 |
| **DS-04** | **比赛时序事件流**<br>`(Match Timeline Incidents Stream)` | 逐分钟事件流（分钟、加时分钟、事件类型代码 `type`、主客队归属、文字描述、进球球员、点球/乌龙球/助攻、换人上下场、红黄牌球员） | [第 5 节](#5-比赛时序事件-incidents) | Layer 04 比赛转折点识别与红牌/伤退量化 |
| **DS-05** | **首发阵容与球员画像集**<br>`(Lineups & Player Profiles Dataset)` | 阵型体系 (`4-4-2` 等)、主客队首发/替补名单、球员唯一ID、姓名、球衣号、场上位置 (`F/M/D/G`)、队长标识、身价市值、赛后/实时评分、本场球员事件 | [第 6 节](#6-首发阵容与球员评分-lineups) | Layer 04 阵容强弱度、伤停主力缺失分析 |
| **DS-06** | **三合一赔率与变盘矩阵**<br>`(Odds & Market Shift Matrix)` | **欧洲独赢 (1X2)**、**亚洲让球盘 (AH)**、**全场大小球 (OU)** 的**初盘与即时盘**（三方主流机构盘口水位、让球盘口线、大小球盘口线） | [第 7 节](#7-三合一赔率矩阵-odds) | Layer 03/05 去抽水公允概率、冷热与风控 |
| **DS-07** | **历史战术背景与交锋战绩集**<br>`(Tactical Context & H2H Dataset)` | ① **历史直接交锋 (`h2h_raw`)**（往绩比分、半场比分、进球、射门、角球、黄牌）<br>② **主客队近期战绩 (`recent_matches`)**（主客近 10-20 场赛果、半全场比分、射门、角球） | [第 8、9 节](#8-战术背景与近期交锋-tactical_context) | Layer 03/04 球风克制、半全场 9 大格局画像 |
| **DS-08** | **联赛积分与主客场排名集**<br>`(League Standings & Points Dataset)` | 主客队赛季联赛总排名/主场排名/客场排名、比赛场次、胜平负、进失球、净胜球、积分、胜率 | [第 11 节](#11-联赛积分与排名-league_standings) | Layer 04 战意评估（争冠/保级/无欲无求） |
| **DS-09** | **进球时间分布与首球偏好集**<br>`(Goal Time Distribution Dataset)` | 1-15'、16-30'、31-45'、46-60'、61-75'、76-90' 六大 15 分钟时段进球数与占比，首开纪录时段分布 | [第 12 节](#12-进球时间分布与首球偏好-goal_distribution) | Layer 03/04 泊松时段衰减与半场净胜预期 |
| **DS-10** | **标准化枚举字典与回退体系**<br>`(Enum Registries & Fallbacks)` | 比赛状态代码表、时序事件代码表、赛事/联赛标准库 (`resolveCompetition`)、球队标准库 (`resolveTeam`)、未知枚举自动上报拦截中心 | [第 10 节](#10-赛事-id-与球队-id--名称智能解析与双向回退机制-resolvecompetition--resolveteam) | 全系统健壮性与反未知数据异常防线 |

---

## 1. 顶层元数据结构 (Root Level)

```json
{
  "export_version": "2.8.0",
  "export_type": "leisu_interface_data",
  "captured_at": "2026-08-20T20:20:34.703Z",
  "matches": []
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `export_version` | `string` | `"2.8.0"` | **导出协议版本号**。固定为当前标准协议版本。 |
| `export_type` | `string` | `"leisu_interface_data"` | **数据导出类型标识**。表明本批次为雷速接口清洗后的标准格式。 |
| `captured_at` | `string` | `"2026-08-20T20:20:34.703Z"` | **数据捕获时间戳**（UTC ISO 8601 格式）。 |
| `matches` | `array` | `[...]` | **比赛对象数组**。包含清洗后的全量赛事数据。 |

---

## 2. 赛事顶层核心字段 (Match Level)

```json
{
  "match_id": "4562395",
  "home_team_id": 10101,
  "away_team_id": 10102,
  "home_team": "谢周三",
  "away_team": "布拉德福德",
  "competition_id": 84,
  "competition": "英甲",
  "commence_time": "2026-08-20T19:00:00.000Z",
  "status_id": 4,
  "status_text": "下半场",
  "is_live": true,
  "minute": 63,
  "score": { "home": 0, "away": 1 },
  "half_score": { "home": 0, "away": 0 },
  "score_verified": true
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `match_id` | `string` | `"4562395"` | **雷速系统比赛全局唯一 ID**。 |
| `home_team_id` | `number \| null` | `10101` | **主队唯一 ID**。实体对齐层（Layer 02）**首选强匹配依据**（有 ID 优先比对 ID，无 ID 再走队名别名相似度）。 |
| `away_team_id` | `number \| null` | `10102` | **客队唯一 ID**。实体对齐层首选强匹配依据。 |
| `home_team` | `string` | `"谢周三"` | **雷速标准主队名**。 |
| `away_team` | `string` | `"布拉德福德"` | **雷速标准客队名**。 |
| `competition_id` | `number \| null` | `84` | **赛事/联赛唯一 ID**（来源于 `static_match.competition.id`，用于同赛事比赛归类关联、联赛/杯赛属性匹配与跨场特征分析）。 |
| `competition` | `string` | `"英甲"` | **雷速标准赛事/联赛名称**。 |
| `commence_time` | `string \| null` | `"2026-08-20T19:00:00.000Z"` | **比赛开赛时间（UTC ISO 8601）**。由原始 `matchTime` 秒级时间戳转换。 |
| `status_id` | `number` | `4` | **比赛生命周期状态代码**（1:未开赛, 2:上半场, 3:中场, 4:下半场, 5:加时, 7:点球, 8:完场, 9:推迟, 10:中断, 11:腰斩, 12:取消）。 |
| `status_text` | `string` | `"下半场"` | **比赛生命周期中文文本**。 |
| `is_live` | `boolean` | `true` | **是否为滚球进行中比赛**（判定依据：`2 <= status_id <= 7`）。 |
| `minute` | `number \| null` | `63` | **当前进行中比赛分钟数**（纯数字，杜绝字符串）。 |
| `score` | `object \| null` | `{"home": 0, "away": 1}` | **全场实时比分**（包含 `home` 主队进球数与 `away` 客队进球数）。 |
| `half_score` | `object \| null` | `{"home": 0, "away": 0}` | **半场比分**。 |
| `score_verified` | `boolean` | `true` | **比分核验标记**（必须经可靠画布/接口校验，未校验比分严禁给出 A 级推荐）。 |

---

## 3. 天气环境与球场场地 (`environment` & `venue`)

```json
{
  "environment": {
    "weather": "局部有云",
    "temperature": "14°C",
    "humidity": "89%",
    "wind": "4.5m/s",
    "pressure": "757mmHg"
  },
  "venue": {
    "name": "希尔斯堡球场",
    "city": "谢菲尔德",
    "country": "England",
    "capacity": 34835
  }
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `environment.weather` | `string \| null` | `"局部有云"` | **天气状况描述**。 |
| `environment.temperature` | `string \| null` | `"14°C"` | **比赛现场温度**。 |
| `environment.humidity` | `string \| null` | `"89%"` | **空气湿度百分比**。 |
| `environment.wind` | `string \| null` | `"4.5m/s"` | **现场风速**。 |
| `environment.pressure` | `string \| null` | `"757mmHg"` | **大气压强**。 |
| `venue.name` | `string \| null` | `"希尔斯堡球场"` | **球场/体育场名称**。 |
| `venue.city` | `string \| null` | `"谢菲尔德"` | **球场所处城市**。 |
| `venue.country` | `string \| null` | `"England"` | **国家/地区**。 |
| `venue.capacity` | `number \| null` | `34835` | **球场容纳观众人数**。 |

---

## 4. 攻防统计指标 (`stats`)

提取器已对攻防技术统计进行安全校验与数值纯净化转换（`number` 类型），且根据业务规则计算 `shots = shots_on_target + shots_off_target`：

```json
{
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
  }
}
```

| 统计指标 (`Metric`) | 包含字段 | 中文含义与权威业务说明 |
| :--- | :--- | :--- |
| `corners` | `home, away` | **角球数**。主客双方累计角球数。 |
| `yellow_cards` | `home, away` | **黄牌数**。主客双方累计黄牌数。 |
| `red_cards` | `home, away` | **红牌数**。主客双方直接红牌与两黄变红人数。 |
| `attacks` | `home, away` | **进攻总次数**。 |
| `dangerous_attacks` | `home, away` | **危险进攻次数**。量化攻势压迫的核心指标。 |
| `possession` | `home, away` | **控球率百分比 (0~100)**。 |
| `shots_on_target` | `home, away` | **射正门框范围次数**。 |
| `shots_off_target` | `home, away` | **射偏/脱靶次数**。 |
| `shots` | `home, away` | **总射门次数**（严格保证 `shots = 射正 + 射偏`）。 |

---

## 5. 攻防动量波形 (`attack_momentum`)

```json
{
  "attack_momentum": {
    "available": true,
    "segment_count": 2,
    "nominal_segment_minutes": 45,
    "data": [
      [ -12, -16, 32, 58, -50, ... ],
      [ -18, -60, 0, -26, 72, ... ]
    ]
  }
}
```

| 字段名称 (`Key`) | 类型 | 中文含义与权威业务说明 |
| :--- | :--- | :--- |
| `available` | `boolean` | **动量波形是否可用**。 |
| `segment_count` | `number` | **半场分段数**（通常为 2，代表上半场与下半场）。 |
| `nominal_segment_minutes` | `number \| null` | **半场基准时长**（标准 45 分钟）。 |
| `data` | `number[][]` | **逐分钟压迫指数矩阵**。正值代表主队压迫占优，负值代表客队压迫占优，用于单批次动能斜率与单边压制判定。 |

---

## 6. 文字直播时序事件 (`timeline_events`)

文字直播数组 **100% 保真原始事件正向时序**，每项包含标准分类枚举代码与解析后的中文名称：

```json
{
  "minute": 47,
  "type": 1,
  "type_name": "进球",
  "side": "away",
  "text": "47' - 第1个进球！球进啦！鲍德温(布拉德福德 射门 (助攻: 彭宁顿))取得本场比赛领先！"
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `minute` | `number \| null` | `47` | **事件发生的比赛分钟数**（赛前准备为 `null`）。 |
| `type` | `number` | `1` | **事件类型代码**（服从 `LeisuTimelineEventType` 枚举）。 |
| `type_name` | `string` | `"进球"` | **事件中文名称**（如进球、角球、黄牌、红牌、越位、射正、射偏、换人等）。 |
| `side` | `string` | `"away"` | **触发方方位**（`"home"` 主队, `"away"` 客队, `"neutral"` 中立/系统）。 |
| `text` | `string` | `"47' - 第1个进球！..."` | **现场文字直播原始解说文本**。 |

---

## 7. 首发阵型与球员阵容明细 (`lineups`)

包含主客队阵型、主教练、首发 11 人名单、替补待命名单、伤停缺阵名单、球队总身价与平均年龄：

```json
{
  "lineups": {
    "confirmed": true,
    "home_formation": "4-2-3-1",
    "away_formation": "3-4-2-1",
    "home_manager": "佩德森",
    "away_manager": "亚历山大",
    "home_market_value": "1230万欧",
    "away_market_value": "402.5万欧",
    "home_average_age": "27.5岁",
    "away_average_age": "28.9岁",
    "home_starters": [ ... ],
    "away_starters": [ ... ],
    "home_substitutes": [ ... ],
    "away_substitutes": [ ... ],
    "home_injuries": [ ... ],
    "away_injuries": [ ... ]
  }
}
```

### 单个球员字段 (`ParsedPlayer`)

```json
{
  "player_id": 20158,
  "team_id": 10101,
  "name": "班南",
  "shirt_number": 10,
  "status": 1,
  "status_name": "首发",
  "starter": true,
  "captain": true,
  "best_player": false,
  "rating": 6.6,
  "age": 36,
  "height": 170,
  "market_value": 200000,
  "market_value_text": "20万欧",
  "position": "中场",
  "position_name": "中场",
  "position_code": "M",
  "incidents": []
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `player_id` | `number \| null` | `20158` | **球员唯一 ID**。 |
| `team_id` | `number \| null` | `10101` | **所属球队 ID**。 |
| `name` | `string` | `"班南"` | **球员中文姓名**。 |
| `shirt_number` | `number \| null` | `10` | **球衣背号**。 |
| `status` | `number` | `1` | **出场状态枚举**（1:首发, 0:替补, 2:伤停, 3:停赛, -1:未指定）。 |
| `status_name` | `string` | `"首发"` | **出场状态中文名称**。 |
| `starter` | `boolean` | `true` | **是否为首发出场球员**。 |
| `captain` | `boolean` | `true` | **是否为场上队长**。 |
| `best_player` | `boolean` | `false` | **是否被评为全场最佳/焦点球员**。 |
| `rating` | `number \| null` | `6.6` | **赛后/实时球员评分 (10分制)**。 |
| `age` | `number \| null` | `36` | **年龄 (周岁)**。 |
| `height` | `number \| null` | `170` | **身高 (cm)**。 |
| `market_value` | `number \| null` | `200000` | **纯数字身价 (欧元)**。 |
| `market_value_text` | `string \| null` | `"20万欧"` | **格式化身价文本**。 |
| `position` | `string \| null` | `"中场"` | **场上位置中文名**。 |
| `position_code` | `string \| null` | `"M"` | **位置简码**（G:守门员, D:后卫, M:中场, F:前锋, U:未知）。 |
| `incidents` | `array` | `[...]` | **该球员个人产生的事件明细**（如进球、助攻99、吃牌、扑救8、伤退9等）。 |

---

## 8. 参考赔率矩阵与历史交锋上下文 (`odds_matrix` & `tactical_context`)

### 8.1 参考赔率矩阵 (`odds_matrix`)

包含主流博彩公司在初盘 (`initial`)、赛前即盘 (`pregame`) 与滚球即盘 (`live`) 三个生命周期阶段的 4 大核心玩法盘口数据（让球、独赢、大小球、角球）。

```json
{
  "odds_matrix": {
    "company_name": "3*",
    "initial": {
      "asian_handicap": { "home_odds": 1.0, "line": 0.25, "away_odds": 0.85 },
      "match_winner": { "home_odds": 2.2, "draw_odds": 3.3, "away_odds": 3.0 },
      "total_goals": { "over_odds": 1.0, "line": 2.5, "under_odds": 0.85 },
      "corners": { "over_odds": 0.72, "line": 9.5, "under_odds": 1.0 }
    },
    "pregame": {
      "asian_handicap": { "home_odds": 0.7, "line": -0.25, "away_odds": 1.1 },
      "match_winner": { "home_odds": 2.62, "draw_odds": 3.4, "away_odds": 2.45 },
      "total_goals": { "over_odds": 1.1, "line": 2.75, "under_odds": 0.7 },
      "corners": { "over_odds": 0.72, "line": 9.5, "under_odds": 1.0 }
    },
    "live": {
      "asian_handicap": { "home_odds": 1.2, "line": 0.25, "away_odds": 0.7 },
      "match_winner": { "home_odds": 9.5, "draw_odds": 3.75, "away_odds": 1.44 },
      "total_goals": { "over_odds": 0.92, "line": 2.0, "under_odds": 0.92 },
      "corners": { "over_odds": 0.61, "line": 16.5, "under_odds": 1.2 }
    }
  }
}
```

#### 赔率矩阵层级与字段明细

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `company_name` | `string \| null` | `"3*"` | **主流参考博彩公司代号/名称**（如 Bet365、皇冠等）。 |
| `initial` | `object` | `{...}` | **初盘阶段赔率组**（开盘初始基准，反映未计入突发变量时的原始市场预期）。 |
| `pregame` | `object` | `{...}` | **赛前即盘阶段赔率组**（开赛前临场收盘赔率，反映计入首发阵容与伤停后的市场共识）。 |
| `live` | `object` | `{...}` | **滚球即盘阶段赔率组**（当前抓取时刻的即时滚球参考指数）。 |

#### 每个阶段包含的 4 大玩法盘口 (`ParsedOddsPhaseGroup`)

| 玩法分类 (`Market`) | 包含子字段 | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- | :--- |
| **全场让球**<br>`asian_handicap` | `home_odds`<br>`line`<br>`away_odds` | `number \| null`<br>`number \| null`<br>`number \| null` | `0.70`<br>`0.25`<br>`1.10` | **主队水位**（净赔率）<br>**让球基准线**（**正数为主让**，如 `0.25` 代表主让平半 `-0/0.5`；**负数为主受让**，如 `-0.25` 代表主受让平半 `+0/0.5`；`0` 为平手盘）<br>**客队水位**（净赔率） |
| **全场独赢 (1X2)**<br>`match_winner` | `home_odds`<br>`draw_odds`<br>`away_odds` | `number \| null`<br>`number \| null`<br>`number \| null` | `2.62`<br>`3.40`<br>`2.45` | **主胜欧赔**<br>**平局欧赔**<br>**客胜欧赔**（用于计算去抽水公允胜平负基准概率） |
| **全场大小球**<br>`total_goals` | `over_odds`<br>`line`<br>`under_odds` | `number \| null`<br>`number \| null`<br>`number \| null` | `1.10`<br>`2.75`<br>`0.70` | **大球水位**<br>**总进球基准线**（如 2.5 为两球半，2.75 为两球半/三球）<br>**小球水位** |
| **角球大小球**<br>`corners` | `over_odds`<br>`line`<br>`under_odds` | `number \| null`<br>`number \| null`<br>`number \| null` | `0.72`<br>`9.5`<br>`1.00` | **大角水位**<br>**全场角球总数基准线**（如 9.5 个角球）<br>**小角水位** |

> 📌 **让球盘口符号权威契约（全系统单一事实来源 SSOT）**：
> - **雷速数值浮点数定义**：
>   - `line > 0`（如 `0.25`, `0.5`, `1.0`）：**主让**（主队让球，对应 YBTY `"-0/0.5"`, `"-0.5"`, `"-1.0"`）
>   - `line < 0`（如 `-0.25`, `-0.5`, `-1.0`）：**主受让**（客队让球，对应 YBTY `"+0/0.5"`, `"+0.5"`, `"+1.0"`）
>   - `line = 0`：**平手盘**（对应 YBTY `"0"` / `"0.0"`）
> - **滚球让球盘计算与结算红线**：
>   - 滚球让球盘仅计算**推荐时刻之后剩余时段的新增净胜球**，推荐时刻双方比分强制按 **0:0** 重置！严禁使用全场完场比分直接结算！

> ⚠️ **权威红线提醒**：雷速参考赔率矩阵主要用于泊松建模先验分布、赛前共识预期与时间衰减基准锚定，**严禁写成或替代 YBTY 真实交易投注与结算盘口**！

---

### 8.2 基本面与历史交锋战术上下文 (`tactical_context`)

包含两队历史直接交锋记录 (`h2h_raw`) 以及主客队各自近期的比赛战绩明细 (`home_recent_matches`, `away_recent_matches`)，用于战意分析、状态评估与净胜球趋势研判。

```json
{
  "tactical_context": {
    "head_to_head_count": 6,
    "home_recent_matches_count": 40,
    "away_recent_matches_count": 40,
    "h2h_raw": [ ... ],
    "home_recent_matches": [ ... ],
    "away_recent_matches": [ ... ]
  }
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `head_to_head_count` | `number` | `6` | **双方历史直接交锋总场次数**。 |
| `home_recent_matches_count` | `number` | `40` | **主队近期比赛记录总场次数**。 |
| `away_recent_matches_count` | `number` | `40` | **客队近期比赛记录总场次数**。 |
| `h2h_raw` | `array` | `[...]` | **历史直接交锋原始对阵列表**（含分段比分、指数与攻防统计）。 |
| `home_recent_matches` | `array` | `[...]` | **主队近期全量历史战绩列表**（包含半全场比分、胜负、让球与大小球走势）。 |
| `away_recent_matches` | `array` | `[...]` | **客队近期全量历史战绩列表**。 |

---

### 8.3 近期战绩单场数据明细 (`home_recent_matches[i]` / `away_recent_matches[i]`)

```json
{
  "match_id": 4562385,
  "league_id": 84,
  "league_name": "英甲",
  "match_time": 1786802400,
  "match_date": "2026-08-15T14:00:00.000Z",
  "home_team_id": 12503,
  "home_team_name": "莱顿东方",
  "away_team_id": 10101,
  "away_team_name": "谢周三",
  "halftime_score": { "home": 1, "away": 1 },
  "fulltime_score": { "home": 1, "away": 2 },
  "result": "赢",
  "goals": 3,
  "handicap_trend": { "result": "赢", "class": "win" },
  "goals_trend": { "result": "大", "class": "big" }
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `match_id` | `number \| null` | `4562385` | **近期历史比赛唯一 ID**。 |
| `league_id` | `number \| null` | `84` | **所属赛事/联赛 ID**。 |
| `league_name` | `string \| null` | `"英甲"` | **赛事/联赛名称**（用于区分杯赛、联赛与友谊赛，辅助杯赛轮换风控拦截）。 |
| `match_time` | `number \| null` | `1786802400` | **比赛开赛秒级时间戳**。 |
| `match_date` | `string \| null` | `"2026-08-15T14:00:00.000Z"` | **比赛开赛 UTC ISO 8601 日期时间**。 |
| `home_team_id` | `number \| null` | `12503` | **该场比赛主队 ID**。 |
| `home_team_name` | `string \| null` | `"莱顿东方"` | **该场比赛主队名称**。 |
| `away_team_id` | `number \| null` | `10101` | **该场比赛客队 ID**。 |
| `away_team_name` | `string \| null` | `"谢周三"` | **该场比赛客队名称**。 |
| `halftime_score` | `object \| null` | `{"home": 1, "away": 1}` | **半场比分**（包含主队与客队半场进球）。 |
| `fulltime_score` | `object \| null` | `{"home": 1, "away": 2}` | **全场完场比分**（包含主队与客队全场进球）。 |
| `result` | `string \| null` | `"赢"` | **当前球队该场胜平负赛果**（`"赢"` / `"输"` / `"和"`）。 |
| `goals` | `number \| null` | `3` | **全场双方累计总进球数**。 |
| `handicap_trend.result` | `string \| null` | `"赢"` | **让球盘路赢输走势结果**（`"赢"` / `"输"` / `"和"` / `"-"`）。 |
| `handicap_trend.class` | `string \| null` | `"win"` | **让球盘路样式标识**（`"win"` / `"loss"` / `"draw"` / `"-"`）。 |
| `goals_trend.result` | `string \| null` | `"大"` | **大小球盘路走势结果**（`"大"` / `"小"` / `"-"`）。 |
| `goals_trend.class` | `string \| null` | `"big"` | **大小球盘路样式标识**（`"big"` / `"small"` / `"-"`）。 |

---

### 8.4 历史直接交锋原始对阵明细 (`h2h_raw[i]`)

```json
{
  "match_id": 3775098,
  "season_id": null,
  "competition_id": 100,
  "status_id": 8,
  "match_time": 1661884200,
  "neutral": null,
  "home_team_id": 10102,
  "away_team_id": 10101,
  "home_scores": [ 3, 1, 0, 0, 3, 0, 0 ],
  "away_scores": [ 1, 1, 0, 0, 10, 0, 0 ],
  "opening_odds": [ "0.82,-0.25,1.02,0", "2.88,3.3,2.25,0", "0.97,2.5,0.88,0", "" ],
  "current_odds": [ "0.95,-0.25,0.9,0", "3.0,3.4,2.15,0", "0.9,2.5,0.95,0", "" ],
  "home_stats": {
    "attack": 95,
    "dangerous_attack": 40,
    "ball_possession": 42,
    "shots": 17,
    "was_shots": 8,
    "corner_kicks": 3,
    "fouls": 0,
    "yellow_cards": 0,
    "red_cards": 0,
    "free_kicks": 0
  },
  "away_stats": {
    "attack": 115,
    "dangerous_attack": 44,
    "ball_possession": 58,
    "shots": 8,
    "was_shots": 17,
    "corner_kicks": 9,
    "fouls": 0,
    "yellow_cards": 0,
    "red_cards": 0,
    "free_kicks": 0
  }
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `match_id` | `number \| null` | `3775098` | **交锋历史比赛 ID**。 |
| `competition_id` | `number \| null` | `100` | **交锋所属赛事 ID**（如 100 为英锦赛，84 为英甲）。 |
| `status_id` | `number \| null` | `8` | **交锋比赛状态代码**（8 为完场）。 |
| `match_time` | `number \| null` | `1661884200` | **交锋比赛开赛秒级时间戳**。 |
| `home_team_id` | `number \| null` | `10102` | **主队 ID**。 |
| `away_team_id` | `number \| null` | `10101` | **客队 ID**。 |
| `home_scores` | `number[] \| null` | `[3, 1, 0, 0, 3, 0, 0]` | **主队分段比分与事件数组**：`[0]完场进球(3), [1]半场进球(1), [2]红牌(0), [3]黄牌(0), [4]角球(3), [5]加时, [6]点球`。 |
| `away_scores` | `number[] \| null` | `[1, 1, 0, 0, 10, 0, 0]` | **客队分段比分与事件数组**：`[0]完场进球(1), [1]半场进球(1), [2]红牌(0), [3]黄牌(0), [4]角球(10)`。 |
| `opening_odds` | `string[] \| null` | `["0.82,-0.25,1.02,0", ...]` | **初盘指数数组**（依次为：让球、独赢、大小球、角球盘口字符串简码）。 |
| `current_odds` | `string[] \| null` | `["0.95,-0.25,0.9,0", ...]` | **终盘指数数组**。 |
| `home_stats` | `object` | `{...}` | **交锋历史主队全场技术统计对象**（攻防与射门指标详细拆解见下表）。 |
| `away_stats` | `object` | `{...}` | **交锋历史客队全场技术统计对象**。 |

#### 历史交锋单队攻防技术统计明细 (`home_stats` / `away_stats`)

| 统计指标 (`Key`) | 类型 | 示例值 | 业务含义与量化解读 |
| :--- | :--- | :--- | :--- |
| `attack` | `number \| null` | `95` | **总进攻次数**。 |
| `dangerous_attack` | `number \| null` | `40` | **危险进攻次数**（用于计算危攻转化率与压迫强度）。 |
| `ball_possession` | `number \| null` | `42` | **全场控球率 (%)**。 |
| `shots` | `number \| null` | `17` | **本队总射门次数**（包含射正、射偏与被封堵射门）。 |
| `was_shots` | `number \| null` | `8` | **本队被射门次数 (即对方的总射门次数)**。在数据源中与对手的 `shots` 形成互补对偶（例如主队 `shots: 17, was_shots: 8`，则客队必为 `shots: 8, was_shots: 17`）。 |
| `corner_kicks` | `number \| null` | `3` | **角球次数**。 |
| `fouls` | `number \| null` | `0` | **犯规次数**。 |
| `yellow_cards` | `number \| null` | `0` | **黄牌张数**。 |
| `red_cards` | `number \| null` | `0` | **红牌张数**。 |
| `free_kicks` | `number \| null` | `0` | **任意球次数**。 |

> 📌 **关于历史交锋统计中“射正次数”与数据源边界说明**：
> 1. **历史直接交锋 (`h2h_raw`) 数据源结构**：雷速原始历史交锋只提供全场汇总的 `shots`（总射门）与 `was_shots`（被射门），**不包含**历史赛事的逐分钟射正/射偏拆解；
> 2. **本场赛事 (`stats`)**：当前正在进行的赛事（或本场详页）则完整包含 `shots_on_target`（射正）与 `shots_off_target`（射偏）。

> ⚠️ **关于历史比分数组中出现 `-1` 值的行业通用含义与清洗规则**：
> - 在雷速及主流足球接口的 `home_scores` / `away_scores` 数组中，`-1` 代表**该项技术数据缺失 / 当年未统计该项数据**（例如 2000 年早期老比赛 `match_time=948038340`，角球位置索引 `[4]` 记为 `-1`，即未记录角球数据，而非负数角球）。
> - **清洗与量化规则**：在统计模型或半全场计算时，必须将 `< 0`（即 `-1`）作为 `null` / 未知值处理，严禁将其作为真实进球或角球数参与算术加减！

---

## 9. 历史半全场走势与战术特征量化规划登记 (`halftime_fulltime_analytics`)

在数据源中，历史半全场比分存在两种数据结构形态：
1. **近期赛果 (`home_recent_matches` / `away_recent_matches`)**：显式提供 `halftime_score: {home, away}` 与 `fulltime_score: {home, away}`；
2. **历史直接交锋 (`h2h_raw`)**：采用数组编码形式存储于 `home_scores` 与 `away_scores` 中：
   - 全场完场比分 $\text{FT} = (\text{home\_scores}[0], \text{away\_scores}[0])$
   - 半场比分 $\text{HT} = (\text{home\_scores}[1], \text{away\_scores}[1])$
   - *注：若数组对应索引值为 `-1` 则代表历史半场数据缺失，做 `null` 缺省丢弃。*

后续在量化推演层（Layer 03）及 AI 评估层（Layer 04）将统一聚合上述两类数据，建立专项半全场策略模型：

1. **半全场 9 大胜平负格局统计与球风画像**：
   - 胜胜 (W-W)、平胜 (D-W)、负胜 (L-W - 逆转韧性型球风)；
   - 胜平 (W-D - 领先后守不住型)、平平 (D-D - 胶着防守型)、负平 (L-D)；
   - 胜负 (W-L - 被逆转崩盘型)、平负 (D-L)、负负 (L-L)。
2. **下半场进球爆发力与攻防衰减率 ($\Delta G_{\text{2nd}} = \text{FT} - \text{HT}$)**：
   - 上半场进球与下半场进球分布比重，识别“慢热型”与“抢开局型”球队；
   - 结合滚球下半场让球与大小球，为滚球 0:0 重置净胜推演提供先验衰减权重。

---

## 10. 赛事 ID 与球队 ID / 名称智能解析与双向回退机制 (`resolveCompetition` & `resolveTeam`)

为了确保数据摄入层与后续实体对齐层（Layer 02）的数据高健壮性，系统在 `LeisuEnumManager` 中统一实现了一套标准化的**赛事与球队智能解析字典与三级回退引擎**：

### 10.1 解析与回退生命周期规则

无论是赛事（`competition_id` / `competition`、`league_id` / `league_name`）还是球队（`home_team_id` / `home_team`、`away_team_id` / `away_team`），均严格服从以下 3 级确定性规则：

1. **情况 A（字典已收录 - 强信任）**：
   - 当 `id` 命中系统内置枚举字典（如 `LeisuKnownCompetitionId` 或 `LeisuKnownTeamId`）时，直接输出标准官方中文译名（如 `84` $\rightarrow$ `"英甲"`，`10101` $\rightarrow$ `"谢周三"`），标记 `is_known: true`；
2. **情况 B（字典未收录，但数据源自带原始名称 - 智能回退与自动扩库）**：
   - 使用数据源自带的原始名称（如 `99999` + `"冰岛超"` $\rightarrow$ `"冰岛超"`）；
   - **自动向全局枚举中心上报**（`commonEnumRegistry`），记录待扩充的 ID 与名称映射样本，供后续批量维护入库，标记 `is_known: false`；
3. **情况 C（字典未收录且无名称 - 占位回退）**：
   - 若只有 ID 无名称，回退为 `"赛事(${id})"` 或 `"球队(${id})"`, 标记 `is_known: false`；
   - 若 ID 与名称均为空，安全回退为 `"未指定赛事"` 或 `"未指定球队"`。

### 10.2 全链路应用覆盖点

- **本场赛事元数据**：
  - `matches[i].competition_id` $\leftrightarrow$ `matches[i].competition`
  - `matches[i].home_team_id` $\leftrightarrow$ `matches[i].home_team`
  - `matches[i].away_team_id` $\leftrightarrow$ `matches[i].away_team`
- **近期历史战绩 (`recent_matches`)**：
  - `home_recent_matches[i].league_id` $\leftrightarrow$ `home_recent_matches[i].league_name`
  - `home_recent_matches[i].home_team_id` $\leftrightarrow$ `home_recent_matches[i].home_team_name`
  - `home_recent_matches[i].away_team_id` $\leftrightarrow$ `home_recent_matches[i].away_team_name`
  - `away_recent_matches[i]` 同上对齐
- **历史直接交锋 (`h2h_raw`)**：
  - `h2h_raw[i].competition_id`, `h2h_raw[i].home_team_id`, `h2h_raw[i].away_team_id` 均经过枚举解析标准化。

---

## 11. 联赛积分与排名 (`league_standings`)

雷速接口提供的赛季联赛积分榜与排名数据，按**总战绩 (overall)**、**主场战绩 (home)**、**客场战绩 (away)** 细分，为 Layer 04 的战意评估与主客场偏好提供权威量化支撑。

```json
{
  "has_data": true,
  "home_team": {
    "team_id": 10101,
    "team_name": "谢周三",
    "competition_id": 84,
    "competition_name": "英甲",
    "season": "2026/2027",
    "overall": {
      "title": "总",
      "position": 6,
      "matches_played": 1,
      "won": 1,
      "draw": 0,
      "loss": 0,
      "goals_scored": 2,
      "goals_conceded": 1,
      "goal_difference": 1,
      "points": 3,
      "win_rate": "100%"
    },
    "home": {
      "title": "主",
      "position": 5,
      "matches_played": 1,
      "won": 1,
      "draw": 0,
      "loss": 0,
      "goals_scored": 2,
      "goals_conceded": 1,
      "goal_difference": 1,
      "points": 3,
      "win_rate": "100%"
    },
    "away": null
  },
  "away_team": {
    "team_id": 10102,
    "team_name": "布拉德福德",
    "competition_id": 84,
    "competition_name": "英甲",
    "season": "2026/2027",
    "overall": {
      "title": "总",
      "position": 3,
      "matches_played": 1,
      "won": 1,
      "draw": 0,
      "loss": 0,
      "goals_scored": 2,
      "goals_conceded": 0,
      "goal_difference": 2,
      "points": 3,
      "win_rate": "100%"
    },
    "home": null,
    "away": {
      "title": "客",
      "position": 2,
      "matches_played": 1,
      "won": 1,
      "draw": 0,
      "loss": 0,
      "goals_scored": 2,
      "goals_conceded": 0,
      "goal_difference": 2,
      "points": 3,
      "win_rate": "100%"
    }
  }
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `has_data` | `boolean` | `true` | 是否存在积分榜数据（杯赛/友谊赛通常为 `false`）。 |
| `home_team.overall.position` | `number \| null` | `6` | 主队在联赛积分榜上的**当前总排名**。 |
| `home_team.overall.points` | `number` | `3` | 主队当前联赛**总积分**。 |
| `home_team.overall.matches_played` | `number` | `1` | 主队已赛场次。 |
| `home_team.overall.won / draw / loss` | `number` | `1 / 0 / 0` | 胜 / 平 / 负场次。 |
| `home_team.overall.goals_scored` | `number` | `2` | 进球数。 |
| `home_team.overall.goals_conceded` | `number` | `1` | 失球数。 |
| `home_team.overall.goal_difference` | `number` | `1` | 净胜球数。 |
| `home_team.overall.win_rate` | `string \| null` | `"100%"` | 胜率百分比字符串。 |
| `home_team.home` | `ParsedStandingRecord \| null` | `{...}` | 主队**主场独立排名与积分战绩**。 |
| `home_team.away` | `ParsedStandingRecord \| null` | `null` | 主队**客场独立排名与积分战绩**。 |

---

## 12. 进球时间分布与首球偏好 (`goal_distribution`)

雷速提供的 15 分钟进球时段细分统计及首开纪录时段偏好，用于计算球队在各比赛时段的攻防爆发力与慢热/抢开局画像。

```json
{
  "has_data": true,
  "home_team": {
    "all": {
      "matches_count": 1,
      "scored_intervals": [
        { "start_minute": 1, "end_minute": 15, "goals": 0, "percentage": 0 },
        { "start_minute": 16, "end_minute": 30, "goals": 1, "percentage": 50 },
        { "start_minute": 31, "end_minute": 45, "goals": 0, "percentage": 0 },
        { "start_minute": 46, "end_minute": 60, "goals": 0, "percentage": 0 },
        { "start_minute": 61, "end_minute": 75, "goals": 1, "percentage": 50 },
        { "start_minute": 76, "end_minute": 90, "goals": 0, "percentage": 0 }
      ],
      "first_scored_intervals": [
        { "start_minute": 1, "end_minute": 15, "goals": 0, "percentage": 0 },
        { "start_minute": 16, "end_minute": 30, "goals": 1, "percentage": 100 },
        { "start_minute": 31, "end_minute": 45, "goals": 0, "percentage": 0 },
        { "start_minute": 46, "end_minute": 60, "goals": 0, "percentage": 0 },
        { "start_minute": 61, "end_minute": 75, "goals": 0, "percentage": 0 },
        { "start_minute": 76, "end_minute": 90, "goals": 0, "percentage": 0 }
      ]
    },
    "home": { "matches_count": 1, "scored_intervals": [], "first_scored_intervals": [] },
    "away": { "matches_count": 0, "scored_intervals": [], "first_scored_intervals": [] }
  },
  "away_team": {
    "all": {
      "matches_count": 1,
      "scored_intervals": [
        { "start_minute": 1, "end_minute": 15, "goals": 1, "percentage": 50 },
        { "start_minute": 16, "end_minute": 30, "goals": 0, "percentage": 0 },
        { "start_minute": 31, "end_minute": 45, "goals": 1, "percentage": 50 },
        { "start_minute": 46, "end_minute": 60, "goals": 0, "percentage": 0 },
        { "start_minute": 61, "end_minute": 75, "goals": 0, "percentage": 0 },
        { "start_minute": 76, "end_minute": 90, "goals": 0, "percentage": 0 }
      ],
      "first_scored_intervals": [
        { "start_minute": 1, "end_minute": 15, "goals": 1, "percentage": 100 },
        { "start_minute": 16, "end_minute": 30, "goals": 0, "percentage": 0 },
        { "start_minute": 31, "end_minute": 45, "goals": 0, "percentage": 0 },
        { "start_minute": 46, "end_minute": 60, "goals": 0, "percentage": 0 },
        { "start_minute": 61, "end_minute": 75, "goals": 0, "percentage": 0 },
        { "start_minute": 76, "end_minute": 90, "goals": 0, "percentage": 0 }
      ]
    },
    "home": { "matches_count": 0, "scored_intervals": [], "first_scored_intervals": [] },
    "away": { "matches_count": 1, "scored_intervals": [], "first_scored_intervals": [] }
  }
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `matches_count` | `number` | `1` | 统计样本场次数。 |
| `scored_intervals` | `ParsedGoalInterval[]` | `[...]` | 进球时段分布数组（固定 6 个 15 分钟区间：1-15'、16-30'、31-45'、46-60'、61-75'、76-90'）。 |
| `scored_intervals[i].start_minute` | `number` | `16` | 时段起始分钟。 |
| `scored_intervals[i].end_minute` | `number` | `30` | 时段结束分钟。 |
| `scored_intervals[i].goals` | `number` | `1` | 该时段内的累计进球数。 |
| `scored_intervals[i].percentage` | `number` | `50` | 该时段进球数占总进球数的百分比 (50 代表 50%)。 |
| `first_scored_intervals` | `ParsedGoalInterval[]` | `[...]` | **首开纪录（首球）** 时段分布数组，用于判断“抢开局”能力。 |
| `first_scored_intervals[i].percentage` | `number` | `100` | 首开纪录在此时段发生的占比 (100 代表 100%)。 |



