# 足球量化系统 (Layer 00 - Layer 03) 全链路计算与逻辑诊断白皮书

**文档目的**：提供从 Layer 00 契约定义到 Layer 03 核心量化引擎输出的**毫无损耗、无抽象、全链路透明**的数据流和计算过程剖析。
本文档包含真实的、未经过滤的 JSON 原始输入数据，以及关键环节的实际源码切片，供专家 AI 进行系统级问题排查和重构设计（特别针对胜率/EV平衡、OOS过滤漏洞）。

---

## 阶段零：Layer 00 & Layer 01 数据摄取与清洗 (Ingestion)

数据从外部源 (YBTY/雷速) 进入，在 Layer 01 进行清洗和初步标准化。
*此阶段不涉及复杂量化，主要确保数据结构对齐，过滤脏数据。*

---

## 阶段一：Layer 02 规范化实体合成 (Canonical Model)

Layer 02 负责将不同来源的数据融合为一个单一的、结构化的事实来源 (`CanonicalMatch`)。

### 1.1 全量真实原始输入数据 (The Raw Payload)
以下是 Layer 02 最终输出的、输入给 Layer 03 的**全量无删减**真实数据切片。它是后续所有量化推演的唯一基石。
（比赛：谢周三 vs 布拉德福德城，62分钟，比分 0-1）

```json
{
  "sample_version": "1.0.0",
  "generated_at": "2026-09-01T07:23:14.895Z",
  "description": "Layer 02 标准赛事对象 (CanonicalMatch) 与 AI Slim Brief 提炼样本",
  "canonical_match": {
    "canonical_id": "4562395",
    "match_slug": "英格兰甲级联赛_谢周三_vs_布拉德福德城",
    "created_at": "2026-09-01T07:23:14.894Z",
    "completeness_tier": "TIER_1_FULL",
    "missing_reasons": [],
    "alignment": {
      "status": "MATCHED_BY_ALIAS",
      "confidence_score": 100,
      "home_team_match": {
        "ybty_name": "谢周三",
        "leisu_name": "谢周三",
        "is_alias_exact_hit": true,
        "raw_text_similarity": 1
      },
      "away_team_match": {
        "ybty_name": "布拉德福德城",
        "leisu_name": "布拉德福德",
        "is_alias_exact_hit": true,
        "raw_text_similarity": 1
      },
      "league_match": {
        "ybty_league": "英格兰甲级联赛",
        "leisu_league": "英甲",
        "status": "MATCHED_BY_ALIAS",
        "similarity": 1,
        "is_alias_exact_hit": true
      },
      "league_match_score": 1,
      "is_swapped_suspected": false,
      "alignment_reason": "主客两队均命中静态别名库 (100% 精确匹配)"
    },
    "league_name": "英格兰甲级联赛",
    "home_team_name": "谢周三",
    "away_team_name": "布拉德福德城",
    "timing": {
      "stage": "LIVE",
      "beijing_start_time": "2026-08-21 03:00:00",
      "start_time_source": "LEISU_SUPPLEMENTED",
      "minute": 62,
      "is_half_time": false,
      "is_extra_time": false,
      "is_overtime_or_penalty": false,
      "ybty_display_clock": "62:25"
    },
    "score": {
      "home_score": 0,
      "away_score": 1,
      "home_half_score": 0,
      "away_half_score": 0,
      "score_verified": true,
      "score_source": "LEISU_INTERFACE",
      "is_mismatch_detected": false,
      "mismatch_details": null,
      "var_overturned_goals_count": 0
    },
    "markets": {
      "full_h2h": {
        "home_odds": 8.7,
        "draw_odds": 3.75,
        "away_odds": 1.43
      },
      "full_spread_main": {
        "line_index": 0,
        "home_selection": "-0/0.5",
        "home_odds": 2.2,
        "away_selection": "+0/0.5",
        "away_odds": 1.71
      },
      "full_spread_subs": [
        {
          "line_index": 1,
          "home_selection": "0",
          "home_odds": 1.6,
          "away_selection": "0",
          "away_odds": 2.38
        },
        {
          "line_index": 2,
          "home_selection": "-0.5",
          "home_odds": 2.69,
          "away_selection": "+0.5",
          "away_odds": 1.47
        }
      ],
      "full_total_main": {
        "line_index": 0,
        "line": "2",
        "over_odds": 1.91,
        "under_odds": 1.95
      },
      "full_total_subs": [
        {
          "line_index": 1,
          "line": "2/2.5",
          "over_odds": 2.4,
          "under_odds": 1.57
        },
        {
          "line_index": 2,
          "line": "1.5/2",
          "over_odds": 1.56,
          "under_odds": 2.42
        }
      ],
      "half_h2h": null,
      "half_spread_main": null,
      "half_total_main": null
    },
    "reference": {
      "leisu_match_id": "4562395",
      "leisu_home_name": "谢周三",
      "leisu_away_name": "布拉德福德",
      "leisu_league_name": "英甲",
      "stats": {
        "corners": {
          "home": 6,
          "away": 7
        },
        "yellow_cards": {
          "home": 1,
          "away": 0
        },
        "red_cards": {
          "home": 0,
          "away": 0
        },
        "attacks": {
          "home": 61,
          "away": 70
        },
        "dangerous_attacks": {
          "home": 38,
          "away": 30
        },
        "possession": {
          "home": 60,
          "away": 40
        },
        "shots_on_target": {
          "home": 3,
          "away": 3
        },
        "shots_off_target": {
          "home": 5,
          "away": 3
        },
        "shots": {
          "home": 8,
          "away": 6
        }
      },
      "attack_momentum": {
        "available": true,
        "segment_count": 2,
        "nominal_segment_minutes": 45,
        "data": [
          [
            -12,
            -16,
            32,
            58,
            -50,
            78,
            38,
            14,
            68,
            68,
            100,
            4,
            -12,
            -80,
            -78,
            -50,
            -44,
            -20,
            64,
            -20,
            100,
            -14,
            -40,
            0,
            20,
            0,
            -56,
            22,
            -8,
            52,
            -10,
            -10,
            24,
            22,
            100,
            56,
            -6,
            14,
            -44,
            52,
            80,
            0,
            -20,
            2,
            -78,
            -20
          ],
          [
            -18,
            -60,
            0,
            -26,
            72,
            -44,
            -54,
            -50,
            -78,
            22,
            100,
            -20,
            38,
            54,
            26,
            44,
            -100
          ]
        ]
      },
      "timeline_events": [
        {
          "minute": null,
          "base_minute": null,
          "added_minute": null,
          "display_time": "",
          "type": 0,
          "type_name": "系统提示/准备",
          "canonical_type": "VAR_REVIEW",
          "category": "MATCH_CONTROL",
          "side": "neutral",
          "text": "大家好，欢迎收看本场比赛直播，球员们正在热身，比赛即将开始",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": null,
          "base_minute": null,
          "added_minute": null,
          "display_time": "",
          "type": 0,
          "type_name": "系统提示/准备",
          "canonical_type": "VAR_REVIEW",
          "category": "MATCH_CONTROL",
          "side": "neutral",
          "text": "本场比赛场地情况：良好",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": null,
          "base_minute": null,
          "added_minute": null,
          "display_time": "",
          "type": 0,
          "type_name": "系统提示/准备",
          "canonical_type": "VAR_REVIEW",
          "category": "MATCH_CONTROL",
          "side": "neutral",
          "text": "本场比赛天气情况：局部有云",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": null,
          "base_minute": null,
          "added_minute": null,
          "display_time": "",
          "type": 10,
          "type_name": "开球",
          "canonical_type": "KICK_OFF",
          "category": "MATCH_CONTROL",
          "side": "neutral",
          "text": "随着主裁判一声哨响，上半场比赛开始，本场开球：谢周三",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 4,
          "base_minute": 4,
          "added_minute": null,
          "display_time": "4'",
          "type": 22,
          "type_name": "射偏",
          "canonical_type": "SHOT_OFF_TARGET",
          "category": "TACTICAL",
          "side": "home",
          "text": "4' - 第1个射偏 - (谢周三)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 4,
          "base_minute": 4,
          "added_minute": null,
          "display_time": "4'",
          "type": 22,
          "type_name": "射偏",
          "canonical_type": "SHOT_OFF_TARGET",
          "category": "TACTICAL",
          "side": "home",
          "text": "4' - 第2个射偏 - (谢周三)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 6,
          "base_minute": 6,
          "added_minute": null,
          "display_time": "6'",
          "type": 21,
          "type_name": "射正",
          "canonical_type": "SHOT_ON_TARGET",
          "category": "TACTICAL",
          "side": "home",
          "text": "6' - 第1个射正 - (谢周三)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 6,
          "base_minute": 6,
          "added_minute": null,
          "display_time": "6'",
          "type": 5,
          "type_name": "越位",
          "canonical_type": "OFFSIDE",
          "category": "TACTICAL",
          "side": "home",
          "text": "6' - 第1个越位 - (谢周三)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 7,
          "base_minute": 7,
          "added_minute": null,
          "display_time": "7'",
          "type": 2,
          "type_name": "角球",
          "canonical_type": "CORNER",
          "category": "TACTICAL",
          "side": "home",
          "text": "7' - 7分钟，谢周三获得本场第1个角球",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 7,
          "base_minute": 7,
          "added_minute": null,
          "display_time": "7'",
          "type": 21,
          "type_name": "射正",
          "canonical_type": "SHOT_ON_TARGET",
          "category": "TACTICAL",
          "side": "home",
          "text": "7' - 第2个射正 - (谢周三)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 8,
          "base_minute": 8,
          "added_minute": null,
          "display_time": "8'",
          "type": 22,
          "type_name": "射偏",
          "canonical_type": "SHOT_OFF_TARGET",
          "category": "TACTICAL",
          "side": "home",
          "text": "8' - 第3个射偏 - (谢周三)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 13,
          "base_minute": 13,
          "added_minute": null,
          "display_time": "13'",
          "type": 2,
          "type_name": "角球",
          "canonical_type": "CORNER",
          "category": "TACTICAL",
          "side": "home",
          "text": "13' - 第2个角球 - (谢周三)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 13,
          "base_minute": 13,
          "added_minute": null,
          "display_time": "13'",
          "type": 2,
          "type_name": "角球",
          "canonical_type": "CORNER",
          "category": "TACTICAL",
          "side": "home",
          "text": "13' - 第3个角球 - (谢周三)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 13,
          "base_minute": 13,
          "added_minute": null,
          "display_time": "13'",
          "type": 22,
          "type_name": "射偏",
          "canonical_type": "SHOT_OFF_TARGET",
          "category": "TACTICAL",
          "side": "home",
          "text": "13' - 第4个射偏 - (谢周三)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 19,
          "base_minute": 19,
          "added_minute": null,
          "display_time": "19'",
          "type": 2,
          "type_name": "角球",
          "canonical_type": "CORNER",
          "category": "TACTICAL",
          "side": "away",
          "text": "19' - 第4个角球 - (布拉德福德)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 21,
          "base_minute": 21,
          "added_minute": null,
          "display_time": "21'",
          "type": 2,
          "type_name": "角球",
          "canonical_type": "CORNER",
          "category": "TACTICAL",
          "side": "home",
          "text": "21' - 第5个角球 - (谢周三)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 26,
          "base_minute": 26,
          "added_minute": null,
          "display_time": "26'",
          "type": 22,
          "type_name": "射偏",
          "canonical_type": "SHOT_OFF_TARGET",
          "category": "TACTICAL",
          "side": "away",
          "text": "26' - 第5个射偏 - (布拉德福德)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 27,
          "base_minute": 27,
          "added_minute": null,
          "display_time": "27'",
          "type": 22,
          "type_name": "射偏",
          "canonical_type": "SHOT_OFF_TARGET",
          "category": "TACTICAL",
          "side": "away",
          "text": "27' - 第6个射偏 - (布拉德福德)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 29,
          "base_minute": 29,
          "added_minute": null,
          "display_time": "29'",
          "type": 22,
          "type_name": "射偏",
          "canonical_type": "SHOT_OFF_TARGET",
          "category": "TACTICAL",
          "side": "home",
          "text": "29' - 第7个射偏 - (谢周三)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 30,
          "base_minute": 30,
          "added_minute": null,
          "display_time": "30'",
          "type": 22,
          "type_name": "射偏",
          "canonical_type": "SHOT_OFF_TARGET",
          "category": "TACTICAL",
          "side": "home",
          "text": "30' - 第8个射偏 - (谢周三)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 34,
          "base_minute": 34,
          "added_minute": null,
          "display_time": "34'",
          "type": 5,
          "type_name": "越位",
          "canonical_type": "OFFSIDE",
          "category": "TACTICAL",
          "side": "home",
          "text": "34' - 第2个越位 - (谢周三)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 37,
          "base_minute": 37,
          "added_minute": null,
          "display_time": "37'",
          "type": 2,
          "type_name": "角球",
          "canonical_type": "CORNER",
          "category": "TACTICAL",
          "side": "home",
          "text": "37' - 第6个角球 - (谢周三)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 37,
          "base_minute": 37,
          "added_minute": null,
          "display_time": "37'",
          "type": 22,
          "type_name": "射偏",
          "canonical_type": "SHOT_OFF_TARGET",
          "category": "TACTICAL",
          "side": "away",
          "text": "37' - 第9个射偏 - (布拉德福德)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 38,
          "base_minute": 38,
          "added_minute": null,
          "display_time": "38'",
          "type": 2,
          "type_name": "角球",
          "canonical_type": "CORNER",
          "category": "TACTICAL",
          "side": "away",
          "text": "38' - 第7个角球 - (布拉德福德)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 39,
          "base_minute": 39,
          "added_minute": null,
          "display_time": "39'",
          "type": 2,
          "type_name": "角球",
          "canonical_type": "CORNER",
          "category": "TACTICAL",
          "side": "away",
          "text": "39' - 第8个角球 - (布拉德福德)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 40,
          "base_minute": 40,
          "added_minute": null,
          "display_time": "40'",
          "type": 22,
          "type_name": "射偏",
          "canonical_type": "SHOT_OFF_TARGET",
          "category": "TACTICAL",
          "side": "home",
          "text": "40' - 第10个射偏 - (谢周三)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 41,
          "base_minute": 41,
          "added_minute": null,
          "display_time": "41'",
          "type": 2,
          "type_name": "角球",
          "canonical_type": "CORNER",
          "category": "TACTICAL",
          "side": "home",
          "text": "41' - 第9个角球 - (谢周三)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 42,
          "base_minute": 42,
          "added_minute": null,
          "display_time": "42'",
          "type": 22,
          "type_name": "射偏",
          "canonical_type": "SHOT_OFF_TARGET",
          "category": "TACTICAL",
          "side": "home",
          "text": "42' - 第11个射偏 - (谢周三)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 44,
          "base_minute": 44,
          "added_minute": null,
          "display_time": "44'",
          "type": 21,
          "type_name": "射正",
          "canonical_type": "SHOT_ON_TARGET",
          "category": "TACTICAL",
          "side": "home",
          "text": "44' - 第3个射正 - (谢周三)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 45,
          "base_minute": 45,
          "added_minute": null,
          "display_time": "45'",
          "type": 11,
          "type_name": "半场结束",
          "canonical_type": "HALF_TIME_WHISTLE",
          "category": "MATCH_CONTROL",
          "side": "neutral",
          "text": "45' - 随着裁判一声哨响，上半场结束，目前比分0-0",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 47,
          "base_minute": 47,
          "added_minute": null,
          "display_time": "47'",
          "type": 2,
          "type_name": "角球",
          "canonical_type": "CORNER",
          "category": "TACTICAL",
          "side": "away",
          "text": "47' - 第10个角球，本场比赛的第十个角球已经产生！",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 47,
          "base_minute": 47,
          "added_minute": null,
          "display_time": "47'",
          "type": 1,
          "type_name": "进球",
          "canonical_type": "GOAL_REGULAR",
          "category": "SCORE",
          "side": "away",
          "text": "47' - 第1个进球！球进啦！鲍德温(布拉德福德 射门 (助攻: 彭宁顿))取得本场比赛领先！",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 47,
          "base_minute": 47,
          "added_minute": null,
          "display_time": "47'",
          "type": 22,
          "type_name": "射偏",
          "canonical_type": "SHOT_OFF_TARGET",
          "category": "TACTICAL",
          "side": "away",
          "text": "47' - 第12个射偏 - (布拉德福德)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 47,
          "base_minute": 47,
          "added_minute": null,
          "display_time": "47'",
          "type": 22,
          "type_name": "射偏",
          "canonical_type": "SHOT_OFF_TARGET",
          "category": "TACTICAL",
          "side": "away",
          "text": "47' - 第13个射偏 - (布拉德福德)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 47,
          "base_minute": 47,
          "added_minute": null,
          "display_time": "47'",
          "type": 21,
          "type_name": "射正",
          "canonical_type": "SHOT_ON_TARGET",
          "category": "TACTICAL",
          "side": "away",
          "text": "47' - 第4个射正 - (布拉德福德)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 53,
          "base_minute": 53,
          "added_minute": null,
          "display_time": "53'",
          "type": 2,
          "type_name": "角球",
          "canonical_type": "CORNER",
          "category": "TACTICAL",
          "side": "away",
          "text": "53' - 第11个角球 - (布拉德福德)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 53,
          "base_minute": 53,
          "added_minute": null,
          "display_time": "53'",
          "type": 21,
          "type_name": "射正",
          "canonical_type": "SHOT_ON_TARGET",
          "category": "TACTICAL",
          "side": "away",
          "text": "53' - 第5个射正 - (布拉德福德)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 53,
          "base_minute": 53,
          "added_minute": null,
          "display_time": "53'",
          "type": 21,
          "type_name": "射正",
          "canonical_type": "SHOT_ON_TARGET",
          "category": "TACTICAL",
          "side": "away",
          "text": "53' - 第6个射正 - (布拉德福德)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 54,
          "base_minute": 54,
          "added_minute": null,
          "display_time": "54'",
          "type": 2,
          "type_name": "角球",
          "canonical_type": "CORNER",
          "category": "TACTICAL",
          "side": "away",
          "text": "54' - 第12个角球 - (布拉德福德)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 54,
          "base_minute": 54,
          "added_minute": null,
          "display_time": "54'",
          "type": 2,
          "type_name": "角球",
          "canonical_type": "CORNER",
          "category": "TACTICAL",
          "side": "away",
          "text": "54' - 第13个角球 - (布拉德福德)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 55,
          "base_minute": 55,
          "added_minute": null,
          "display_time": "55'",
          "type": 21,
          "type_name": "射正",
          "canonical_type": "SHOT_ON_TARGET",
          "category": "TACTICAL",
          "side": "away",
          "text": "55' - 第7个射正 - (布拉德福德)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 56,
          "base_minute": 56,
          "added_minute": null,
          "display_time": "56'",
          "type": 22,
          "type_name": "射偏",
          "canonical_type": "SHOT_OFF_TARGET",
          "category": "TACTICAL",
          "side": "home",
          "text": "56' - 第14个射偏 - (谢周三)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 56,
          "base_minute": 56,
          "added_minute": null,
          "display_time": "56'",
          "type": 22,
          "type_name": "射偏",
          "canonical_type": "SHOT_OFF_TARGET",
          "category": "TACTICAL",
          "side": "home",
          "text": "56' - 第15个射偏 - (谢周三)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 61,
          "base_minute": 61,
          "added_minute": null,
          "display_time": "61'",
          "type": 3,
          "type_name": "黄牌",
          "canonical_type": "YELLOW_CARD",
          "category": "DISCIPLINE",
          "side": "home",
          "text": "61' - 第1张黄牌，裁判出示了本场比赛的第一张黄牌，给了谢周三",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 62,
          "base_minute": 62,
          "added_minute": null,
          "display_time": "62'",
          "type": 5,
          "type_name": "越位",
          "canonical_type": "OFFSIDE",
          "category": "TACTICAL",
          "side": "away",
          "text": "62' - 第3个越位 - (布拉德福德)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        },
        {
          "minute": 63,
          "base_minute": 63,
          "added_minute": null,
          "display_time": "63'",
          "type": 22,
          "type_name": "射偏",
          "canonical_type": "SHOT_OFF_TARGET",
          "category": "TACTICAL",
          "side": "away",
          "text": "63' - 第16个射偏 - (布拉德福德)",
          "is_penalty": false,
          "is_own_goal": false,
          "is_cancelled": false,
          "is_var_overturned": false,
          "is_on_pitch": true
        }
      ],
      "lineups": {
        "confirmed": true,
        "venue": {
          "name": "希尔斯堡球场",
          "city": "谢菲尔德",
          "country": "England",
          "capacity": 34835
        },
        "home_formation": "4-2-3-1",
        "away_formation": "3-4-2-1",
        "home_manager": "佩德森",
        "away_manager": "亚历山大",
        "home_starters": [
          {
            "player_id": 1809241,
            "team_id": 10101,
            "name": "奥特格巴约",
            "shirt_number": 22,
            "status": 1,
            "status_name": "首发",
            "starter": true,
            "captain": false,
            "best_player": false,
            "rating": 6.9,
            "age": 21,
            "height": 188,
            "market_value": 800000,
            "market_value_text": "80万欧",
            "position": "后卫",
            "position_name": "后卫",
            "position_code": "D",
            "incidents": []
          },
          {
            "player_id": 18364,
            "team_id": 10101,
            "name": "L.库珀",
            "shirt_number": 6,
            "status": 1,
            "status_name": "首发",
            "starter": true,
            "captain": false,
            "best_player": false,
            "rating": 6.8,
            "age": 34,
            "height": 186,
            "market_value": 200000,
            "market_value_text": "20万欧",
            "position": "后卫",
            "position_name": "后卫",
            "position_code": "D",
            "incidents": []
          },
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
          },
          {
            "player_id": 1139698,
            "team_id": 10101,
            "name": "米切尔",
            "shirt_number": 16,
            "status": 1,
            "status_name": "首发",
            "starter": true,
            "captain": false,
            "best_player": false,
            "rating": 6.5,
            "age": 26,
            "height": 178,
            "market_value": 3000000,
            "market_value_text": "300万欧",
            "position": "中场",
            "position_name": "中场",
            "position_code": "M",
            "incidents": [
              {
                "type": 3,
                "type_name": "黄牌",
                "time": 61,
                "reason_type": "犯规",
                "reason_desc": "犯规"
              }
            ]
          },
          {
            "player_id": 56736,
            "team_id": 10101,
            "name": "拉姆利",
            "shirt_number": 1,
            "status": 1,
            "status_name": "首发",
            "starter": true,
            "captain": false,
            "best_player": false,
            "rating": 6.5,
            "age": 31,
            "height": 190,
            "market_value": 400000,
            "market_value_text": "40万欧",
            "position": "守门员",
            "position_name": "守门员",
            "position_code": "G",
            "incidents": []
          },
          {
            "player_id": 1178560,
            "team_id": 10101,
            "name": "巴里",
            "shirt_number": 11,
            "status": 1,
            "status_name": "首发",
            "starter": true,
            "captain": false,
            "best_player": false,
            "rating": 6.4,
            "age": 23,
            "height": 174,
            "market_value": 2500000,
            "market_value_text": "250万欧",
            "position": "前锋",
            "position_name": "中场",
            "position_code": "F",
            "incidents": []
          },
          {
            "player_id": 111891,
            "team_id": 10101,
            "name": "斯拉特利",
            "shirt_number": 8,
            "status": 1,
            "status_name": "首发",
            "starter": true,
            "captain": false,
            "best_player": false,
            "rating": 6.4,
            "age": 27,
            "height": 175,
            "market_value": 700000,
            "market_value_text": "70万欧",
            "position": "中场",
            "position_name": "中场",
            "position_code": "M",
            "incidents": []
          },
          {
            "player_id": 1892132,
            "team_id": 10101,
            "name": "格雷",
            "shirt_number": 24,
            "status": 1,
            "status_name": "首发",
            "starter": true,
            "captain": false,
            "best_player": false,
            "rating": 6.3,
            "age": 17,
            "height": 181,
            "market_value": 700000,
            "market_value_text": "70万欧",
            "position": "中场",
            "position_name": "中场",
            "position_code": "M",
            "incidents": []
          },
          {
            "player_id": 45233,
            "team_id": 10101,
            "name": "洛韦",
            "shirt_number": 9,
            "status": 1,
            "status_name": "首发",
            "starter": true,
            "captain": false,
            "best_player": false,
            "rating": 6.2,
            "age": 32,
            "height": 183,
            "market_value": 500000,
            "market_value_text": "50万欧",
            "position": "前锋",
            "position_name": "前锋",
            "position_code": "F",
            "incidents": []
          },
          {
            "player_id": 52055,
            "team_id": 10101,
            "name": "洛维",
            "shirt_number": 3,
            "status": 1,
            "status_name": "首发",
            "starter": true,
            "captain": false,
            "best_player": false,
            "rating": 6.1,
            "age": 29,
            "height": 175,
            "market_value": 1800000,
            "market_value_text": "180万欧",
            "position": "后卫",
            "position_name": "后卫",
            "position_code": "D",
            "incidents": []
          },
          {
            "player_id": 104630,
            "team_id": 10101,
            "name": "瓦莱里",
            "shirt_number": 7,
            "status": 1,
            "status_name": "首发",
            "starter": true,
            "captain": false,
            "best_player": false,
            "rating": 6,
            "age": 27,
            "height": 185,
            "market_value": 1500000,
            "market_value_text": "150万欧",
            "position": "后卫",
            "position_name": "后卫",
            "position_code": "D",
            "incidents": []
          }
        ],
        "away_starters": [
          {
            "player_id": 1095285,
            "team_id": 10102,
            "name": "鲍德温",
            "shirt_number": 15,
            "status": 1,
            "status_name": "首发",
            "starter": true,
            "captain": false,
            "best_player": true,
            "rating": 8.3,
            "age": 29,
            "height": 182,
            "market_value": 300000,
            "market_value_text": "30万欧",
            "position": "后卫",
            "position_name": "后卫",
            "position_code": "D",
            "incidents": [
              {
                "type": 1,
                "type_name": "进球",
                "time": 47,
                "reason_type": null,
                "reason_desc": null
              }
            ]
          },
          {
            "player_id": 1152707,
            "team_id": 10102,
            "name": "麦克拉肯",
            "shirt_number": 21,
            "status": 1,
            "status_name": "首发",
            "starter": true,
            "captain": false,
            "best_player": false,
            "rating": 6.8,
            "age": 26,
            "height": 190,
            "market_value": 500000,
            "market_value_text": "50万欧",
            "position": "守门员",
            "position_name": "守门员",
            "position_code": "G",
            "incidents": []
          },
          {
            "player_id": 910858,
            "team_id": 10102,
            "name": "纽夫维尔",
            "shirt_number": 7,
            "status": 1,
            "status_name": "首发",
            "starter": true,
            "captain": false,
            "best_player": false,
            "rating": 6.7,
            "age": 26,
            "height": 183,
            "market_value": 700000,
            "market_value_text": "70万欧",
            "position": "中场",
            "position_name": "中场",
            "position_code": "M",
            "incidents": []
          },
          {
            "player_id": 1562724,
            "team_id": 10102,
            "name": "波因顿",
            "shirt_number": 23,
            "status": 1,
            "status_name": "首发",
            "starter": true,
            "captain": false,
            "best_player": false,
            "rating": 6.6,
            "age": 22,
            "height": 0,
            "market_value": 550000,
            "market_value_text": "55万欧",
            "position": "中场",
            "position_name": "中场",
            "position_code": "M",
            "incidents": []
          },
          {
            "player_id": 50617,
            "team_id": 10102,
            "name": "杰克逊",
            "shirt_number": 19,
            "status": 1,
            "status_name": "首发",
            "starter": true,
            "captain": false,
            "best_player": false,
            "rating": 6.5,
            "age": 32,
            "height": 181,
            "market_value": 200000,
            "market_value_text": "20万欧",
            "position": "前锋",
            "position_name": "中场",
            "position_code": "F",
            "incidents": []
          },
          {
            "player_id": 54622,
            "team_id": 10102,
            "name": "比斯利",
            "shirt_number": 9,
            "status": 1,
            "status_name": "首发",
            "starter": true,
            "captain": false,
            "best_player": false,
            "rating": 6.5,
            "age": 29,
            "height": 185,
            "market_value": 300000,
            "market_value_text": "30万欧",
            "position": "前锋",
            "position_name": "前锋",
            "position_code": "F",
            "incidents": []
          },
          {
            "player_id": 70080,
            "team_id": 10102,
            "name": "吉莱斯皮",
            "shirt_number": 5,
            "status": 1,
            "status_name": "首发",
            "starter": true,
            "captain": false,
            "best_player": false,
            "rating": 6.4,
            "age": 30,
            "height": 180,
            "market_value": 400000,
            "market_value_text": "40万欧",
            "position": "后卫",
            "position_name": "后卫",
            "position_code": "D",
            "incidents": []
          },
          {
            "player_id": 32490,
            "team_id": 10102,
            "name": "萨尔切维奇",
            "shirt_number": 10,
            "status": 1,
            "status_name": "首发",
            "starter": true,
            "captain": true,
            "best_player": false,
            "rating": 6.4,
            "age": 34,
            "height": 183,
            "market_value": 50000,
            "market_value_text": "5万欧",
            "position": "中场",
            "position_name": "中场",
            "position_code": "M",
            "incidents": []
          },
          {
            "player_id": 1107851,
            "team_id": 10102,
            "name": "图雷",
            "shirt_number": 3,
            "status": 1,
            "status_name": "首发",
            "starter": true,
            "captain": false,
            "best_player": false,
            "rating": 6.3,
            "age": 31,
            "height": 177,
            "market_value": 225000,
            "market_value_text": "22.5万欧",
            "position": "后卫",
            "position_name": "中场",
            "position_code": "D",
            "incidents": []
          },
          {
            "player_id": 73196,
            "team_id": 10102,
            "name": "康纳利",
            "shirt_number": 6,
            "status": 1,
            "status_name": "首发",
            "starter": true,
            "captain": false,
            "best_player": false,
            "rating": 6.2,
            "age": 28,
            "height": 183,
            "market_value": 550000,
            "market_value_text": "55万欧",
            "position": "后卫",
            "position_name": "中场",
            "position_code": "D",
            "incidents": []
          },
          {
            "player_id": 53371,
            "team_id": 10102,
            "name": "彭宁顿",
            "shirt_number": 28,
            "status": 1,
            "status_name": "首发",
            "starter": true,
            "captain": false,
            "best_player": false,
            "rating": 6.1,
            "age": 31,
            "height": 185,
            "market_value": 250000,
            "market_value_text": "25万欧",
            "position": "后卫",
            "position_name": "后卫",
            "position_code": "D",
            "incidents": [
              {
                "type": 99,
                "type_name": "助攻",
                "time": 47,
                "reason_type": null,
                "reason_desc": null
              }
            ]
          }
        ],
        "home_substitutes": [
          {
            "player_id": 29145,
            "team_id": 10101,
            "name": "帕尔默",
            "shirt_number": 2,
            "status": 0,
            "status_name": "替补",
            "starter": false,
            "captain": false,
            "best_player": false,
            "rating": 0,
            "age": 34,
            "height": 188,
            "market_value": 100000,
            "market_value_text": "10万欧",
            "position": "后卫",
            "position_name": "后卫",
            "position_code": "D",
            "incidents": []
          },
          {
            "player_id": 100104,
            "team_id": 10101,
            "name": "杜鲁曼",
            "shirt_number": 27,
            "status": 0,
            "status_name": "替补",
            "starter": false,
            "captain": false,
            "best_player": false,
            "rating": 0,
            "age": 30,
            "height": 186,
            "market_value": 75000,
            "market_value_text": "7.5万欧",
            "position": "守门员",
            "position_name": "守门员",
            "position_code": "G",
            "incidents": []
          },
          {
            "player_id": 1459015,
            "team_id": 10101,
            "name": "伯斯托",
            "shirt_number": 48,
            "status": 0,
            "status_name": "替补",
            "starter": false,
            "captain": false,
            "best_player": false,
            "rating": 0,
            "age": 23,
            "height": 187,
            "market_value": 2800000,
            "market_value_text": "280万欧",
            "position": "后卫",
            "position_name": "前锋",
            "position_code": "D",
            "incidents": []
          },
          {
            "player_id": 1636241,
            "team_id": 10101,
            "name": "莫里森",
            "shirt_number": 20,
            "status": 0,
            "status_name": "替补",
            "starter": false,
            "captain": false,
            "best_player": false,
            "rating": 0,
            "age": 19,
            "height": 170,
            "market_value": 0,
            "market_value_text": "-",
            "position": "中场",
            "position_name": "中场",
            "position_code": "M",
            "incidents": []
          },
          {
            "player_id": 1618396,
            "team_id": 10101,
            "name": "桑顿",
            "shirt_number": 37,
            "status": 0,
            "status_name": "替补",
            "starter": false,
            "captain": false,
            "best_player": false,
            "rating": 0,
            "age": 20,
            "height": 177,
            "market_value": 500000,
            "market_value_text": "50万欧",
            "position": "中场",
            "position_name": "中场",
            "position_code": "M",
            "incidents": []
          },
          {
            "player_id": 1364847,
            "team_id": 10101,
            "name": "斯温克尔",
            "shirt_number": 26,
            "status": 0,
            "status_name": "替补",
            "starter": false,
            "captain": false,
            "best_player": false,
            "rating": 0,
            "age": 22,
            "height": 172,
            "market_value": 250000,
            "market_value_text": "25万欧",
            "position": "后卫",
            "position_name": "后卫",
            "position_code": "D",
            "incidents": []
          },
          {
            "player_id": 54893,
            "team_id": 10101,
            "name": "桑托斯",
            "shirt_number": 4,
            "status": 0,
            "status_name": "替补",
            "starter": false,
            "captain": false,
            "best_player": false,
            "rating": 0,
            "age": 31,
            "height": 196,
            "market_value": 350000,
            "market_value_text": "35万欧",
            "position": "后卫",
            "position_name": "后卫",
            "position_code": "D",
            "incidents": []
          }
        ],
        "away_substitutes": [
          {
            "player_id": 1326756,
            "team_id": 10102,
            "name": "斯万",
            "shirt_number": 24,
            "status": 0,
            "status_name": "替补",
            "starter": false,
            "captain": false,
            "best_player": false,
            "rating": 0,
            "age": 25,
            "height": 0,
            "market_value": 350000,
            "market_value_text": "35万欧",
            "position": "前锋",
            "position_name": "前锋",
            "position_code": "F",
            "incidents": []
          },
          {
            "player_id": 31583,
            "team_id": 10102,
            "name": "鲍威尔",
            "shirt_number": 25,
            "status": 0,
            "status_name": "替补",
            "starter": false,
            "captain": false,
            "best_player": false,
            "rating": 0,
            "age": 32,
            "height": 183,
            "market_value": 150000,
            "market_value_text": "15万欧",
            "position": "中场",
            "position_name": "中场",
            "position_code": "M",
            "incidents": []
          },
          {
            "player_id": 56227,
            "team_id": 10102,
            "name": "菲利普斯",
            "shirt_number": 8,
            "status": 0,
            "status_name": "替补",
            "starter": false,
            "captain": false,
            "best_player": false,
            "rating": 0,
            "age": 28,
            "height": 180,
            "market_value": 650000,
            "market_value_text": "65万欧",
            "position": "中场",
            "position_name": "中场",
            "position_code": "M",
            "incidents": []
          },
          {
            "player_id": 910769,
            "team_id": 10102,
            "name": "拉普斯利",
            "shirt_number": 32,
            "status": 0,
            "status_name": "替补",
            "starter": false,
            "captain": false,
            "best_player": false,
            "rating": 0,
            "age": 28,
            "height": 180,
            "market_value": 250000,
            "market_value_text": "25万欧",
            "position": "中场",
            "position_name": "中场",
            "position_code": "M",
            "incidents": []
          },
          {
            "player_id": 49445,
            "team_id": 10102,
            "name": "道森",
            "shirt_number": 1,
            "status": 0,
            "status_name": "替补",
            "starter": false,
            "captain": false,
            "best_player": false,
            "rating": 0,
            "age": 31,
            "height": 193,
            "market_value": 300000,
            "market_value_text": "30万欧",
            "position": "守门员",
            "position_name": "守门员",
            "position_code": "G",
            "incidents": []
          },
          {
            "player_id": 1496664,
            "team_id": 10102,
            "name": "卡特怀特",
            "shirt_number": 20,
            "status": 0,
            "status_name": "替补",
            "starter": false,
            "captain": false,
            "best_player": false,
            "rating": 0,
            "age": 21,
            "height": 175,
            "market_value": 150000,
            "market_value_text": "15万欧",
            "position": "中场",
            "position_name": "中场",
            "position_code": "M",
            "incidents": []
          },
          {
            "player_id": 1406128,
            "team_id": 10102,
            "name": "韦尔奇",
            "shirt_number": 2,
            "status": 0,
            "status_name": "替补",
            "starter": false,
            "captain": false,
            "best_player": false,
            "rating": 0,
            "age": 22,
            "height": 197,
            "market_value": 250000,
            "market_value_text": "25万欧",
            "position": "后卫",
            "position_name": "后卫",
            "position_code": "D",
            "incidents": []
          }
        ],
        "home_injuries": [
          {
            "player_id": 1182435,
            "team_id": 10101,
            "name": "伯纳德",
            "shirt_number": 5,
            "status": 2,
            "status_name": "伤停",
            "starter": false,
            "captain": false,
            "best_player": false,
            "rating": null,
            "age": 25,
            "height": 188,
            "market_value": 1000000,
            "market_value_text": "100万欧",
            "position": "后卫",
            "position_name": "后卫",
            "position_code": "D",
            "incidents": []
          },
          {
            "player_id": 1371192,
            "team_id": 10101,
            "name": "奥尼安戈",
            "shirt_number": 21,
            "status": 2,
            "status_name": "伤停",
            "starter": false,
            "captain": false,
            "best_player": false,
            "rating": null,
            "age": 23,
            "height": 190,
            "market_value": 350000,
            "market_value_text": "35万欧",
            "position": "中场",
            "position_name": "中场",
            "position_code": "M",
            "incidents": []
          },
          {
            "player_id": 1739644,
            "team_id": 10101,
            "name": "西凯拉",
            "shirt_number": 23,
            "status": 2,
            "status_name": "伤停",
            "starter": false,
            "captain": false,
            "best_player": false,
            "rating": null,
            "age": 21,
            "height": 180,
            "market_value": 0,
            "market_value_text": "-",
            "position": "后卫",
            "position_name": "后卫",
            "position_code": "D",
            "incidents": []
          },
          {
            "player_id": 1940074,
            "team_id": 0,
            "name": "麦基",
            "shirt_number": 0,
            "status": 2,
            "status_name": "伤停",
            "starter": false,
            "captain": false,
            "best_player": false,
            "rating": null,
            "age": 20,
            "height": 0,
            "market_value": 0,
            "market_value_text": "-",
            "position": "后卫",
            "position_name": "后卫",
            "position_code": "D",
            "incidents": []
          }
        ],
        "away_injuries": [
          {
            "player_id": 100786,
            "team_id": 10102,
            "name": "亨弗里斯",
            "shirt_number": 11,
            "status": 2,
            "status_name": "伤停",
            "starter": false,
            "captain": false,
            "best_player": false,
            "rating": null,
            "age": 28,
            "height": 185,
            "market_value": 550000,
            "market_value_text": "55万欧",
            "position": "前锋",
            "position_name": "前锋",
            "position_code": "F",
            "incidents": []
          }
        ],
        "home_market_value": "1230万欧",
        "away_market_value": "402.5万欧",
        "home_average_age": "27.5岁",
        "away_average_age": "28.9岁"
      },
      "tactical_context": {
        "head_to_head_count": 6,
        "home_recent_matches_count": 40,
        "away_recent_matches_count": 40,
        "h2h_raw": [
          {
            "match_id": 3775098,
            "season_id": null,
            "competition_id": 100,
            "status_id": 8,
            "match_time": 1661884200,
            "neutral": null,
            "home_team_id": 10102,
            "away_team_id": 10101,
            "home_scores": [
              3,
              1,
              0,
              0,
              3,
              0,
              0
            ],
            "away_scores": [
              1,
              1,
              0,
              0,
              10,
              0,
              0
            ],
            "opening_odds": [
              "0.82,-0.25,1.02,0",
              "2.88,3.3,2.25,0",
              "0.97,2.5,0.88,0",
              ""
            ],
            "current_odds": [
              "0.95,-0.25,0.9,0",
              "3.0,3.4,2.15,0",
              "0.9,2.5,0.95,0",
              ""
            ],
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
          },
          {
            "match_id": 154270,
            "season_id": null,
            "competition_id": 100,
            "status_id": 8,
            "match_time": 1314729900,
            "neutral": null,
            "home_team_id": 10102,
            "away_team_id": 10101,
            "home_scores": [
              0,
              0,
              0,
              0,
              0,
              0,
              3
            ],
            "away_scores": [
              0,
              0,
              0,
              0,
              0,
              0,
              1
            ],
            "opening_odds": [
              "",
              "3.1,3.5,2.2,0",
              "",
              ""
            ],
            "current_odds": [
              "",
              "3.1,3.5,2.2,0",
              "",
              ""
            ],
            "home_stats": {},
            "away_stats": {}
          },
          {
            "match_id": 108389,
            "season_id": null,
            "competition_id": 84,
            "status_id": 8,
            "match_time": 1108220400,
            "neutral": null,
            "home_team_id": 10101,
            "away_team_id": 10102,
            "home_scores": [
              1,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "away_scores": [
              2,
              1,
              0,
              0,
              0,
              0,
              0
            ],
            "opening_odds": [
              "",
              "1.72,3.4,4.33,0",
              "",
              ""
            ],
            "current_odds": [
              "",
              "1.72,3.4,4.33,0",
              "",
              ""
            ],
            "home_stats": {},
            "away_stats": {}
          },
          {
            "match_id": 108554,
            "season_id": null,
            "competition_id": 84,
            "status_id": 8,
            "match_time": 1098540000,
            "neutral": null,
            "home_team_id": 10102,
            "away_team_id": 10101,
            "home_scores": [
              3,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "away_scores": [
              1,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "opening_odds": [
              "",
              "",
              "",
              ""
            ],
            "current_odds": [
              "",
              "",
              "",
              ""
            ],
            "home_stats": {},
            "away_stats": {}
          },
          {
            "match_id": 2492834,
            "season_id": null,
            "competition_id": 82,
            "status_id": 8,
            "match_time": 948038340,
            "neutral": null,
            "home_team_id": 10101,
            "away_team_id": 10102,
            "home_scores": [
              2,
              0,
              0,
              0,
              -1,
              0,
              0
            ],
            "away_scores": [
              0,
              0,
              0,
              0,
              -1,
              0,
              0
            ],
            "opening_odds": [
              "",
              "",
              "",
              ""
            ],
            "current_odds": [
              "",
              "",
              "",
              ""
            ],
            "home_stats": {},
            "away_stats": {}
          },
          {
            "match_id": 2492640,
            "season_id": null,
            "competition_id": 82,
            "status_id": 8,
            "match_time": 934646340,
            "neutral": null,
            "home_team_id": 10102,
            "away_team_id": 10101,
            "home_scores": [
              1,
              0,
              0,
              0,
              -1,
              0,
              0
            ],
            "away_scores": [
              1,
              1,
              0,
              0,
              -1,
              0,
              0
            ],
            "opening_odds": [
              "",
              "",
              "",
              ""
            ],
            "current_odds": [
              "",
              "",
              "",
              ""
            ],
            "home_stats": {},
            "away_stats": {}
          }
        ],
        "home_recent_matches": [
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
            "halftime_score": {
              "home": 1,
              "away": 1
            },
            "fulltime_score": {
              "home": 1,
              "away": 2
            },
            "result": "赢",
            "goals": 3,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4567206,
            "league_id": 99,
            "league_name": "英联杯",
            "match_time": 1786197600,
            "match_date": "2026-08-08T14:00:00.000Z",
            "home_team_id": 10101,
            "home_team_name": "谢周三",
            "away_team_id": 10007,
            "away_team_name": "博尔顿",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 1,
              "away": 0
            },
            "result": "赢",
            "goals": 1,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4602669,
            "league_id": 24,
            "league_name": "球会友谊",
            "match_time": 1785596400,
            "match_date": "2026-08-01T15:00:00.000Z",
            "home_team_id": 10497,
            "home_team_name": "奥尔德姆",
            "away_team_id": 10101,
            "away_team_name": "谢周三",
            "halftime_score": {
              "home": 2,
              "away": 0
            },
            "fulltime_score": {
              "home": 4,
              "away": 0
            },
            "result": "输",
            "goals": 4,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4601517,
            "league_id": 24,
            "league_name": "球会友谊",
            "match_time": 1785583800,
            "match_date": "2026-08-01T11:30:00.000Z",
            "home_team_id": 10861,
            "home_team_name": "阿克灵顿",
            "away_team_id": 10101,
            "away_team_name": "谢周三",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 0,
              "away": 0
            },
            "result": "和",
            "goals": 0,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4590147,
            "league_id": 24,
            "league_name": "球会友谊",
            "match_time": 1784376000,
            "match_date": "2026-07-18T12:00:00.000Z",
            "home_team_id": 10101,
            "home_team_name": "谢周三",
            "away_team_id": 10174,
            "away_team_name": "普雷斯顿",
            "halftime_score": {
              "home": 2,
              "away": 0
            },
            "fulltime_score": {
              "home": 3,
              "away": 2
            },
            "result": "赢",
            "goals": 5,
            "handicap_trend": {
              "result": "-",
              "class": "-"
            },
            "goals_trend": {
              "result": "-",
              "class": "-"
            }
          },
          {
            "match_id": 4585438,
            "league_id": 24,
            "league_name": "球会友谊",
            "match_time": 1784053800,
            "match_date": "2026-07-14T18:30:00.000Z",
            "home_team_id": 11273,
            "home_team_name": "哈尔勒姆",
            "away_team_id": 10101,
            "away_team_name": "谢周三",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 0,
              "away": 0
            },
            "result": "和",
            "goals": 0,
            "handicap_trend": {
              "result": "-",
              "class": "-"
            },
            "goals_trend": {
              "result": "-",
              "class": "-"
            }
          },
          {
            "match_id": 4579905,
            "league_id": 24,
            "league_name": "球会友谊",
            "match_time": 1783767600,
            "match_date": "2026-07-11T11:00:00.000Z",
            "home_team_id": 10101,
            "home_team_name": "谢周三",
            "away_team_id": 10005,
            "away_team_name": "阿森纳",
            "halftime_score": {
              "home": 0,
              "away": 2
            },
            "fulltime_score": {
              "home": 0,
              "away": 3
            },
            "result": "输",
            "goals": 3,
            "handicap_trend": {
              "result": "-",
              "class": "-"
            },
            "goals_trend": {
              "result": "-",
              "class": "-"
            }
          },
          {
            "match_id": 4351811,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1777721400,
            "match_date": "2026-05-02T11:30:00.000Z",
            "home_team_id": 10101,
            "home_team_name": "谢周三",
            "away_team_id": 10005,
            "away_team_name": "阿森纳",
            "halftime_score": {
              "home": 2,
              "away": 0
            },
            "fulltime_score": {
              "home": 2,
              "away": 1
            },
            "result": "赢",
            "goals": 3,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4351779,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1777125600,
            "match_date": "2026-04-25T14:00:00.000Z",
            "home_team_id": 10571,
            "home_team_name": "牛津联",
            "away_team_id": 10101,
            "away_team_name": "谢周三",
            "halftime_score": {
              "home": 2,
              "away": 0
            },
            "fulltime_score": {
              "home": 4,
              "away": 1
            },
            "result": "输",
            "goals": 5,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4351748,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1776883500,
            "match_date": "2026-04-22T18:45:00.000Z",
            "home_team_id": 10004,
            "home_team_name": "托特纳姆热刺",
            "away_team_id": 10101,
            "away_team_name": "谢周三",
            "halftime_score": {
              "home": 1,
              "away": 0
            },
            "fulltime_score": {
              "home": 1,
              "away": 0
            },
            "result": "输",
            "goals": 1,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4351738,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1776520800,
            "match_date": "2026-04-18T14:00:00.000Z",
            "home_team_id": 10101,
            "home_team_name": "谢周三",
            "away_team_id": 10179,
            "away_team_name": "查尔顿",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 1,
              "away": 1
            },
            "result": "和",
            "goals": 2,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4351699,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1775907000,
            "match_date": "2026-04-11T11:30:00.000Z",
            "home_team_id": 10245,
            "home_team_name": "考文垂",
            "away_team_id": 10101,
            "away_team_name": "谢周三",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 0,
              "away": 0
            },
            "result": "和",
            "goals": 0,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4351689,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1775484000,
            "match_date": "2026-04-06T14:00:00.000Z",
            "home_team_id": 10101,
            "home_team_name": "谢周三",
            "away_team_id": 10247,
            "away_team_name": "莱斯特城",
            "halftime_score": {
              "home": 1,
              "away": 0
            },
            "fulltime_score": {
              "home": 1,
              "away": 1
            },
            "result": "和",
            "goals": 2,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4351666,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1775224800,
            "match_date": "2026-04-03T14:00:00.000Z",
            "home_team_id": 10246,
            "home_team_name": "斯托克城",
            "away_team_id": 10101,
            "away_team_name": "谢周三",
            "halftime_score": {
              "home": 1,
              "away": 0
            },
            "fulltime_score": {
              "home": 2,
              "away": 0
            },
            "result": "输",
            "goals": 2,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4351632,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1774105200,
            "match_date": "2026-03-21T15:00:00.000Z",
            "home_team_id": 10538,
            "home_team_name": "赫尔城",
            "away_team_id": 10101,
            "away_team_name": "谢周三",
            "halftime_score": {
              "home": 2,
              "away": 1
            },
            "fulltime_score": {
              "home": 3,
              "away": 1
            },
            "result": "输",
            "goals": 4,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4351615,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1773500400,
            "match_date": "2026-03-14T15:00:00.000Z",
            "home_team_id": 10101,
            "home_team_name": "谢周三",
            "away_team_id": 10257,
            "away_team_name": "伊普斯维奇",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 0,
              "away": 2
            },
            "result": "输",
            "goals": 2,
            "handicap_trend": {
              "result": "和",
              "class": "draw"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4351582,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1773171900,
            "match_date": "2026-03-10T19:45:00.000Z",
            "home_team_id": 10101,
            "home_team_name": "谢周三",
            "away_team_id": 10022,
            "away_team_name": "沃特福德",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 1,
              "away": 1
            },
            "result": "和",
            "goals": 2,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4351555,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1772895600,
            "match_date": "2026-03-07T15:00:00.000Z",
            "home_team_id": 10011,
            "home_team_name": "德比郡",
            "away_team_id": 10101,
            "away_team_name": "谢周三",
            "halftime_score": {
              "home": 2,
              "away": 1
            },
            "fulltime_score": {
              "home": 2,
              "away": 1
            },
            "result": "输",
            "goals": 3,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "走",
              "class": "draw"
            }
          },
          {
            "match_id": 4351543,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1772290800,
            "match_date": "2026-02-28T15:00:00.000Z",
            "home_team_id": 10101,
            "home_team_name": "谢周三",
            "away_team_id": 10182,
            "away_team_name": "南安普顿",
            "halftime_score": {
              "home": 0,
              "away": 2
            },
            "fulltime_score": {
              "home": 1,
              "away": 3
            },
            "result": "输",
            "goals": 4,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4351520,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1772048700,
            "match_date": "2026-02-25T19:45:00.000Z",
            "home_team_id": 10184,
            "home_team_name": "诺维奇",
            "away_team_id": 10101,
            "away_team_name": "谢周三",
            "halftime_score": {
              "home": 2,
              "away": 0
            },
            "fulltime_score": {
              "home": 2,
              "away": 0
            },
            "result": "输",
            "goals": 2,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4351484,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1771761600,
            "match_date": "2026-02-22T12:00:00.000Z",
            "home_team_id": 10021,
            "home_team_name": "谢菲尔德联",
            "away_team_id": 10101,
            "away_team_name": "谢周三",
            "halftime_score": {
              "home": 2,
              "away": 0
            },
            "fulltime_score": {
              "home": 2,
              "away": 1
            },
            "result": "输",
            "goals": 3,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4351467,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1771081200,
            "match_date": "2026-02-14T15:00:00.000Z",
            "home_team_id": 10101,
            "home_team_name": "谢周三",
            "away_team_id": 10681,
            "away_team_name": "米尔沃尔",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 1,
              "away": 2
            },
            "result": "输",
            "goals": 3,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4351445,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1770552000,
            "match_date": "2026-02-08T12:00:00.000Z",
            "home_team_id": 11844,
            "home_team_name": "斯旺西",
            "away_team_id": 10101,
            "away_team_name": "谢周三",
            "halftime_score": {
              "home": 1,
              "away": 0
            },
            "fulltime_score": {
              "home": 4,
              "away": 0
            },
            "result": "输",
            "goals": 4,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4351257,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1770147900,
            "match_date": "2026-02-03T19:45:00.000Z",
            "home_team_id": 10006,
            "home_team_name": "曼城",
            "away_team_id": 10101,
            "away_team_name": "谢周三",
            "halftime_score": {
              "home": 1,
              "away": 0
            },
            "fulltime_score": {
              "home": 1,
              "away": 0
            },
            "result": "输",
            "goals": 1,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4351421,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1769862600,
            "match_date": "2026-01-31T12:30:00.000Z",
            "home_team_id": 10101,
            "home_team_name": "谢周三",
            "away_team_id": 10498,
            "away_team_name": "雷克瑟姆",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 0,
              "away": 1
            },
            "result": "输",
            "goals": 1,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4351401,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1769266800,
            "match_date": "2026-01-24T15:00:00.000Z",
            "home_team_id": 10130,
            "home_team_name": "布里斯托尔城",
            "away_team_id": 10101,
            "away_team_name": "谢周三",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 2,
              "away": 0
            },
            "result": "输",
            "goals": 2,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4351391,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1768938300,
            "match_date": "2026-01-20T19:45:00.000Z",
            "home_team_id": 10101,
            "home_team_name": "谢周三",
            "away_team_id": 10008,
            "away_team_name": "伯明翰",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 0,
              "away": 2
            },
            "result": "输",
            "goals": 2,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4351378,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1768662000,
            "match_date": "2026-01-17T15:00:00.000Z",
            "home_team_id": 10101,
            "home_team_name": "谢周三",
            "away_team_id": 10185,
            "away_team_name": "朴茨茅斯",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 0,
              "away": 1
            },
            "result": "输",
            "goals": 1,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4462138,
            "league_id": 98,
            "league_name": "足总杯",
            "match_time": 1768057200,
            "match_date": "2026-01-10T15:00:00.000Z",
            "home_team_id": 10101,
            "home_team_name": "谢周三",
            "away_team_id": 10118,
            "away_team_name": "布伦特福德",
            "halftime_score": {
              "home": 0,
              "away": 1
            },
            "fulltime_score": {
              "home": 0,
              "away": 2
            },
            "result": "输",
            "goals": 2,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4351368,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1767528000,
            "match_date": "2026-01-04T12:00:00.000Z",
            "home_team_id": 10290,
            "home_team_name": "女王公园巡游者",
            "away_team_id": 10101,
            "away_team_name": "谢周三",
            "halftime_score": {
              "home": 1,
              "away": 0
            },
            "fulltime_score": {
              "home": 3,
              "away": 0
            },
            "result": "输",
            "goals": 3,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4351350,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1767279600,
            "match_date": "2026-01-01T15:00:00.000Z",
            "home_team_id": 10174,
            "home_team_name": "普雷斯顿",
            "away_team_id": 10101,
            "away_team_name": "谢周三",
            "halftime_score": {
              "home": 1,
              "away": 0
            },
            "fulltime_score": {
              "home": 3,
              "away": 0
            },
            "result": "输",
            "goals": 3,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4351339,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1767037500,
            "match_date": "2025-12-29T19:45:00.000Z",
            "home_team_id": 10101,
            "home_team_name": "谢周三",
            "away_team_id": 10006,
            "away_team_name": "曼城",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 0,
              "away": 0
            },
            "result": "和",
            "goals": 0,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4351325,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1766761200,
            "match_date": "2025-12-26T15:00:00.000Z",
            "home_team_id": 10101,
            "home_team_name": "谢周三",
            "away_team_id": 10538,
            "away_team_name": "赫尔城",
            "halftime_score": {
              "home": 1,
              "away": 1
            },
            "fulltime_score": {
              "home": 2,
              "away": 2
            },
            "result": "和",
            "goals": 4,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4351308,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1766242800,
            "match_date": "2025-12-20T15:00:00.000Z",
            "home_team_id": 10257,
            "home_team_name": "伊普斯维奇",
            "away_team_id": 10101,
            "away_team_name": "谢周三",
            "halftime_score": {
              "home": 1,
              "away": 0
            },
            "fulltime_score": {
              "home": 3,
              "away": 1
            },
            "result": "输",
            "goals": 4,
            "handicap_trend": {
              "result": "和",
              "class": "draw"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4351297,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1765828800,
            "match_date": "2025-12-15T20:00:00.000Z",
            "home_team_id": 10101,
            "home_team_name": "谢周三",
            "away_team_id": 10011,
            "away_team_name": "德比郡",
            "halftime_score": {
              "home": 0,
              "away": 1
            },
            "fulltime_score": {
              "home": 0,
              "away": 3
            },
            "result": "输",
            "goals": 3,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4351279,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1765309500,
            "match_date": "2025-12-09T19:45:00.000Z",
            "home_team_id": 10022,
            "home_team_name": "沃特福德",
            "away_team_id": 10101,
            "away_team_name": "谢周三",
            "halftime_score": {
              "home": 0,
              "away": 1
            },
            "fulltime_score": {
              "home": 1,
              "away": 1
            },
            "result": "和",
            "goals": 2,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4351252,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1764428400,
            "match_date": "2025-11-29T15:00:00.000Z",
            "home_team_id": 10101,
            "home_team_name": "谢周三",
            "away_team_id": 10174,
            "away_team_name": "普雷斯顿",
            "halftime_score": {
              "home": 2,
              "away": 1
            },
            "fulltime_score": {
              "home": 2,
              "away": 3
            },
            "result": "输",
            "goals": 5,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4351232,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1764186300,
            "match_date": "2025-11-26T19:45:00.000Z",
            "home_team_id": 10681,
            "home_team_name": "米尔沃尔",
            "away_team_id": 10101,
            "away_team_name": "谢周三",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 1,
              "away": 0
            },
            "result": "输",
            "goals": 1,
            "handicap_trend": {
              "result": "和",
              "class": "draw"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4351226,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1763899200,
            "match_date": "2025-11-23T12:00:00.000Z",
            "home_team_id": 10101,
            "home_team_name": "谢周三",
            "away_team_id": 10021,
            "away_team_name": "谢菲尔德联",
            "halftime_score": {
              "home": 0,
              "away": 1
            },
            "fulltime_score": {
              "home": 0,
              "away": 3
            },
            "result": "输",
            "goals": 3,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4351208,
            "league_id": 83,
            "league_name": "英冠",
            "match_time": 1762614000,
            "match_date": "2025-11-08T15:00:00.000Z",
            "home_team_id": 10182,
            "home_team_name": "南安普顿",
            "away_team_id": 10101,
            "away_team_name": "谢周三",
            "halftime_score": {
              "home": 2,
              "away": 1
            },
            "fulltime_score": {
              "home": 3,
              "away": 1
            },
            "result": "输",
            "goals": 4,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          }
        ],
        "away_recent_matches": [
          {
            "match_id": 4562381,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1786802400,
            "match_date": "2026-08-15T14:00:00.000Z",
            "home_team_id": 10102,
            "home_team_name": "布拉德福德",
            "away_team_id": 10127,
            "away_team_name": "彼得堡联",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 2,
              "away": 0
            },
            "result": "赢",
            "goals": 2,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4607400,
            "league_id": 99,
            "league_name": "英联杯",
            "match_time": 1786197600,
            "match_date": "2026-08-08T14:00:00.000Z",
            "home_team_id": 10102,
            "home_team_name": "布拉德福德",
            "away_team_id": 11528,
            "away_team_name": "罗奇代尔",
            "halftime_score": {
              "home": 1,
              "away": 0
            },
            "fulltime_score": {
              "home": 2,
              "away": 0
            },
            "result": "赢",
            "goals": 2,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4601585,
            "league_id": 24,
            "league_name": "球会友谊",
            "match_time": 1785592800,
            "match_date": "2026-08-01T14:00:00.000Z",
            "home_team_id": 24781,
            "home_team_name": "索尔福德市",
            "away_team_id": 10102,
            "away_team_name": "布拉德福德",
            "halftime_score": {
              "home": 1,
              "away": 1
            },
            "fulltime_score": {
              "home": 2,
              "away": 2
            },
            "result": "和",
            "goals": 4,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4596103,
            "league_id": 24,
            "league_name": "球会友谊",
            "match_time": 1785349800,
            "match_date": "2026-07-29T18:30:00.000Z",
            "home_team_id": 10102,
            "home_team_name": "布拉德福德",
            "away_team_id": 10174,
            "away_team_name": "普雷斯顿",
            "halftime_score": {
              "home": 1,
              "away": 0
            },
            "fulltime_score": {
              "home": 3,
              "away": 2
            },
            "result": "赢",
            "goals": 5,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4592389,
            "league_id": 24,
            "league_name": "球会友谊",
            "match_time": 1784907300,
            "match_date": "2026-07-24T15:35:00.000Z",
            "home_team_id": 40540,
            "home_team_name": "格蒙登",
            "away_team_id": 10102,
            "away_team_name": "布拉德福德",
            "halftime_score": {
              "home": 0,
              "away": 1
            },
            "fulltime_score": {
              "home": 0,
              "away": 4
            },
            "result": "赢",
            "goals": 4,
            "handicap_trend": {
              "result": "-",
              "class": "-"
            },
            "goals_trend": {
              "result": "-",
              "class": "-"
            }
          },
          {
            "match_id": 4586098,
            "league_id": 24,
            "league_name": "球会友谊",
            "match_time": 1784313000,
            "match_date": "2026-07-17T18:30:00.000Z",
            "home_team_id": 10861,
            "home_team_name": "阿克灵顿",
            "away_team_id": 10102,
            "away_team_name": "布拉德福德",
            "halftime_score": {
              "home": 1,
              "away": 0
            },
            "fulltime_score": {
              "home": 1,
              "away": 0
            },
            "result": "输",
            "goals": 1,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4579486,
            "league_id": 24,
            "league_name": "球会友谊",
            "match_time": 1783769400,
            "match_date": "2026-07-11T11:30:00.000Z",
            "home_team_id": 10733,
            "home_team_name": "夏利法斯",
            "away_team_id": 10102,
            "away_team_name": "布拉德福德",
            "halftime_score": {
              "home": 1,
              "away": 4
            },
            "fulltime_score": {
              "home": 1,
              "away": 6
            },
            "result": "赢",
            "goals": 7,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4565979,
            "league_id": 24,
            "league_name": "球会友谊",
            "match_time": 1783173600,
            "match_date": "2026-07-04T14:00:00.000Z",
            "home_team_id": 21747,
            "home_team_name": "联合曼彻斯特",
            "away_team_id": 10102,
            "away_team_name": "布拉德福德",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 1,
              "away": 2
            },
            "result": "赢",
            "goals": 3,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4538617,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1778785200,
            "match_date": "2026-05-14T19:00:00.000Z",
            "home_team_id": 10102,
            "home_team_name": "布拉德福德",
            "away_team_id": 10007,
            "away_team_name": "博尔顿",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 0,
              "away": 1
            },
            "result": "输",
            "goals": 1,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4538596,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1778353200,
            "match_date": "2026-05-09T19:00:00.000Z",
            "home_team_id": 10007,
            "home_team_name": "博尔顿",
            "away_team_id": 10102,
            "away_team_name": "布拉德福德",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 1,
              "away": 0
            },
            "result": "输",
            "goals": 1,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4351331,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1777730400,
            "match_date": "2026-05-02T14:00:00.000Z",
            "home_team_id": 11352,
            "home_team_name": "埃克塞特城",
            "away_team_id": 10102,
            "away_team_name": "布拉德福德",
            "halftime_score": {
              "home": 0,
              "away": 1
            },
            "fulltime_score": {
              "home": 1,
              "away": 2
            },
            "result": "赢",
            "goals": 3,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4351254,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1777125600,
            "match_date": "2026-04-25T14:00:00.000Z",
            "home_team_id": 10102,
            "home_team_name": "布拉德福德",
            "away_team_id": 10007,
            "away_team_name": "博尔顿",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 1,
              "away": 1
            },
            "result": "和",
            "goals": 2,
            "handicap_trend": {
              "result": "和",
              "class": "draw"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4350574,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1776797100,
            "match_date": "2026-04-21T18:45:00.000Z",
            "home_team_id": 10102,
            "home_team_name": "布拉德福德",
            "away_team_id": 10256,
            "away_team_name": "普利茅斯",
            "halftime_score": {
              "home": 0,
              "away": 1
            },
            "fulltime_score": {
              "home": 1,
              "away": 1
            },
            "result": "和",
            "goals": 2,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4351143,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1776511800,
            "match_date": "2026-04-18T11:30:00.000Z",
            "home_team_id": 10129,
            "home_team_name": "巴恩斯利",
            "away_team_id": 10102,
            "away_team_name": "布拉德福德",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 2,
              "away": 2
            },
            "result": "和",
            "goals": 4,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4350986,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1775916000,
            "match_date": "2026-04-11T14:00:00.000Z",
            "home_team_id": 10102,
            "home_team_name": "布拉德福德",
            "away_team_id": 10862,
            "away_team_name": "斯蒂夫尼奇",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 0,
              "away": 1
            },
            "result": "输",
            "goals": 1,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4350949,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1775484000,
            "match_date": "2026-04-06T14:00:00.000Z",
            "home_team_id": 11115,
            "home_team_name": "韦康比流浪者",
            "away_team_id": 10102,
            "away_team_name": "布拉德福德",
            "halftime_score": {
              "home": 1,
              "away": 0
            },
            "fulltime_score": {
              "home": 1,
              "away": 2
            },
            "result": "赢",
            "goals": 3,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4350715,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1775224800,
            "match_date": "2026-04-03T14:00:00.000Z",
            "home_team_id": 10102,
            "home_team_name": "布拉德福德",
            "away_team_id": 11428,
            "away_team_name": "北安普顿",
            "halftime_score": {
              "home": 1,
              "away": 0
            },
            "fulltime_score": {
              "home": 1,
              "away": 0
            },
            "result": "赢",
            "goals": 1,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4350419,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1774105200,
            "match_date": "2026-03-21T15:00:00.000Z",
            "home_team_id": 11412,
            "home_team_name": "伯顿",
            "away_team_id": 10102,
            "away_team_name": "布拉德福德",
            "halftime_score": {
              "home": 1,
              "away": 0
            },
            "fulltime_score": {
              "home": 2,
              "away": 1
            },
            "result": "输",
            "goals": 3,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4350322,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1773776700,
            "match_date": "2026-03-17T19:45:00.000Z",
            "home_team_id": 10102,
            "home_team_name": "布拉德福德",
            "away_team_id": 10570,
            "away_team_name": "曼斯菲尔德",
            "halftime_score": {
              "home": 0,
              "away": 1
            },
            "fulltime_score": {
              "home": 1,
              "away": 1
            },
            "result": "和",
            "goals": 2,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4350272,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1773500400,
            "match_date": "2026-03-14T15:00:00.000Z",
            "home_team_id": 10248,
            "home_team_name": "维冈竞技",
            "away_team_id": 10102,
            "away_team_name": "布拉德福德",
            "halftime_score": {
              "home": 1,
              "away": 0
            },
            "fulltime_score": {
              "home": 2,
              "away": 0
            },
            "result": "输",
            "goals": 2,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "走",
              "class": "draw"
            }
          },
          {
            "match_id": 4349311,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1773258300,
            "match_date": "2026-03-11T19:45:00.000Z",
            "home_team_id": 11501,
            "home_team_name": "维尔港",
            "away_team_id": 10102,
            "away_team_name": "布拉德福德",
            "halftime_score": {
              "home": 0,
              "away": 1
            },
            "fulltime_score": {
              "home": 0,
              "away": 2
            },
            "result": "赢",
            "goals": 2,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4350147,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1772895600,
            "match_date": "2026-03-07T15:00:00.000Z",
            "home_team_id": 10102,
            "home_team_name": "布拉德福德",
            "away_team_id": 12503,
            "away_team_name": "莱顿东方",
            "halftime_score": {
              "home": 1,
              "away": 1
            },
            "fulltime_score": {
              "home": 2,
              "away": 1
            },
            "result": "赢",
            "goals": 3,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4350073,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1772290800,
            "match_date": "2026-02-28T15:00:00.000Z",
            "home_team_id": 10177,
            "home_team_name": "雷丁",
            "away_team_id": 10102,
            "away_team_name": "布拉德福德",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 2,
              "away": 1
            },
            "result": "输",
            "goals": 3,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4349391,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1771962300,
            "match_date": "2026-02-24T19:45:00.000Z",
            "home_team_id": 10102,
            "home_team_name": "布拉德福德",
            "away_team_id": 10173,
            "away_team_name": "罗瑟汉姆",
            "halftime_score": {
              "home": 1,
              "away": 0
            },
            "fulltime_score": {
              "home": 1,
              "away": 0
            },
            "result": "赢",
            "goals": 1,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4349996,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1771687800,
            "match_date": "2026-02-21T15:30:00.000Z",
            "home_team_id": 11843,
            "home_team_name": "AFC温布尔登",
            "away_team_id": 10102,
            "away_team_name": "布拉德福德",
            "halftime_score": {
              "home": 2,
              "away": 0
            },
            "fulltime_score": {
              "home": 3,
              "away": 1
            },
            "result": "输",
            "goals": 4,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4349986,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1771357500,
            "match_date": "2026-02-17T19:45:00.000Z",
            "home_team_id": 10102,
            "home_team_name": "布拉德福德",
            "away_team_id": 10817,
            "away_team_name": "斯托克港",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 1,
              "away": 0
            },
            "result": "赢",
            "goals": 1,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4349936,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1771081200,
            "match_date": "2026-02-14T15:00:00.000Z",
            "home_team_id": 10102,
            "home_team_name": "布拉德福德",
            "away_team_id": 10127,
            "away_team_name": "彼得堡联",
            "halftime_score": {
              "home": 1,
              "away": 0
            },
            "fulltime_score": {
              "home": 2,
              "away": 0
            },
            "result": "赢",
            "goals": 2,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4349859,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1770467400,
            "match_date": "2026-02-07T12:30:00.000Z",
            "home_team_id": 11840,
            "home_team_name": "卢顿",
            "away_team_id": 10102,
            "away_team_name": "布拉德福德",
            "halftime_score": {
              "home": 1,
              "away": 0
            },
            "fulltime_score": {
              "home": 2,
              "away": 1
            },
            "result": "输",
            "goals": 3,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4349732,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1769862600,
            "match_date": "2026-01-31T12:30:00.000Z",
            "home_team_id": 10102,
            "home_team_name": "布拉德福德",
            "away_team_id": 10533,
            "away_team_name": "唐卡斯特",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 1,
              "away": 0
            },
            "result": "赢",
            "goals": 1,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4349631,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1769543100,
            "match_date": "2026-01-27T19:45:00.000Z",
            "home_team_id": 12913,
            "home_team_name": "林肯城",
            "away_team_id": 10102,
            "away_team_name": "布拉德福德",
            "halftime_score": {
              "home": 2,
              "away": 0
            },
            "fulltime_score": {
              "home": 3,
              "away": 0
            },
            "result": "输",
            "goals": 3,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4349461,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1769257800,
            "match_date": "2026-01-24T12:30:00.000Z",
            "home_team_id": 10114,
            "home_team_name": "哈德斯菲尔德",
            "away_team_id": 10102,
            "away_team_name": "布拉德福德",
            "halftime_score": {
              "home": 1,
              "away": 0
            },
            "fulltime_score": {
              "home": 1,
              "away": 0
            },
            "result": "输",
            "goals": 1,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4349423,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1768653000,
            "match_date": "2026-01-17T12:30:00.000Z",
            "home_team_id": 10102,
            "home_team_name": "布拉德福德",
            "away_team_id": 10023,
            "away_team_name": "卡迪夫城",
            "halftime_score": {
              "home": 0,
              "away": 2
            },
            "fulltime_score": {
              "home": 1,
              "away": 2
            },
            "result": "输",
            "goals": 3,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4349377,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1767538800,
            "match_date": "2026-01-04T15:00:00.000Z",
            "home_team_id": 10128,
            "home_team_name": "布莱克浦",
            "away_team_id": 10102,
            "away_team_name": "布拉德福德",
            "halftime_score": {
              "home": 0,
              "away": 1
            },
            "fulltime_score": {
              "home": 1,
              "away": 2
            },
            "result": "赢",
            "goals": 3,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4349369,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1767279600,
            "match_date": "2026-01-01T15:00:00.000Z",
            "home_team_id": 10570,
            "home_team_name": "曼斯菲尔德",
            "away_team_id": 10102,
            "away_team_name": "布拉德福德",
            "halftime_score": {
              "home": 2,
              "away": 0
            },
            "fulltime_score": {
              "home": 3,
              "away": 0
            },
            "result": "输",
            "goals": 3,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4349357,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1767037500,
            "match_date": "2025-12-29T19:45:00.000Z",
            "home_team_id": 10102,
            "home_team_name": "布拉德福德",
            "away_team_id": 11501,
            "away_team_name": "维尔港",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 1,
              "away": 0
            },
            "result": "赢",
            "goals": 1,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4349345,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1766761200,
            "match_date": "2025-12-26T15:00:00.000Z",
            "home_team_id": 10102,
            "home_team_name": "布拉德福德",
            "away_team_id": 10248,
            "away_team_name": "维冈竞技",
            "halftime_score": {
              "home": 1,
              "away": 0
            },
            "fulltime_score": {
              "home": 2,
              "away": 1
            },
            "result": "赢",
            "goals": 3,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4349331,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1766242800,
            "match_date": "2025-12-20T15:00:00.000Z",
            "home_team_id": 12503,
            "home_team_name": "莱顿东方",
            "away_team_id": 10102,
            "away_team_name": "布拉德福德",
            "halftime_score": {
              "home": 1,
              "away": 1
            },
            "fulltime_score": {
              "home": 2,
              "away": 1
            },
            "result": "输",
            "goals": 3,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          },
          {
            "match_id": 4349321,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1765638000,
            "match_date": "2025-12-13T15:00:00.000Z",
            "home_team_id": 10102,
            "home_team_name": "布拉德福德",
            "away_team_id": 10177,
            "away_team_name": "雷丁",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 2,
              "away": 0
            },
            "result": "赢",
            "goals": 2,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4349276,
            "league_id": 84,
            "league_name": "英甲",
            "match_time": 1765024200,
            "match_date": "2025-12-06T12:30:00.000Z",
            "home_team_id": 10256,
            "home_team_name": "普利茅斯",
            "away_team_id": 10102,
            "away_team_name": "布拉德福德",
            "halftime_score": {
              "home": 0,
              "away": 0
            },
            "fulltime_score": {
              "home": 0,
              "away": 1
            },
            "result": "赢",
            "goals": 1,
            "handicap_trend": {
              "result": "赢",
              "class": "win"
            },
            "goals_trend": {
              "result": "小",
              "class": "small"
            }
          },
          {
            "match_id": 4458223,
            "league_id": 100,
            "league_name": "英锦赛",
            "match_time": 1764702000,
            "match_date": "2025-12-02T19:00:00.000Z",
            "home_team_id": 10007,
            "home_team_name": "博尔顿",
            "away_team_id": 10102,
            "away_team_name": "布拉德福德",
            "halftime_score": {
              "home": 2,
              "away": 0
            },
            "fulltime_score": {
              "home": 3,
              "away": 0
            },
            "result": "输",
            "goals": 3,
            "handicap_trend": {
              "result": "输",
              "class": "loss"
            },
            "goals_trend": {
              "result": "大",
              "class": "big"
            }
          }
        ]
      },
      "odds_matrix": {
        "company_name": "3*",
        "initial": {
          "asian_handicap": {
            "home_odds": 1,
            "line": 0.25,
            "away_odds": 0.85
          },
          "match_winner": {
            "home_odds": 2.2,
            "draw_odds": 3.3,
            "away_odds": 3
          },
          "total_goals": {
            "over_odds": 1,
            "line": 2.5,
            "under_odds": 0.85
          },
          "corners": {
            "over_odds": 0.72,
            "line": 9.5,
            "under_odds": 1
          }
        },
        "pregame": {
          "asian_handicap": {
            "home_odds": 0.7,
            "line": -0.25,
            "away_odds": 1.1
          },
          "match_winner": {
            "home_odds": 2.62,
            "draw_odds": 3.4,
            "away_odds": 2.45
          },
          "total_goals": {
            "over_odds": 1.1,
            "line": 2.75,
            "under_odds": 0.7
          },
          "corners": {
            "over_odds": 0.72,
            "line": 9.5,
            "under_odds": 1
          }
        },
        "live": {
          "asian_handicap": {
            "home_odds": 1.2,
            "line": 0.25,
            "away_odds": 0.7
          },
          "match_winner": {
            "home_odds": 9.5,
            "draw_odds": 3.75,
            "away_odds": 1.44
          },
          "total_goals": {
            "over_odds": 0.92,
            "line": 2,
            "under_odds": 0.92
          },
          "corners": {
            "over_odds": 0.61,
            "line": 16.5,
            "under_odds": 1.2
          }
        }
      },
      "league_standings": {
        "has_data": true,
        "home_team": {
          "team_id": 10101,
          "team_name": "谢周三",
          "competition_id": 84,
          "competition_name": "英甲",
          "season": "2026-2027",
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
            "position": 11,
            "matches_played": 0,
            "won": 0,
            "draw": 0,
            "loss": 0,
            "goals_scored": 0,
            "goals_conceded": 0,
            "goal_difference": 0,
            "points": 0,
            "win_rate": null
          },
          "away": {
            "title": "客",
            "position": 3,
            "matches_played": 1,
            "won": 1,
            "draw": 0,
            "loss": 0,
            "goals_scored": 2,
            "goals_conceded": 1,
            "goal_difference": 1,
            "points": 3,
            "win_rate": "100%"
          }
        },
        "away_team": {
          "team_id": 10102,
          "team_name": "布拉德福德",
          "competition_id": 84,
          "competition_name": "英甲",
          "season": "2026-2027",
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
          "home": {
            "title": "主",
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
          },
          "away": {
            "title": "客",
            "position": 10,
            "matches_played": 0,
            "won": 0,
            "draw": 0,
            "loss": 0,
            "goals_scored": 0,
            "goals_conceded": 0,
            "goal_difference": 0,
            "points": 0,
            "win_rate": null
          }
        }
      },
      "goal_distribution": {
        "has_data": true,
        "home_team": {
          "all": {
            "matches_count": 1,
            "scored_intervals": [
              {
                "start_minute": 1,
                "end_minute": 15,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 16,
                "end_minute": 30,
                "goals": 1,
                "percentage": 50
              },
              {
                "start_minute": 31,
                "end_minute": 45,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 46,
                "end_minute": 60,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 61,
                "end_minute": 75,
                "goals": 1,
                "percentage": 50
              },
              {
                "start_minute": 76,
                "end_minute": 90,
                "goals": 0,
                "percentage": 0
              }
            ],
            "first_scored_intervals": [
              {
                "start_minute": 1,
                "end_minute": 15,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 16,
                "end_minute": 30,
                "goals": 1,
                "percentage": 100
              },
              {
                "start_minute": 31,
                "end_minute": 45,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 46,
                "end_minute": 60,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 61,
                "end_minute": 75,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 76,
                "end_minute": 90,
                "goals": 0,
                "percentage": 0
              }
            ]
          },
          "home": {
            "matches_count": 0,
            "scored_intervals": [
              {
                "start_minute": 1,
                "end_minute": 15,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 16,
                "end_minute": 30,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 31,
                "end_minute": 45,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 46,
                "end_minute": 60,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 61,
                "end_minute": 75,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 76,
                "end_minute": 90,
                "goals": 0,
                "percentage": 0
              }
            ],
            "first_scored_intervals": [
              {
                "start_minute": 1,
                "end_minute": 15,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 16,
                "end_minute": 30,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 31,
                "end_minute": 45,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 46,
                "end_minute": 60,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 61,
                "end_minute": 75,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 76,
                "end_minute": 90,
                "goals": 0,
                "percentage": 0
              }
            ]
          },
          "away": {
            "matches_count": 1,
            "scored_intervals": [
              {
                "start_minute": 1,
                "end_minute": 15,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 16,
                "end_minute": 30,
                "goals": 1,
                "percentage": 50
              },
              {
                "start_minute": 31,
                "end_minute": 45,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 46,
                "end_minute": 60,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 61,
                "end_minute": 75,
                "goals": 1,
                "percentage": 50
              },
              {
                "start_minute": 76,
                "end_minute": 90,
                "goals": 0,
                "percentage": 0
              }
            ],
            "first_scored_intervals": [
              {
                "start_minute": 1,
                "end_minute": 15,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 16,
                "end_minute": 30,
                "goals": 1,
                "percentage": 100
              },
              {
                "start_minute": 31,
                "end_minute": 45,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 46,
                "end_minute": 60,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 61,
                "end_minute": 75,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 76,
                "end_minute": 90,
                "goals": 0,
                "percentage": 0
              }
            ]
          }
        },
        "away_team": {
          "all": {
            "matches_count": 1,
            "scored_intervals": [
              {
                "start_minute": 1,
                "end_minute": 15,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 16,
                "end_minute": 30,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 31,
                "end_minute": 45,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 46,
                "end_minute": 60,
                "goals": 1,
                "percentage": 50
              },
              {
                "start_minute": 61,
                "end_minute": 75,
                "goals": 1,
                "percentage": 50
              },
              {
                "start_minute": 76,
                "end_minute": 90,
                "goals": 0,
                "percentage": 0
              }
            ],
            "first_scored_intervals": [
              {
                "start_minute": 1,
                "end_minute": 15,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 16,
                "end_minute": 30,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 31,
                "end_minute": 45,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 46,
                "end_minute": 60,
                "goals": 1,
                "percentage": 100
              },
              {
                "start_minute": 61,
                "end_minute": 75,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 76,
                "end_minute": 90,
                "goals": 0,
                "percentage": 0
              }
            ]
          },
          "home": {
            "matches_count": 1,
            "scored_intervals": [
              {
                "start_minute": 1,
                "end_minute": 15,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 16,
                "end_minute": 30,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 31,
                "end_minute": 45,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 46,
                "end_minute": 60,
                "goals": 1,
                "percentage": 50
              },
              {
                "start_minute": 61,
                "end_minute": 75,
                "goals": 1,
                "percentage": 50
              },
              {
                "start_minute": 76,
                "end_minute": 90,
                "goals": 0,
                "percentage": 0
              }
            ],
            "first_scored_intervals": [
              {
                "start_minute": 1,
                "end_minute": 15,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 16,
                "end_minute": 30,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 31,
                "end_minute": 45,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 46,
                "end_minute": 60,
                "goals": 1,
                "percentage": 100
              },
              {
                "start_minute": 61,
                "end_minute": 75,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 76,
                "end_minute": 90,
                "goals": 0,
                "percentage": 0
              }
            ]
          },
          "away": {
            "matches_count": 0,
            "scored_intervals": [
              {
                "start_minute": 1,
                "end_minute": 15,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 16,
                "end_minute": 30,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 31,
                "end_minute": 45,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 46,
                "end_minute": 60,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 61,
                "end_minute": 75,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 76,
                "end_minute": 90,
                "goals": 0,
                "percentage": 0
              }
            ],
            "first_scored_intervals": [
              {
                "start_minute": 1,
                "end_minute": 15,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 16,
                "end_minute": 30,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 31,
                "end_minute": 45,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 46,
                "end_minute": 60,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 61,
                "end_minute": 75,
                "goals": 0,
                "percentage": 0
              },
              {
                "start_minute": 76,
                "end_minute": 90,
                "goals": 0,
                "percentage": 0
              }
            ]
          }
        }
      }
    }
  },
  "ai_evaluation_brief": {
    "match_id": "4562395",
    "league": "英格兰甲级联赛",
    "kickoff_time": "2026-08-21 03:00:00",
    "status_summary": "LIVE 62' (0-1)",
    "teams": {
      "home": "谢周三",
      "away": "布拉德福德城"
    },
    "score_verification": {
      "is_verified": true,
      "current_score": "0 - 1"
    },
    "core_markets": {
      "ah_main": {
        "handicap": "-0/0.5",
        "home_odds": 2.2,
        "away_odds": 1.71
      },
      "ou_main": {
        "handicap": "2",
        "over_odds": 1.91,
        "under_odds": 1.95
      },
      "euro_1x2": {
        "home_win": 8.7,
        "draw": 3.75,
        "away_win": 1.43
      },
      "ah_half": null,
      "ou_half": null
    },
    "condensed_features": {
      "possession": {
        "home": 60,
        "away": 40
      },
      "shots_on_target": {
        "home": 3,
        "away": 3
      },
      "dangerous_attacks": {
        "home": 38,
        "away": 30
      },
      "corners": {
        "home": 6,
        "away": 7
      },
      "recent_momentum_5min": {
        "home": 32,
        "away": 20
      },
      "recent_momentum_15min": {
        "home": 24,
        "away": 25
      },
      "formations": {
        "home": "4-2-3-1",
        "away": "3-4-2-1"
      },
      "h2h_summary": "共6场历史交锋记录",
      "league_rank": {
        "home": 6,
        "away": 3
      }
    },
    "data_deficits": []
  }
}
```

---

## 阶段二：Layer 03 量化引擎调用链路与数据流 (Call Chain & Data Flow)

由于您将获得整个 `refactor/03_quant_engine/` 文件夹的访问权限，本节详细梳理从 `CanonicalMatch` 进入系统后，各个核心模块的**精确文件调用路径**、**函数出入参**以及**缺陷爆发的准确逻辑位置**。

### 2.0 总调度入口 (The Orchestrator)
**调用链路**: `index.ts` -> `export function calculateQuantitativeFeatures(match: CanonicalMatch)`
这是 Layer 03 的绝对入口，统帅和调度后续所有的 M1 - M6 计算模块。

### 2.1 M1 & M2: 先验上下文与基础泊松 (Context & Prior)
**调用链路**: 
1.  `index.ts` 调用 `contextEngine.ts` 中的 `extractCleanedContextFeatures(match)`。
2.  `index.ts` 将上一步的结果传入 `prematchPriorEngine.ts` 中的 `synthesizePrematchPrior(match, contextFeatures)`。
**数据流动与逻辑**:
*   `extractCleanedContextFeatures` 负责解包 `CanonicalMatch`。它调用子函数提取：
    *   `calculateLineupImpactScores`: 处理 `match.reference.lineups`。
    *   `extractTacticalFormationFeatures`: 处理战术互斥。
    *   `calculateMotivationAndUrgencyIndex`: 处理战意。
*   随后，`synthesizePrematchPrior` 将这些清洗后的静态指标通过加权乘法，合成一个赛前稳固的 **基础进球期望 (Base Lambda)** (`PrematchTheoryPrior` 对象)。

### 2.2 M3: 战局势能与物理统计 (Momentum & Physical Stats)
**调用链路**: 
*   `index.ts` 调用 `eventMomentumFusion.ts` 中的 `calculateSpatioTemporalFeatures(match, contextFeatures)`。
**数据流动与逻辑**:
*   该函数接收实时的比赛数据。提取 `match.reference.attack_momentum.data` (历史每分钟的动量值数组) 和 `match.reference.stats` (危险进攻、控球率等)。
*   **计算斜率**: 对 5 分钟、15 分钟的动量数组切片，计算动量积分斜率。
*   **输出转换**: 将斜率与基础射正率结合，产出 `live_threat_trinity` (实时进攻威胁三位一体指数)。例如，当前比赛主队落后且 5 分钟动量飙升至 32，主队的 `alignment_score` 会被计算为极高的正值。

### 2.3 M4: 实时泊松衰减与公允胜率推演 (Poisson Decay)
**调用链路**: 
1.  `index.ts` 调用 `poissonDecayModel.ts` 中的 `calculateInPlayPoissonFeatures(...)`。
2.  内部调用 `calculateBivariatePoissonGrid()` 展开双变量概率网格。
**数据流动与逻辑**:
*   **时间衰减**: 提取 `match.timing.minute` (如 62 分钟)，得出剩余比赛时间 28 分钟。利用衰减公式 `decayFactor = remaining / 90` 缩减 M1/M2 算出的基础 Lambda。
*   **势能缩放**: 将 M3 算出的主客队 `live_threat_trinity.alignment_score` 作为乘子，直接放大/缩小剩余时间的期望（主队 `lambda_home_rest` 放大至 1.184，客队降至 1.041）。
*   **网格生成**: 将 1.184 和 1.041 传入 `calculateBivariatePoissonGrid`，生成剩余时段内 (0-0, 1-0...7-7) 的全部概率矩阵。

### 2.4 M5: 去抽水与 EV 数学期望 (Devig & EV) - 【关键缺陷爆发区 1】
**调用链路**: 
*   `index.ts` 调用 `devigCalculator.ts` 中的 `calculateDeviggedMarketFeatures(...)`。
*   内部按盘口类型分别调用 `analyzeAsianHandicap()` 和 `analyzeTotalGoals()`。
**数据流动与逻辑**:
*   函数接收 `match.markets.live.asian_handicap` (包含真实的 `line` 和 `odds`) 和 M4 产出的概率网格。
*   **算概率**: 遍历网格，将符合该 `line` (例如主队 -0.25) 的比分组合的概率相加，得出剥离庄家抽水的纯数学打出概率 (`homePositiveProbability` 和 `awayPositiveProbability`)。
*   **算 EV**: 公式 `EV = (概率 * 真实 odds) - 1`，得出双方的数学期望。
*   **【致命缺陷定位】**: 在 `analyzeAsianHandicap` 和 `analyzeTotalGoals` 的末尾赋值 `preferred_side` 时，存在条件分支：
    `if (homePositiveProbability > awayPositiveProbability && homeEV >= minRequiredEV)`
    这里的逻辑强制要求一方的胜率必须大于另一方（即 > 50%）。这导致即使算出的 EV 极高，只要该方向胜率不到一半，就会被强行抛弃（置为 `none`）。

### 2.5 M6: 统帅部 OOS 回测与决策 (Orchestration) - 【关键缺陷爆发区 2】
**调用链路**: 
*   主执行流返回到 `index.ts` 的后半段 (约第 230 行及之后，寻找 `edgeConfidenceScore` 计算逻辑)。
**数据流动与逻辑**:
*   引擎聚合 M5 吐出的 `positive_ev_signals` 数组，通过 `hasValidatedOosProfile` 去历史档案库中校验，生成 `validatedSignalProfiles`。
*   **【致命缺陷定位】**:
    观察 `index.ts` 中的以下几行逻辑流转：
    1.  `const sampleCount = validatedSignalProfiles.length;`
    2.  `const baseScore = Math.min(adjustedConfidence, dataQualityScore, ...);`
    3.  `const historyScore = sampleCount > 0 ? (计算回测得分) : baseScore;`
    4.  `const maturityRatio = Math.min(1.0, sampleCount / MATURE_THRESHOLD);`
    5.  `const edgeConfidenceScore = Math.round((1 - maturityRatio) * baseScore + maturityRatio * historyScore);`
    **漏洞原理**: 当 `sampleCount === 0` (完全没有历史回测样本证明该信号) 时，`maturityRatio` 变为 0。公式第五步退化为 `1 * baseScore + 0`。
    这导致一个纯数学算出来的、**未经验证的异动信号，窃取了基础数据质量分 `baseScore` (如 80 分)，变成了“高置信度”候选**，从而穿透了系统的安全门禁。

## 阶段三：专家 AI 核心重构任务

**命题 1：重塑 EV 与胜率的决策平衡 (在 `devigCalculator.ts` 中)**
请设计一套复合规则，既能设定“最低胜率门槛 (MVP, 比如 35%)”防止在垃圾高赔上无限连败破产，又能在胜率过线的前提下，**绝对优先比较 EV 大小**来决定 `preferred_side`，而不是强求胜率必须大于 50%。

**命题 2：堵住 OOS 门禁漏洞 (在 `index.ts` 中)**
当 `sampleCount === 0` 时，`edgeConfidenceScore` 必须归零，绝不能继承 `baseScore`。只有历史回测证明了盈利能力，才能赋予高置信度。

**命题 3：梳理前后端数据流转语义 (在 `index.ts` 中)**
系统需要明确暴露和区分：
*   `raw_positive_ev_signals`: 纯粹算出的异常 +EV 信号 (包含未经 OOS 的)。
*   `machineCandidateSignals`: 仅包含通过 OOS 历史验证的机器严选候选。

---

## 附录：核心量化引擎源码全量切片 (Layer 03)

### A.1 `devigCalculator.ts` (产生 EV/胜率平衡问题的源头)
/**
 * @file devigCalculator.ts
 * @description Layer 03 M5: 多源博弈微观去抽水 (De-vig)、四分之一盘复合期望分解与 EV 仲裁计算器
 * 
 * 核心职责：
 * 1. Multiplicative 比例剥水与 Shin 算法知情交易者模型 (解决 Favorite-Longshot 偏差)
 * 2. 全场独赢欧赔公允概率与庄家抽水率 (Overround) 求解
 * 3. 亚洲让球盘 (Asian Handicap) 精确分解：支持平手 (0)、半球 (0.5)、一球 (1.0) 及四分之一盘 (-0.25, +0.75 等) 赢半输半复合 EV 计算
 * 4. 大小球盘口 (Over/Under) 复合期望与正负 EV 计算
 * 5. 主盘 vs 副盘离散方差 (Line Dispersion) 与庄家防守诱盘意图 (Bookmaker Posture) 识别
 * 6. 雷速多主流机构矩阵共识对撞与异动监测
 * 
 * 遵循红线：纯函数无副作用 (No In-Place Mutation)、强类型零 any、完全可测试。
 */

import { CanonicalMatch } from '../02_canonical_model/types.js';
import {
  MarketType,
  DeviggedMarketFeatures,
  SingleMarketDevig,
  SpreadEVAssessment,
  TotalEVAssessment,
  DevigMethod,
  BookmakerPosture,
  InPlayPoissonFeatures,
  Layer03OpId,
  Layer03FeatureId
} from './types.js';
import { DeficitCollector } from '../00_common/DeficitCollector.js';
import { Tracer } from '../00_common/Tracer.js';
import { poissonPMF, calculateBivariatePoissonGrid } from './poissonDecayModel.js';

type PoissonExpectation = Pick<InPlayPoissonFeatures, 'lambda_home_rest' | 'lambda_away_rest' | 'expected_goals_rest'>;

function requireFiniteNonNegative(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite non-negative Poisson expectation.`);
  }
  return value;
}

function poissonSupportUpperBound(lambda: number): number {
  return Math.max(12, Math.ceil(lambda + 10 * Math.sqrt(lambda + 1)));
}

/**
 * 比例剥水模型 (Multiplicative / Proportional De-vig)
 * Fair_P_i = (1 / Odds_i) / sum(1 / Odds_j)
 */
export function devigMultiplicative(decimalOdds: number[]): { fair_probs: number[]; overround: number } {
  if (!decimalOdds || decimalOdds.length === 0) {
    return { fair_probs: [], overround: 0.0 };
  }

  const rawProbs = decimalOdds.map((odds) => (odds > 1.0 ? 1.0 / odds : 0.0));
  const sumRaw = rawProbs.reduce((a, b) => a + b, 0.0);

  if (sumRaw === 0.0) {
    return { fair_probs: decimalOdds.map(() => 0.0), overround: 0.0 };
  }

  const fairProbs = rawProbs.map((p) => Number((p / sumRaw).toFixed(4)));
  return {
    fair_probs: fairProbs,
    overround: Number(sumRaw.toFixed(4))
  };
}

/**
 * Shin 算法模型 (知情交易者 Insider Model De-vig)
 * 解决低赔率过度高估与高赔率低估 (Favorite-Longshot Bias)
 * 迭代求解知情交易者比例 z ∈ [0, 1)
 */
export function devigShin(decimalOdds: number[], maxIter: number = 50, tol: number = 1e-6): { fair_probs: number[]; overround: number; z: number } {
  if (!decimalOdds || decimalOdds.length === 0) {
    return { fair_probs: [], overround: 0.0, z: 0.0 };
  }

  const mult = devigMultiplicative(decimalOdds);
  if (mult.fair_probs.length === 0 || mult.overround <= 1.0) {
    return { fair_probs: mult.fair_probs, overround: mult.overround, z: 0.0 };
  }

  const invOdds = decimalOdds.map((o) => (o > 1.0 ? 1.0 / o : 0.0));
  const overround = mult.overround;

  let z = 0.02; // 初始猜测
  for (let iter = 0; iter < maxIter; iter++) {
    // 求解 p_i = (sqrt(z^2 + 4*(1-z)*invOdds_i^2 / overround) - z) / (2*(1-z))
    let sumP = 0.0;
    const pTemp: number[] = [];

    for (let i = 0; i < decimalOdds.length; i++) {
      const q = invOdds[i];
      const term = Math.sqrt(z * z + (4.0 * (1.0 - z) * q * q) / overround);
      const pi = (term - z) / (2.0 * (1.0 - z));
      pTemp.push(Math.max(0.0, pi));
      sumP += pi;
    }

    const diff = sumP - 1.0;
    if (Math.abs(diff) < tol) {
      z = Math.max(0.0, Math.min(0.5, z));
      const normalizedProbs = pTemp.map((p) => Number((p / sumP).toFixed(4)));
      return {
        fair_probs: normalizedProbs,
        overround: Number(overround.toFixed(4)),
        z: Number(z.toFixed(4))
      };
    }

    // 导数微调牛顿法 step
    z = z + diff * 0.1;
    if (z < 0.0) z = 0.001;
    if (z > 0.4) z = 0.4;
  }

  // 迭代未收敛则优雅降级为比例剥水
  return {
    fair_probs: mult.fair_probs,
    overround: mult.overround,
    z: 0.0
  };
}

/**
 * 盘口字符串解析（支持 "-0.5", "2.5", "-0/0.5", "平手/半球", "半球" 等）
 */
export function parseAsianHandicapLine(lineStr: string): number {
  if (!lineStr || typeof lineStr !== 'string') return 0.0;
  const clean = lineStr.trim();

  // 汉字盘口基础名映射表
  const TEXT_MAP: Record<string, number> = {
    '平手': 0.0,
    '平/半': 0.25,
    '平半': 0.25,
    '平手/半球': 0.25,
    '半球': 0.5,
    '半/一': 0.75,
    '半一': 0.75,
    '半球/一球': 0.75,
    '一球': 1.0,
    '一/球半': 1.25,
    '一球/球半': 1.25,
    '球半': 1.5,
    '球半/两球': 1.75,
    '两球': 2.0,
    '两/两球半': 2.25,
    '两球/两球半': 2.25,
    '两球半': 2.5,
    '两球半/三球': 2.75,
    '三球': 3.0
  };

  // 判断受让 vs 让球
  const isSurrender = clean.startsWith('+') || clean.includes('受让') || clean.includes('受');
  const isExplicitMinus = clean.startsWith('-');

  // 清洗汉字前缀
  let pureText = clean.replace(/^[+-]/, '').replace(/^让/, '').replace(/^受让/, '').replace(/^受/, '').trim();

  if (TEXT_MAP[pureText] !== undefined) {
    const val = TEXT_MAP[pureText];
    if (val === 0.0) return 0.0;
    // 中文让球习惯中，“半球”代表主队让半球即 -0.5；“受让半球”代表主队受让即 +0.5
    if (isSurrender) return val;
    return -val;
  }

  // 2. 检查斜杠复合盘 (如 "0/0.5", "0.5/1", "-0/0.5", "0/-0.5", "-0.5/-1")
  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 2) {
      const p1 = parseFloat(parts[0]);
      const p2 = parseFloat(parts[1]);
      if (!isNaN(p1) && !isNaN(p2)) {
        const isNegative = isExplicitMinus || p1 < 0 || p2 < 0 || Object.is(p1, -0) || Object.is(p2, -0);
        const avg = (Math.abs(p1) + Math.abs(p2)) / 2.0;
        return isNegative ? -avg : avg;
      }
    }
  }

  // 3. 直接浮点解析
  const val = parseFloat(clean);
  return isNaN(val) ? 0.0 : val;
}

/**
 * 盘口数值转标准显示串 (如 -0.25 -> "-0/0.5", +0.5 -> "+0.5")
 */
export function formatAsianHandicapLine(lineVal: number): string {
  const isNeg = lineVal < 0;
  const abs = Math.abs(lineVal);

  if (abs === 0.25) return isNeg ? '-0/0.5' : '+0/0.5';
  if (abs === 0.75) return isNeg ? '-0.5/1' : '+0.5/1';
  if (abs === 1.25) return isNeg ? '-1/1.5' : '+1/1.5';
  if (abs === 1.75) return isNeg ? '-1.5/2' : '+1.5/2';
  if (abs === 2.25) return isNeg ? '-2/2.5' : '+2/2.5';
  if (abs === 2.75) return isNeg ? '-2.5/3' : '+2.5/3';

  return lineVal >= 0 ? `+${lineVal}` : `${lineVal}`;
}

export function invertHandicapString(lineStr: string): string {
  if (!lineStr || lineStr === '0' || lineStr === '0.0') return '0';
  if (lineStr.startsWith('+')) return lineStr.replace('+', '-');
  if (lineStr.startsWith('-')) return lineStr.replace('-', '+');
  return '-' + lineStr;
}

/**
 * 亚洲让球盘 (Asian Handicap) 复合 EV 计算器
 * 核心原理：
 * 设剩余时段净胜球 d = h - a, 盘口为 line (对主队而言，如 -0.25, 0, +0.5)
 * 有效净胜差 Delta_home = d + line
 *   Delta_home >= 0.5   => 全赢, 收益 = (homeOdds - 1.0)
 *   Delta_home === 0.25 => 赢半, 收益 = 0.5 * (homeOdds - 1.0)
 *   Delta_home === 0.0  => 走盘退本, 收益 = 0.0
 *   Delta_home === -0.25 => 输半, 收益 = -0.5
 *   Delta_home <= -0.5  => 全输, 收益 = -1.0
 * 同理客队有效净胜差 Delta_away = -d - line
 */
export function calculateAsianHandicapEV(
  handicapLineStr: string,
  homeOdds: number,
  awayOdds: number,
  poisson: PoissonExpectation
): SpreadEVAssessment {
  const line = parseAsianHandicapLine(handicapLineStr);
  const lambdaHome = requireFiniteNonNegative(poisson.lambda_home_rest, 'lambda_home_rest');
  const lambdaAway = requireFiniteNonNegative(poisson.lambda_away_rest, 'lambda_away_rest');

  // 使用双变量泊松分布网格闭式求解
  const gridObj = calculateBivariatePoissonGrid(lambdaHome, lambdaAway, Math.max(poissonSupportUpperBound(lambdaHome), poissonSupportUpperBound(lambdaAway)));
  const matrix = gridObj.grid;

  let homeEV = 0.0;
  let awayEV = 0.0;
  let homePositiveProbability = 0.0;
  let awayPositiveProbability = 0.0;

  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      const pCell = matrix[h][a];
      if (pCell <= 0) continue;

      const d = h - a; // 剩余主队净胜球

      // 1. 主队收益
      const deltaHome = d + line;
      let payoffHome = 0.0;
      if (deltaHome >= 0.5) {
        payoffHome = homeOdds - 1.0; // 全赢
      } else if (Math.abs(deltaHome - 0.25) < 1e-4) {
        payoffHome = 0.5 * (homeOdds - 1.0); // 赢半
      } else if (Math.abs(deltaHome) < 1e-4) {
        payoffHome = 0.0; // 走盘
      } else if (Math.abs(deltaHome - (-0.25)) < 1e-4) {
        payoffHome = -0.5; // 输半
      } else {
        payoffHome = -1.0; // 全输
      }
      homeEV += pCell * payoffHome;
      if (payoffHome > 0) homePositiveProbability += pCell;

      // 2. 客队收益
      const deltaAway = -d - line;
      let payoffAway = 0.0;
      if (deltaAway >= 0.5) {
        payoffAway = awayOdds - 1.0; // 全赢
      } else if (Math.abs(deltaAway - 0.25) < 1e-4) {
        payoffAway = 0.5 * (awayOdds - 1.0); // 赢半
      } else if (Math.abs(deltaAway) < 1e-4) {
        payoffAway = 0.0; // 走盘
      } else if (Math.abs(deltaAway - (-0.25)) < 1e-4) {
        payoffAway = -0.5; // 输半
      } else {
        payoffAway = -1.0; // 全输
      }
      awayEV += pCell * payoffAway;
      if (payoffAway > 0) awayPositiveProbability += pCell;
    }
  }

  homeEV = Number(homeEV.toFixed(4));
  awayEV = Number(awayEV.toFixed(4));

  let preferredSide: 'home' | 'away' | 'none' = 'none';
  const marketMargin = Math.max(0.025, (1.0 / homeOdds + 1.0 / awayOdds) - 1.0);
  const minRequiredEV = Math.max(0.015, marketMargin * 0.5 + 0.01);

  if (homePositiveProbability > awayPositiveProbability && homeEV >= minRequiredEV) {
    preferredSide = 'home';
  } else if (awayPositiveProbability > homePositiveProbability && awayEV >= minRequiredEV) {
    preferredSide = 'away';
  }

  const selectedOdds = preferredSide === 'home' ? homeOdds : awayOdds;
  const selectedEV = preferredSide === 'home' ? homeEV : awayEV;
  const kellyFraction = (preferredSide !== 'none' && selectedOdds > 1.0 && selectedEV > 0)
    ? Number(Math.max(0.0, Math.min(0.05, selectedEV / (4.0 * (selectedOdds - 1.0)))).toFixed(4))
    : 0.0;

  return Object.freeze({
    line: handicapLineStr,
    home_odds: homeOdds,
    away_odds: awayOdds,
    home_ev: homeEV,
    away_ev: awayEV,
    preferred_side: preferredSide,
    is_positive_ev: preferredSide !== 'none',
    home_model_probability: Number(homePositiveProbability.toFixed(4)),
    away_model_probability: Number(awayPositiveProbability.toFixed(4)),
    kelly_fraction: kellyFraction
  });
}

/**
 * 计算全场大小球盘口的复合数学期望 (EV)
 * 基于单变量泊松分布 K_rest ~ Poisson(lambda_rest) 进行闭式全量展开：
 * 剩余进球目标 T = line - currentTotalGoals
 * 对于任意剩余总进球 k in [0..10]:
 *   大球差额 Delta_over = k - T
 *     Delta_over >= 0.5  => 全赢 (overOdds - 1.0)
 *     Delta_over === 0.25 => 赢半 (0.5 * (overOdds - 1.0))
 *     Delta_over === 0.0  => 走盘退本 (0.0)
 *     Delta_over === -0.25 => 输半 (-0.5)
 *     Delta_over <= -0.5  => 全输 (-1.0)
 *   小球差额 Delta_under = T - k
 */
export function calculateTotalGoalsEV(
  totalLineStr: string,
  overOdds: number,
  underOdds: number,
  currentTotalGoals: number,
  poisson: PoissonExpectation
): TotalEVAssessment {
  const line = parseAsianHandicapLine(totalLineStr);
  const remainingTarget = line - currentTotalGoals;
  const lambdaRest = requireFiniteNonNegative(poisson.expected_goals_rest, 'expected_goals_rest');

  let overEV = 0.0;
  let underEV = 0.0;
  let overPositiveProbability = 0.0;
  let underPositiveProbability = 0.0;

  // 动态展开至可忽略尾部，避免深盘与高 λ 时丢失概率质量。
  for (let k = 0; k <= poissonSupportUpperBound(lambdaRest); k++) {
    const pK = poissonPMF(k, lambdaRest);
    if (pK <= 0) continue;

    // 1. 大球收益
    const deltaOver = k - remainingTarget;
    let payoffOver = 0.0;
    if (deltaOver >= 0.5) {
      payoffOver = overOdds - 1.0;
    } else if (Math.abs(deltaOver - 0.25) < 1e-4) {
      payoffOver = 0.5 * (overOdds - 1.0);
    } else if (Math.abs(deltaOver) < 1e-4) {
      payoffOver = 0.0;
    } else if (Math.abs(deltaOver - (-0.25)) < 1e-4) {
      payoffOver = -0.5;
    } else {
      payoffOver = -1.0;
    }
    overEV += pK * payoffOver;
    if (payoffOver > 0) overPositiveProbability += pK;

    // 2. 小球收益
    const deltaUnder = remainingTarget - k;
    let payoffUnder = 0.0;
    if (deltaUnder >= 0.5) {
      payoffUnder = underOdds - 1.0;
    } else if (Math.abs(deltaUnder - 0.25) < 1e-4) {
      payoffUnder = 0.5 * (underOdds - 1.0);
    } else if (Math.abs(deltaUnder) < 1e-4) {
      payoffUnder = 0.0;
    } else if (Math.abs(deltaUnder - (-0.25)) < 1e-4) {
      payoffUnder = -0.5;
    } else {
      payoffUnder = -1.0;
    }
    underEV += pK * payoffUnder;
    if (payoffUnder > 0) underPositiveProbability += pK;
  }

  overEV = Number(overEV.toFixed(4));
  underEV = Number(underEV.toFixed(4));

  let preferredSide: 'over' | 'under' | 'none' = 'none';
  const marketMargin = Math.max(0.025, (1.0 / overOdds + 1.0 / underOdds) - 1.0);
  const minRequiredEV = Math.max(0.015, marketMargin * 0.5 + 0.01);

  if (overPositiveProbability > underPositiveProbability && overEV >= minRequiredEV) {
    preferredSide = 'over';
  } else if (underPositiveProbability > overPositiveProbability && underEV >= minRequiredEV) {
    preferredSide = 'under';
  }

  const selectedOdds = preferredSide === 'over' ? overOdds : underOdds;
  const selectedEV = preferredSide === 'over' ? overEV : underEV;
  const kellyFraction = (preferredSide !== 'none' && selectedOdds > 1.0 && selectedEV > 0)
    ? Number(Math.max(0.0, Math.min(0.05, selectedEV / (4.0 * (selectedOdds - 1.0)))).toFixed(4))
    : 0.0;

  return Object.freeze({
    line: totalLineStr,
    over_odds: overOdds,
    under_odds: underOdds,
    over_ev: overEV,
    under_ev: underEV,
    preferred_side: preferredSide,
    is_positive_ev: preferredSide !== 'none',
    over_model_probability: Number(overPositiveProbability.toFixed(4)),
    under_model_probability: Number(underPositiveProbability.toFixed(4)),
    kelly_fraction: kellyFraction
  });
}

/**
 * 识别机构设防与诱盘姿态 (Bookmaker Posture)
 */
export function identifyBookmakerPosture(
  spreadEV: SpreadEVAssessment | undefined,
  totalEV: TotalEVAssessment | undefined,
  overround: number,
  shinZ: number
): BookmakerPosture {
  // 1. 庄家极度抽水防御或知情交易者重度介入
  if (shinZ >= 0.08) {
    return BookmakerPosture.HEAVY_DEFENSIVE;
  }

  // 2. 异常高赔诱盘陷阱 (赔率极诱人但理论胜率支撑不足)
  if (spreadEV && ((spreadEV.home_ev < -0.08 && spreadEV.home_odds > 2.20) || (spreadEV.away_ev < -0.08 && spreadEV.away_odds > 2.20))) {
    return BookmakerPosture.TRAP_HIGH_ODDS;
  }

  // 3. 抽水率偏高且无明确正 EV
  if (overround > 1.10 && (!spreadEV || !spreadEV.is_positive_ev) && (!totalEV || !totalEV.is_positive_ev)) {
    return BookmakerPosture.DISPERSED_UNCERTAIN;
  }

  return BookmakerPosture.BALANCED_NEUTRAL;
}

/**
 * Layer 03 M5 统一入口：计算去抽水与全量盘口复合期望特征
 */
/**
 * 求解 1X2 独赢市场 EV 与最优投注选择 (纯数学公理计算，零魔法常数)
 */
export function calculateH2hEV(
  homeOdds: number,
  drawOdds: number,
  awayOdds: number,
  poisson: InPlayPoissonFeatures,
  minEvThreshold = 0.035
): {
  model_probabilities: [number, number, number];
  home_ev: number;
  draw_ev: number;
  away_ev: number;
  preferred_side: 'home' | 'draw' | 'away' | 'none';
  is_positive_ev: boolean;
  kelly_fraction: number;
} {
  const probs = poisson.full_time_probabilities ?? {
    prob_home_win: poisson.rest_score_matrix.prob_home_win_rest,
    prob_draw: poisson.rest_score_matrix.prob_draw_rest,
    prob_away_win: poisson.rest_score_matrix.prob_away_win_rest
  };

  const probHome = probs.prob_home_win;
  const probDraw = probs.prob_draw;
  const probAway = probs.prob_away_win;

  const homeEv = homeOdds > 1 ? Number((probHome * homeOdds - 1.0).toFixed(4)) : -1.0;
  const drawEv = drawOdds > 1 ? Number((probDraw * drawOdds - 1.0).toFixed(4)) : -1.0;
  const awayEv = awayOdds > 1 ? Number((probAway * awayOdds - 1.0).toFixed(4)) : -1.0;

  let preferredSide: 'home' | 'draw' | 'away' | 'none' = 'none';
  let maxEv = -1.0;
  let maxProb = 0.0;
  let maxOdds = 0.0;

  const MIN_KELLY_ALLOCATION = 0.015;
  const isEligible1X2 = (ev: number, odds: number) => {
    if (ev < minEvThreshold || odds <= 1.0) return false;
    const kellyFraction = ev / (odds - 1.0);
    return kellyFraction >= MIN_KELLY_ALLOCATION;
  };

  if (homeEv > maxEv && isEligible1X2(homeEv, homeOdds)) {
    maxEv = homeEv;
    preferredSide = 'home';
    maxProb = probHome;
    maxOdds = homeOdds;
  }
  if (drawEv > maxEv && isEligible1X2(drawEv, drawOdds)) {
    maxEv = drawEv;
    preferredSide = 'draw';
    maxProb = probDraw;
    maxOdds = drawOdds;
  }
  if (awayEv > maxEv && isEligible1X2(awayEv, awayOdds)) {
    maxEv = awayEv;
    preferredSide = 'away';
    maxProb = probAway;
    maxOdds = awayOdds;
  }

  let kelly = 0.0;
  if (preferredSide !== 'none' && maxOdds > 1.0) {
    const b = maxOdds - 1.0;
    const q = 1.0 - maxProb;
    const fullKelly = (b * maxProb - q) / b;
    kelly = Number(Math.max(0.0, Math.min(0.05, fullKelly * 0.25)).toFixed(4));
  }

  return {
    model_probabilities: [probHome, probDraw, probAway],
    home_ev: homeEv,
    draw_ev: drawEv,
    away_ev: awayEv,
    preferred_side: preferredSide,
    is_positive_ev: preferredSide !== 'none',
    kelly_fraction: kelly
  };
}

export function calculateDeviggedMarketFeatures(
  match: CanonicalMatch,
  poisson: InPlayPoissonFeatures,
  collector?: DeficitCollector,
  tracer?: Tracer
): DeviggedMarketFeatures {
  const h2hOdds = match.markets?.full_h2h;
  const decimalOdds: number[] = [];
  if (h2hOdds) {
    if (h2hOdds.home_odds) decimalOdds.push(h2hOdds.home_odds);
    if (h2hOdds.draw_odds) decimalOdds.push(h2hOdds.draw_odds);
    if (h2hOdds.away_odds) decimalOdds.push(h2hOdds.away_odds);
  }

  // 1. 欧赔去抽水与 M3 独赢 EV 计算
  let h2hDevig: SingleMarketDevig | undefined;
  if (decimalOdds.length === 3 && h2hOdds?.home_odds && h2hOdds?.draw_odds && h2hOdds?.away_odds) {
    const shin = devigShin(decimalOdds);
    const h2hEval = calculateH2hEV(h2hOdds.home_odds, h2hOdds.draw_odds, h2hOdds.away_odds, poisson);
    h2hDevig = {
      market_type: MarketType.MONEYLINE_1X2,
      raw_overround: shin.overround,
      devig_method: DevigMethod.SHIN,
      fair_probabilities: shin.fair_probs,
      fair_odds: shin.fair_probs.map((p) => (p > 0 ? Number((1.0 / p).toFixed(3)) : 0.0)),
      market_odds: [h2hOdds.home_odds, h2hOdds.draw_odds, h2hOdds.away_odds],
      model_probabilities: h2hEval.model_probabilities,
      home_ev: h2hEval.home_ev,
      draw_ev: h2hEval.draw_ev,
      away_ev: h2hEval.away_ev,
      preferred_side: h2hEval.preferred_side,
      is_positive_ev: h2hEval.is_positive_ev,
      kelly_fraction: h2hEval.kelly_fraction
    };
  }

  // 2. 亚洲让球盘 EV
  const spreadMarket = match.markets?.full_spread_main;
  let spreadMain: SpreadEVAssessment | undefined;
  if (spreadMarket && spreadMarket.home_selection && spreadMarket.home_odds && spreadMarket.away_odds) {
    spreadMain = calculateAsianHandicapEV(spreadMarket.home_selection, spreadMarket.home_odds, spreadMarket.away_odds, poisson);
  }

  const spreadSecondaryEV: SpreadEVAssessment[] = [];
  if (match.markets?.full_spread_subs) {
    for (const sub of match.markets.full_spread_subs) {
      if (sub.home_selection && sub.home_odds && sub.away_odds) {
        spreadSecondaryEV.push(calculateAsianHandicapEV(sub.home_selection, sub.home_odds, sub.away_odds, poisson));
      }
    }
  }

  // 3. 大小球盘 EV
  const totalMarket = match.markets?.full_total_main;
  // M4 predicts future goals. For a full-match line, convert it to a
  // remaining-goals target by subtracting the verified current score. A
  // remaining-goals line must be explicitly marked by the source parser.
  const currentTotal = totalMarket?.settlement_basis === 'REMAINING_GOALS'
    ? 0
    : (match.score.home_score ?? 0) + (match.score.away_score ?? 0);
  let totalMain: TotalEVAssessment | undefined;
  if (totalMarket && totalMarket.line && totalMarket.over_odds && totalMarket.under_odds) {
    totalMain = calculateTotalGoalsEV(totalMarket.line, totalMarket.over_odds, totalMarket.under_odds, currentTotal, poisson);
  }

  const totalSecondaryEV: TotalEVAssessment[] = [];
  if (match.markets?.full_total_subs) {
    for (const sub of match.markets.full_total_subs) {
      if (sub.line && sub.over_odds && sub.under_odds) {
        const subCurrentTotal = sub.settlement_basis === 'REMAINING_GOALS'
          ? 0
          : (match.score.home_score ?? 0) + (match.score.away_score ?? 0);
        totalSecondaryEV.push(calculateTotalGoalsEV(sub.line, sub.over_odds, sub.under_odds, subCurrentTotal, poisson));
      }
    }
  }

  // 4. 机构姿态识别
  const posture = identifyBookmakerPosture(spreadMain, totalMain, h2hDevig?.raw_overround ?? 1.05, 0.02);

  const activeTracer = tracer ?? Tracer.getInstance();
  activeTracer.log(
    'INFO',
    'QUANT_03_DEVIG_CALCULATION',
    'DEVIG_EV_COMPLETED',
    `Devig and EV calculated for match ${match.canonical_id}`,
    {
      posture,
      spread_main: spreadMain,
      total_main: totalMain
    },
    match.canonical_id
  );

  return Object.freeze({
    h2h_devig: h2hDevig,
    spread_main_ev: spreadMain,
    spread_secondary_ev: spreadSecondaryEV,
    total_main_ev: totalMain,
    total_secondary_ev: totalSecondaryEV,
    line_dispersion: {
      spread_variance: 0.0,
      total_variance: 0.0
    },
    bookmaker_posture: posture
  });
}
### A.2 `index.ts` (产生 OOS 门禁与前后端脱节的源头)

/**
 * @file index.ts
 * @description Layer 03 M6: 最高统帅部量化博弈总指挥中枢 (Battlefield Quantitative Commander)
 * 
 * 核心职责：
 * 1. 统一串联与编排：
 *    - M2: 数据时效衰减、情境清洗与 L0 熔断判定 (extractCleanedContextFeatures)
 *    - M3: 实时物理攻防与危攻时序微分提取 (extractMomentumTimelineFeatures, extractRealTimePhysicalStats)
 *    - M4: 滚球 0:0 实时重置 Forward 泊松推演 (calculateInPlayPoissonFeatures)
 *    - M5: 多源去抽水与四分之一盘复合 EV 仲裁 (calculateDeviggedMarketFeatures)
 * 2. 战场统治权指数 (BDI: Battlefield Dominance Index, [-100, +100]) 综合计算
 * 3. 破门相变临界预警 (Goal Phase Alert) 综合识别 (时序积分 + 5m斜率 + 绝境搏命态)
 * 4. L0/L1/L2 容错熔断、优雅降级与量化置信度 (Confidence Score: 0~100) 扣减法则
 * 5. 输出统一不可变结构体 QuantitativeFeatures
 * 
 * 遵循红线：纯函数无副作用 (No In-Place Mutation)、强类型零 any、完全可测试。
 */

import { CanonicalMatch } from '../02_canonical_model/types.js';
import { MatchAlignmentStatus, MatchStage } from '../02_canonical_model/enums.js';
import {
  QuantitativeFeatures,
  QuantEngineOptions,
  GoalPhaseAlert,
  PositiveEVSignal,
  OosMarket,
  QuantCalibrationProfile,
  QuantAlert,
  MomentumTimelineFeatures,
  RealTimePhysicalStatsFeatures,
  LiveThreatTrinityFeatures,
  UnifiedMatchState,
  CleanedContextFeatures,
  DeviggedMarketFeatures,
  BookmakerPosture,
  MarketStanceType,
  Layer03OpId,
  Layer03FeatureId
} from './types.js';
import { selectOosCalibrationProfile } from './oosCalibrationEngine.js';
import { extractCleanedContextFeatures } from './contextEngine.js';
import { synthesizePrematchPrior } from './prematchPriorEngine.js';
import { calibrateWithMarketOdds } from './marketDivergenceEngine.js';
import { extractMomentumTimelineFeatures, extractRealTimePhysicalStats } from './momentumQuantEngine.js';
import { extractSpatioTemporalEventFeatures } from './eventMomentumFusion.js';
import { calculateInPlayPoissonFeatures } from './poissonDecayModel.js';
import { calculateDeviggedMarketFeatures, invertHandicapString, parseAsianHandicapLine } from './devigCalculator.js';
import { buildLayer03DataAudit, buildLayer03ProductionGate } from './dataAudit.js';
import { DeficitCollector } from '../00_common/DeficitCollector.js';
import { Tracer } from '../00_common/Tracer.js';

export * from './enums.js';
export * from './types.js';
export * from './contextEngine.js';
export * from './prematchPriorEngine.js';
export * from './marketDivergenceEngine.js';
export * from './momentumQuantEngine.js';
export * from './eventMomentumFusion.js';
export * from './poissonDecayModel.js';
export * from './devigCalculator.js';
export * from './dataAudit.js';
export * from './oosCalibrationEngine.js';

/**
 * 计算战场统治权指数 (Battlefield Dominance Index, BDI ∈ [-100, +100])
 * 融合 15m 动量积分、5m 斜率、xT 穿透威胁与全场危攻压迫
 */
export function calculateBattlefieldDominanceIndex(
  state: UnifiedMatchState
): number {
  return Number(Math.max(-100, Math.min(100, state.dominance_index)).toFixed(2));
}

function toOosMarket(signal: PositiveEVSignal | undefined): OosMarket | undefined {
  if (signal?.market === 'ASIAN_HANDICAP_MAIN') return 'ASIAN_HANDICAP_MAIN';
  if (signal?.market === 'TOTAL_GOALS_MAIN') return 'TOTAL_GOALS_MAIN';
  return undefined;
}

function isValidatedOosProfile(profile: QuantCalibrationProfile | undefined): profile is QuantCalibrationProfile {
  return profile?.status === 'VALIDATED' &&
    profile.effective_sample_size >= 200 &&
    profile.oos_brier_score !== null;
}

type ValidatedOosProfile = QuantCalibrationProfile & { oos_brier_score: number };

function hasValidatedOosProfile(profile: QuantCalibrationProfile | undefined): profile is ValidatedOosProfile {
  return isValidatedOosProfile(profile) && typeof profile.oos_brier_score === 'number';
}

/** 将三源证据、战术状态和进球后冷却凝结为下游唯一可消费的实时状态。 */
export function buildUnifiedMatchState(
  spatioTemporal: QuantitativeFeatures['spatio_temporal_events'],
  physical?: RealTimePhysicalStatsFeatures
): UnifiedMatchState {
  const trinity = spatioTemporal.live_threat_trinity;
  const cooldown = spatioTemporal.goal_climax.post_goal_cooldown_active ? 0.70 : 1.0;
  const homeIntensity = trinity.home.calibrated_threat * cooldown;
  const awayIntensity = trinity.away.calibrated_threat * cooldown;
  const effectiveHomeIntensity = homeIntensity * spatioTemporal.regime.regime_multiplier_home;
  const effectiveAwayIntensity = awayIntensity * spatioTemporal.regime.regime_multiplier_away;
  return Object.freeze({
    home_intensity: Number(Math.max(0, Math.min(1.5, homeIntensity)).toFixed(3)),
    away_intensity: Number(Math.max(0, Math.min(1.5, awayIntensity)).toFixed(3)),
    regime_multiplier_home: spatioTemporal.regime.regime_multiplier_home,
    regime_multiplier_away: spatioTemporal.regime.regime_multiplier_away,
    dominance_index: Number(((effectiveHomeIntensity - effectiveAwayIntensity) * 100).toFixed(2)),
    imminent_goal: spatioTemporal.goal_climax.is_imminent_threat,
    post_goal_cooldown_active: spatioTemporal.goal_climax.post_goal_cooldown_active,
    has_evidence_conflict: trinity.has_material_conflict,
    // 动量、事件与技术统计来自同一雷速上游：一致性不获得“独立来源”额外加成。
    source_lineage_discount: 1.0,
    red_card_attack_multiplier_home: physical?.red_card_penalty?.home_attack_multiplier ?? 1.0,
    red_card_attack_multiplier_away: physical?.red_card_penalty?.away_attack_multiplier ?? 1.0,
    red_card_defense_leak_multiplier_home: physical?.red_card_penalty?.home_defense_leak_multiplier ?? 1.0,
    red_card_defense_leak_multiplier_away: physical?.red_card_penalty?.away_defense_leak_multiplier ?? 1.0
  });
}

/**
 * 识别破门相变临界预警 (Goal Phase Alert)
 */
export function evaluateGoalPhaseAlert(
  elapsedMinute: number,
  scoreDiff: number,
  timeline: MomentumTimelineFeatures,
  physical: RealTimePhysicalStatsFeatures,
  expectedGoalsRest: number
): { alert: GoalPhaseAlert; trigger_team?: 'home' | 'away'; rationale: string } {
  const isLateGame = elapsedMinute >= 70;
  const isOneGoalDiff = Math.abs(scoreDiff) === 1;

  // 1. 紧急绝境破门相变 (IMMINENT_GOAL):
  if (timeline.is_sustained_siege && isLateGame) {
    const team = timeline.integral_15m.net > 0 ? 'home' : 'away';
    return {
      alert: GoalPhaseAlert.IMMINENT_GOAL,
      trigger_team: team,
      rationale: `${team.toUpperCase()} is executing a sustained siege in late-game with suppressed opponent clearance.`
    };
  }

  if (isLateGame && isOneGoalDiff && (Math.abs(timeline.slope_5m) >= 18.0 || Math.abs(timeline.integral_5m.net) >= 150)) {
    const team = timeline.slope_5m > 0 ? 'home' : 'away';
    return {
      alert: GoalPhaseAlert.IMMINENT_GOAL,
      trigger_team: team,
      rationale: `${team.toUpperCase()} triggered desperate momentum surge in close-margin late game.`
    };
  }

  // 2. 攻防僵局 (DEADLOCK_STALEMATE):
  if (timeline.inflection_count_recent_15m >= 4 && Math.abs(timeline.integral_15m.net) < 60) {
    return {
      alert: GoalPhaseAlert.DEADLOCK_STALEMATE,
      rationale: 'Frequent back-and-forth midfield turnovers without penetration.'
    };
  }

  // 3. 垃圾时间低强度 (LOW_INTENSITY_GARBAGE_TIME):
  if (Math.abs(scoreDiff) >= 3 && elapsedMinute >= 75) {
    return {
      alert: GoalPhaseAlert.LOW_INTENSITY_GARBAGE_TIME,
      rationale: 'Large margin lead with pacing control; offensive urgency extinguished.'
    };
  }

  return {
    alert: GoalPhaseAlert.NONE,
    rationale: 'Normal game flow dynamics without extreme phase transition.'
  };
}

/**
 * 综合评估量化置信度评分 (Confidence Score ∈ [0, 100]) 与风控警报
 */
export function calculateConfidenceAndAlerts(
  context: CleanedContextFeatures,
  timeline: MomentumTimelineFeatures,
  physical: RealTimePhysicalStatsFeatures,
  devig: DeviggedMarketFeatures,
  stage: MatchStage = MatchStage.LIVE
): { confidence_score: number; risk_flags: QuantAlert[]; positive_ev_signals: PositiveEVSignal[] } {
  let score = 100;
  const riskFlags: QuantAlert[] = [];
  const positiveEVSignals: PositiveEVSignal[] = [];

  // L0 熔断判定：一票否决
  if (context.circuit_breaker.is_triggered) {
    return {
      confidence_score: 0,
      risk_flags: [QuantAlert.L0_FATAL_DATA_MISSING],
      positive_ev_signals: []
    };
  }

  // L1 缺陷扣分：仅对滚球 (LIVE) 比赛扣减动量点阵缺失分；赛前 (PREMATCH) 比赛点阵天然为空，豁免扣分与警报
  if (timeline.total_points === 0) {
    if (stage === MatchStage.LIVE) {
      score -= 20; // 滚球缺失点阵
      riskFlags.push(QuantAlert.MOMENTUM_DATA_DEFICIT);
    }
  }

  // 滚球缺失客观攻防统计扣分
  if (!physical.stats_available && stage === MatchStage.LIVE) {
    score -= 25;
    riskFlags.push(QuantAlert.TECHNICAL_METRICS_DEFICIT);
  }

  if (physical.tactical_anomaly.home_barren_dominance || physical.tactical_anomaly.away_barren_dominance) {
    score -= 8;
    riskFlags.push(QuantAlert.BARREN_DOMINANCE_WARNING);
  }

  if (physical.tactical_anomaly.home_lethal_counter || physical.tactical_anomaly.away_lethal_counter) {
    riskFlags.push(QuantAlert.LETHAL_COUNTER_WARNING);
  }

  if ((physical.red_card_penalty?.home_attack_multiplier ?? 1.0) < 1.0 || (physical.red_card_penalty?.away_attack_multiplier ?? 1.0) < 1.0) {
    riskFlags.push(QuantAlert.RED_CARD_TACTICAL_COLLAPSE);
  }

  if (devig.bookmaker_posture === BookmakerPosture.TRAP_HIGH_ODDS) {
    riskFlags.push(QuantAlert.TRAP_HIGH_ODDS_WARNING);
  } else if (devig.bookmaker_posture === BookmakerPosture.DISPERSED_UNCERTAIN) {
    score -= 10;
    riskFlags.push(QuantAlert.HIGH_LINE_DISPERSION);
  }

  // L2 背景缺失微调
  if (context.goal_timing_validity.requires_bayesian_shrinkage) {
    score -= 2;
  }
  if (context.h2h_weights.length === 0) {
    score -= 2;
  }

  // 提取独赢、让球与大小球的正 EV 信号
  if (devig.h2h_devig && devig.h2h_devig.is_positive_ev && devig.h2h_devig.preferred_side && devig.h2h_devig.preferred_side !== 'none') {
    const side = devig.h2h_devig.preferred_side;
    const ev = side === 'home' ? (devig.h2h_devig.home_ev ?? 0) : side === 'draw' ? (devig.h2h_devig.draw_ev ?? 0) : (devig.h2h_devig.away_ev ?? 0);
    const odds = side === 'home'
      ? (devig.h2h_devig.market_odds?.[0] ?? 0)
      : side === 'draw'
      ? (devig.h2h_devig.market_odds?.[1] ?? 0)
      : (devig.h2h_devig.market_odds?.[2] ?? 0);
    const prob = side === 'home'
      ? devig.h2h_devig.model_probabilities?.[0]
      : side === 'draw'
      ? devig.h2h_devig.model_probabilities?.[1]
      : devig.h2h_devig.model_probabilities?.[2];
    const kelly = devig.h2h_devig.kelly_fraction ?? 0.0;
    positiveEVSignals.push(Object.freeze({
      market: 'MONEYLINE_1X2',
      line: '0',
      side: side,
      odds: odds,
      ev: ev,
      model_probability: prob,
      confidence: Math.max(50, score),
      kelly_fraction: kelly
    }));
  }

  if (devig.spread_main_ev && devig.spread_main_ev.is_positive_ev && devig.spread_main_ev.preferred_side !== 'none') {
    const side = devig.spread_main_ev.preferred_side;
    const ev = side === 'home' ? devig.spread_main_ev.home_ev : devig.spread_main_ev.away_ev;
    const odds = side === 'home' ? devig.spread_main_ev.home_odds : devig.spread_main_ev.away_odds;
    const kelly = devig.spread_main_ev.kelly_fraction ?? 0.0;
    const actualLine = side === 'away' ? invertHandicapString(devig.spread_main_ev.line) : devig.spread_main_ev.line;
    positiveEVSignals.push(Object.freeze({
      market: 'ASIAN_HANDICAP_MAIN',
      line: actualLine,
      side: side,
      odds: odds,
      ev: ev,
      model_probability: side === 'home'
        ? devig.spread_main_ev.home_model_probability
        : devig.spread_main_ev.away_model_probability,
      confidence: Math.max(50, score),
      kelly_fraction: kelly
    }));
  }

  if (devig.total_main_ev && devig.total_main_ev.is_positive_ev && devig.total_main_ev.preferred_side !== 'none') {
    const side = devig.total_main_ev.preferred_side;
    const ev = side === 'over' ? devig.total_main_ev.over_ev : devig.total_main_ev.under_ev;
    const odds = side === 'over' ? devig.total_main_ev.over_odds : devig.total_main_ev.under_odds;
    const kelly = devig.total_main_ev.kelly_fraction ?? 0.0;
    positiveEVSignals.push(Object.freeze({
      market: 'TOTAL_GOALS_MAIN',
      line: devig.total_main_ev.line,
      side: side,
      odds: odds,
      ev: ev,
      model_probability: side === 'over'
        ? devig.total_main_ev.over_model_probability
        : devig.total_main_ev.under_model_probability,
      confidence: Math.max(50, score),
      kelly_fraction: kelly
    }));
  }

  return {
    confidence_score: Math.max(0, Math.min(100, score)),
    risk_flags: riskFlags,
    positive_ev_signals: positiveEVSignals
  };
}

function resolveMarketConflicts(
  signals: PositiveEVSignal[],
  match: CanonicalMatch,
  poissonGrid?: number[][]
): PositiveEVSignal[] {
  const spread = signals.find(s => s.market === 'ASIAN_HANDICAP_MAIN');
  const total = signals.find(s => s.market === 'TOTAL_GOALS_MAIN');
  
  if (!spread || !total || !poissonGrid) return signals;

  let bothWinProb = 0.0;
  const spreadLineNum = parseAsianHandicapLine(spread.line);
  const totalLineNum = parseAsianHandicapLine(total.line);
  const currentHome = match.score?.home_score ?? 0;
  const currentAway = match.score?.away_score ?? 0;

  for (let dH = 0; dH < poissonGrid.length; dH++) {
    for (let dA = 0; dA < poissonGrid[dH].length; dA++) {
      const prob = poissonGrid[dH][dA];
      if (prob <= 0) continue;

      const netRest = spread.side === 'home' ? (dH - dA) : (dA - dH);
      const isSpreadWin = (netRest + spreadLineNum) > 0;

      const finalTotal = currentHome + currentAway + dH + dA;
      const isTotalWin = total.side === 'over' 
        ? finalTotal > totalLineNum 
        : finalTotal < totalLineNum;

      if (isSpreadWin && isTotalWin) {
        bothWinProb += prob;
      }
    }
  }

  if (bothWinProb < 0.05) {
    if (spread.ev >= total.ev) {
      return signals.filter(s => s.market !== 'TOTAL_GOALS_MAIN');
    } else {
      return signals.filter(s => s.market !== 'ASIAN_HANDICAP_MAIN');
    }
  }

  return signals;
}

/**
 * Layer 03 统一主调度入口：计算全量确定性量化博弈特征
 * @param match CanonicalMatch 标准赛事
 * @param options 可选配置
 * @param collector 缺陷收集器
 * @param tracer 链路追踪器
 */
export function calculateQuantitativeFeatures(
  match: CanonicalMatch,
  options?: QuantEngineOptions,
  collector?: DeficitCollector,
  tracer?: Tracer
): QuantitativeFeatures {
  tracer?.info(
    Layer03OpId.ORCHESTRATE_QUANT,
    'ORCHESTRATION_START',
    `Starting Layer 03 Quantitative orchestration for match ${match.canonical_id}`,
    undefined,
    match.canonical_id
  );

  const alignmentStatus = match.alignment.status;
  if (alignmentStatus !== MatchAlignmentStatus.MATCHED_BY_ALIAS &&
      alignmentStatus !== MatchAlignmentStatus.MATCHED_AUTO) {
    collector?.record(
      'MATCH_ALIGNMENT_FAILED',
      Layer03OpId.ORCHESTRATE_QUANT,
      'RC-001',
      `Layer 03 requires confirmed entity alignment; received ${alignmentStatus}.`,
      undefined,
      match.canonical_id
    );
    throw new Error(`MATCH_ALIGNMENT_FAILED: Match ${match.canonical_id} has unconfirmed alignment status ${alignmentStatus}.`);
  }

  // 0. 核心定价要素前置强阻断检查 (Hard Block)
  if ((match.timing.stage === MatchStage.LIVE && (match.timing.minute === null || match.timing.minute === undefined)) ||
      ((match.timing.stage === MatchStage.LIVE || match.timing.stage === MatchStage.FINISHED) &&
        (match.score.home_score === null || match.score.home_score === undefined || match.score.away_score === null || match.score.away_score === undefined || !match.score.score_verified))) {
    collector?.record('UNPRICEABLE_MATCH', Layer03OpId.ORCHESTRATE_QUANT, 'RC-005', 'Core pricing data (minute or verified score) is missing. Cannot evaluate expected values.', undefined, match.canonical_id);
    throw new Error(`UNPRICEABLE_MATCH: Core pricing data is missing, blocking Quantitative Engine execution for match ${match.canonical_id}.`);
  }

  // 1. M2: 数据时效衰减与情境清洗
  const contextFeatures = extractCleanedContextFeatures(match, collector, tracer);

  // 1.1 Stage 1: 赛前多维关联理论先验合成 (首发 + 身价 + 伤停LIS + 近态同构 + MUI)
  const prematchPrior = synthesizePrematchPrior(match, contextFeatures, collector, tracer);

  // 1.2 Stage 1.1: 机构盘口博弈偏差检验与基准进球期望校准 (Shin去抽水 + 机构设防/诱盘姿态识别)
  const marketCalibration = calibrateWithMarketOdds(match, prematchPrior, collector, tracer);

  // 2. M3: 实时物理攻防与危攻时序微分
  const timelineFeatures = extractMomentumTimelineFeatures(match, collector, tracer);
  const physicalStatsFeatures = extractRealTimePhysicalStats(match, collector, tracer);

  // 2.5 M3.5: 战局势能与关键事件因果共生分析 (EPI 转化、战术相变与破门临界探测)
  const spatioTemporalFeatures = extractSpatioTemporalEventFeatures(
    match,
    timelineFeatures,
    physicalStatsFeatures,
    collector,
    tracer
  );
  const matchState = buildUnifiedMatchState(spatioTemporalFeatures, physicalStatsFeatures);

  // 3. M4: 滚球 0:0 Forward 泊松时间衰减推演 (注入博弈校准基准、物理场与战术相变乘子)
  const rawPoissonFeatures = calculateInPlayPoissonFeatures(
    match,
    contextFeatures,
    matchState,
    marketCalibration,
    undefined,
    collector,
    tracer
  );

  // 4. M5: 多源微观去抽水与四分之一盘复合 EV 仲裁
  const rawDevigFeatures = calculateDeviggedMarketFeatures(
    match,
    rawPoissonFeatures,
    collector,
    tracer
  );

  const rawConfidence = calculateConfidenceAndAlerts(
    contextFeatures,
    timelineFeatures,
    physicalStatsFeatures,
    rawDevigFeatures,
    match.timing.stage
  );
  const resolveProfile = (market: OosMarket): QuantCalibrationProfile | undefined =>
    options?.calibration_profile?.market === market
      ? options.calibration_profile
      : selectOosCalibrationProfile(options?.calibration_archive, match, market);
  const totalCalibrationProfile = resolveProfile('TOTAL_GOALS_MAIN');
  const totalCalibrationIsValidated = isValidatedOosProfile(totalCalibrationProfile);
  const poissonFeatures = totalCalibrationIsValidated
    ? calculateInPlayPoissonFeatures(match, contextFeatures, matchState, marketCalibration, totalCalibrationProfile, collector, tracer)
    : rawPoissonFeatures;
  const devigFeatures = totalCalibrationIsValidated
    ? calculateDeviggedMarketFeatures(match, poissonFeatures, collector, tracer)
    : rawDevigFeatures;

  // 5. 综合计算战场统治权指数 (BDI)
  const bdi = calculateBattlefieldDominanceIndex(matchState);

  // 6. 识别破门相变临界预警 (融合战局势能与事件临界)
  const goalPhase = matchState.imminent_goal
    ? GoalPhaseAlert.IMMINENT_GOAL : GoalPhaseAlert.NONE;

  // 7. 评估量化置信度与风控信号 (扣减机构诱盘/离散度惩罚)
  const { confidence_score, risk_flags, positive_ev_signals } = calculateConfidenceAndAlerts(
    contextFeatures,
    timelineFeatures,
    physicalStatsFeatures,
    devigFeatures,
    match.timing.stage
  );

  const resolved_positive_ev_signals = resolveMarketConflicts(positive_ev_signals, match, poissonFeatures.rest_score_matrix?.grid);

  let adjustedConfidence = Math.max(0, confidence_score - marketCalibration.market_confidence_penalty);
  if (match.timing.stage === MatchStage.LIVE && !physicalStatsFeatures.stats_available) {
    adjustedConfidence = Math.min(adjustedConfidence, 55);
  }
  if (spatioTemporalFeatures.live_threat_trinity.has_material_conflict) {
    adjustedConfidence = Math.min(adjustedConfidence, 65);
  }

  const metricAvailability = Object.values(physicalStatsFeatures.available_metrics)
    .filter((available) => available).length / Object.keys(physicalStatsFeatures.available_metrics).length;

  // 严禁假数据：按比赛阶段真实评估数据质量，赛前评估基本面维度真实齐备度，滚球评估客观攻防与动量波形
  const dataQualityScore = match.timing.stage === MatchStage.PREMATCH
    ? Math.round(100 * (
        0.40 * (match.reference?.lineups?.confirmed ? 1 : ((match.reference?.lineups?.home_starters?.length ?? 0) > 0 ? 0.6 : 0)) +
        0.35 * (match.reference?.league_standings?.has_data ? 1 : 0) +
        0.25 * (match.reference?.goal_distribution?.has_data ? 1 : 0)
      ))
    : Math.round(100 * (
        0.45 * metricAvailability +
        0.30 * (timelineFeatures.total_points > 0 ? 1 : 0) +
        0.25 * (match.score.score_verified ? 1 : 0)
      ));
  const modelStabilityScore = Math.round(100 * Math.max(0, Math.min(1,
    0.45 + 0.55 * Math.min(
      spatioTemporalFeatures.live_threat_trinity.home.alignment_score,
      spatioTemporalFeatures.live_threat_trinity.away.alignment_score
    ) - (spatioTemporalFeatures.goal_climax.post_goal_cooldown_active ? 0.20 : 0)
  )));
  const validatedSignalProfiles = resolved_positive_ev_signals
    .map((signal) => {
      const market = toOosMarket(signal);
      return { signal, profile: market === undefined ? undefined : resolveProfile(market) };
    })
    .filter((item): item is { signal: PositiveEVSignal; profile: ValidatedOosProfile } => hasValidatedOosProfile(item.profile));
  
  const sampleCount = validatedSignalProfiles.length;
  const MATURE_THRESHOLD = 200;
  const baseScore = Math.min(adjustedConfidence, dataQualityScore, modelStabilityScore);
  
  const historyScore = sampleCount > 0
    ? Math.round(Math.max(0, Math.min(100,
        Math.max(...validatedSignalProfiles.map(({ profile }) =>
          (adjustedConfidence - profile.oos_brier_score * 100) * Math.min(1, profile.effective_sample_size / 1000)
        ))
      )))
    : baseScore;

  const maturityRatio = Math.min(1.0, sampleCount / MATURE_THRESHOLD);
  const edgeConfidenceScore = Math.round((1 - maturityRatio) * baseScore + maturityRatio * historyScore);
  const screeningIntegrityScore = baseScore;

  const machineCandidateSignals =
    !poissonFeatures.is_stoppage_time_unpriceable &&
    (match.timing.stage !== MatchStage.LIVE || physicalStatsFeatures.stats_available) &&
    dataQualityScore >= 80 &&
    modelStabilityScore >= 70 &&
    !matchState.has_evidence_conflict &&
    !matchState.post_goal_cooldown_active
    ? resolved_positive_ev_signals : [];

  const finalRiskFlags = [...risk_flags];
  if (marketCalibration.market_stance === MarketStanceType.TRAP_INDUCEMENT) {
    if (!finalRiskFlags.includes(QuantAlert.TRAP_HIGH_ODDS_WARNING)) {
      finalRiskFlags.push(QuantAlert.TRAP_HIGH_ODDS_WARNING);
    }
  }

  // 若破门临界爆发，追加 GOAL_CLIMAX_TRIGGERED 警报
  if (spatioTemporalFeatures.goal_climax.is_imminent_threat) {
    if (!finalRiskFlags.includes(QuantAlert.GOAL_CLIMAX_TRIGGERED)) {
      finalRiskFlags.push(QuantAlert.GOAL_CLIMAX_TRIGGERED);
    }
  }

  const dataAudit = buildLayer03DataAudit(match, contextFeatures, timelineFeatures, physicalStatsFeatures);
  const productionGate = buildLayer03ProductionGate(
    match,
    dataAudit,
    validatedSignalProfiles.length > 0
  );
  const result: QuantitativeFeatures = Object.freeze({
    canonical_id: match.canonical_id,
    calculated_at: new Date().toISOString(),
    context: contextFeatures,
    prematch_prior: prematchPrior,
    market_calibration: marketCalibration,
    timeline: timelineFeatures,
    physical_stats: physicalStatsFeatures,
    poisson: poissonFeatures,
    devig: devigFeatures,
    spatio_temporal_events: spatioTemporalFeatures,
    match_state: matchState,
    battlefield_dominance_index: bdi,
    goal_phase_alert: goalPhase,
    raw_positive_ev_signals: positive_ev_signals,
    positive_ev_signals: machineCandidateSignals,
    risk_flags: finalRiskFlags,
    confidence_score: Math.min(screeningIntegrityScore, adjustedConfidence),
    confidence_breakdown: {
      data_quality_score: dataQualityScore,
      model_stability_score: modelStabilityScore,
      edge_confidence_score: edgeConfidenceScore
    },
    data_audit: dataAudit,
    production_gate: productionGate
  });

  tracer?.info(
    Layer03OpId.ORCHESTRATE_QUANT,
    'ORCHESTRATION_COMPLETE',
    `Layer 03 Quantitative orchestration completed. Screening integrity: ${screeningIntegrityScore}, BDI: ${bdi}`,
    {
      screening_integrity_score: screeningIntegrityScore,
      data_quality_score: dataQualityScore,
      model_stability_score: modelStabilityScore,
      edge_confidence_score: edgeConfidenceScore,
      bdi,
      goal_phase_alert: goalPhase,
      raw_positive_ev_count: positive_ev_signals.length,
      machine_candidate_count: machineCandidateSignals.length
    },
    match.canonical_id
  );

  return result;
}


## 状态机重构后的最终契约

修复后，`raw_positive_ev_signals` 与生产候选严格分轨。每条原始 +EV 必须逐条完成 OOS 校验；只有 `VALIDATED` 且 `effective_sample_size >= 200` 的信号才允许进入 machine candidate。无 OOS 时 `edge_confidence_score` 不再回退到 `baseScore`，而是锁定为 0。

生产状态统一由 `candidate_pipeline` 驱动：`NO_POSITIVE_EV → OOS_LOCKED → DATA_LOCKED → PRODUCTION_UNLOCKED`。`production_gate` 不再单独推断 OOS 是否存在，而是消费同一候选状态机结果，从而消除 `machineCandidateSignals` 与 `candidate_status` 不一致的旁路。
