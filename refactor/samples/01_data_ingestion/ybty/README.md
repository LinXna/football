# 01 数据接入层 - YBTY 清洗样例数据与中英全量字段对照备注

本文档为 `refactor/samples/01_data_ingestion/ybty/` 下 YBTY 样例数据的**全量中文备注与字段规范手册**。

包含两份核心样例：
1. 滚球标准提取样例：`refactor/samples/01_data_ingestion/ybty/ybty_live_extracted_sample.json`
2. 赛前标准提取样例：`refactor/samples/01_data_ingestion/ybty/ybty_prematch_extracted_sample.json`

---

## 1. 顶层元数据结构 (Root Level)

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
| `schema_version` | `number` | `2` | **协议大版本号**。强类型校验守卫，防止插件结构不匹配导致崩溃。 |
| `export_version` | `string` | `"2.8.0"` | **导出插件版本号**。用于排查浏览器插件与 DOM 解析兼容性。 |
| `captured_at` | `string` | `"2026-08-20T20:20:13.747Z"` | **全量抓取时间戳 (UTC ISO 8601)**。用于时效性校验与赛事对齐时间窗口。 |
| `matches` | `array` | `[...]` | **赛事明细列表**。包含本批次提取出的所有 YBTY 赛事。 |

---

## 2. 赛事基础信息字段说明 (Match Level)

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

| 字段名称 (`Key`) | 类型 | 示例值 | 滚球/赛前差异 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- | :--- |
| `league` | `string` | `"英格兰甲级联赛"` | 通用 | **YBTY 原始联赛名**。赛事层级识别与别名映射依据。 |
| `home` | `string` | `"谢周三"` | 通用 | **YBTY 原始主队名**。系统**绝对事实基准主队名**（最终推荐与台账必须以此为准）。 |
| `away` | `string` | `"布拉德福德城"` | 通用 | **YBTY 原始客队名**。系统**绝对事实基准客队名**（最终推荐与台账必须以此为准）。 |
| `home_score` | `number \| null` | `0` | 滚球独有 (赛前无此字段) | **主队即时进球数**。必须与雷速比分交叉核验。 |
| `away_score` | `number \| null` | `1` | 滚球独有 (赛前无此字段) | **客队即时进球数**。必须与雷速比分交叉核验。 |
| `clock` | `string \| null` | `"62:25"` / `null` | 滚球独有 (赛前无此字段) | **踢球进行中的即时分钟**。⚠️ 仅踢球时有值，中场或暂停时为 `null`。 |
| `clock_status` | `string` | `"62:25"` / `"中场休息"` / `"25分钟后开赛"` | 通用 | **比赛状态文本**。滚球中场显示 `"中场休息"`；赛前显示 `"25分钟后开赛"`。 |
| `markets` | `object` | `{...}` | 通用 | **即时盘口数据集合**。包含独赢、让球、大小球等。 |

---

## 3. 盘口数据字段说明 (Markets Level)

### (1) 全场独赢 (`markets.full_h2h`) / 半场独赢 (`markets.half_h2h`)
```json
{
  "home_odds": 8.7,
  "draw_odds": 3.75,
  "away_odds": 1.43
}
```
| 字段名称 | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `home_odds` | `number` | `8.7` | **主胜欧赔 (含本金)**。用于去抽水公允胜率计算。 |
| `draw_odds` | `number` | `3.75` | **平局欧赔 (含本金)**。用于去抽水平局概率。 |
| `away_odds` | `number` | `1.43` | **客胜欧赔 (含本金)**。用于去抽水客胜概率。 |

---

### (2) 全场让球 (`full_spread_main` / `full_spread_subs`) / 半场让球 (`half_spread_main`)
> ⚠️ **核心量化口径**：滚球让球盘口表示**自推荐时刻起双方比分视为 0:0，仅结算后续剩余时段的新增净胜球**！

```json
{
  "line_index": 0,
  "home_selection": "-0/0.5",
  "home_odds": 2.2,
  "away_selection": "+0/0.5",
  "away_odds": 1.71
}
```
| 字段名称 | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `line_index` | `number` | `0` (主盘) / `1` (副盘) | **盘口深度索引**。`0` 为核心主盘，`1`、`2` 为深度副盘。 |
| `home_selection` | `string` | `"-0/0.5"` / `"0"` / `"-0.5"` | **主队让球/受让盘口线**。支持四分之一盘。 |
| `home_odds` | `number` | `2.2` | **主队水位赔率 (含本金)**。 |
| `away_selection` | `string` | `"+0/0.5"` / `"0"` / `"+0.5"` | **客队让球/受让盘口线**。 |
| `away_odds` | `number` | `1.71` | **客队水位赔率 (含本金)**。 |

---

### (3) 全场大小球 (`full_total_main` / `full_total_subs`) / 半场大小球 (`half_total_main`)
```json
{
  "line_index": 0,
  "line": "2",
  "over_odds": 1.91,
  "under_odds": 1.95
}
```
| 字段名称 | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `line_index` | `number` | `0` (主盘) / `1` (副盘) | **盘口深度索引**。`0` 为核心主盘，`1`、`2` 为高低副盘。 |
| `line` | `string` | `"2"` / `"2/2.5"` / `"1.5/2"` | **大小球分界线**。支持四分之一盘口。 |
| `over_odds` | `number` | `1.91` | **大球 (Over) 水位赔率**。 |
| `under_odds` | `number` | `1.95` | **小球 (Under) 水位赔率**。 |
