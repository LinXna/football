/**
 * 01 数据接入层 - 雷速 (Leisu) 专属枚举分类管理 (enums.ts)
 * 
 * 核心架构准则：
 * 1. 模块化枚举管理：雷速模块的所有枚举统一在专属 enums.ts 中分类管理维护
 * 2. 异常自动捕获：通过公共 commonEnumRegistry 统一代理，发现未登记代码自动上报告警总线与弹窗中心
 */

import { commonEnumRegistry, UnknownEnumReport } from "../../00_common/errors";

// ==========================================
// 1. 比赛进行与生命周期状态枚举 (Match Life Cycle Status)
// ==========================================

export enum LeisuMatchStatus {
  NOT_STARTED = 1,       // 未开赛
  FIRST_HALF = 2,        // 上半场
  HALF_TIME = 3,         // 中场休息
  SECOND_HALF = 4,       // 下半场
  OVERTIME = 5,          // 加时赛
  PENALTY_SHOOTOUT = 7,  // 点球大战
  FINISHED = 8,          // 完场
  POSTPONED = 9,         // 比赛推迟
  INTERRUPTED = 10,      // 比赛中断
  CANCELLED_CUT = 11,    // 比赛腰斩
  CANCELLED = 12,        // 比赛取消
}

export const LEISU_MATCH_STATUS_NAMES: Record<number, string> = {
  [LeisuMatchStatus.NOT_STARTED]: "未开赛",
  [LeisuMatchStatus.FIRST_HALF]: "上半场",
  [LeisuMatchStatus.HALF_TIME]: "中场",
  [LeisuMatchStatus.SECOND_HALF]: "下半场",
  [LeisuMatchStatus.OVERTIME]: "加时赛",
  [LeisuMatchStatus.PENALTY_SHOOTOUT]: "点球大战",
  [LeisuMatchStatus.FINISHED]: "完场",
  [LeisuMatchStatus.POSTPONED]: "推迟",
  [LeisuMatchStatus.INTERRUPTED]: "中断",
  [LeisuMatchStatus.CANCELLED_CUT]: "腰斩",
  [LeisuMatchStatus.CANCELLED]: "取消",
};

// ==========================================
// 2. 比赛触发方与方位枚举 (Match Side / Position)
// ==========================================

export enum LeisuMatchSide {
  HOME = "home",       // 主队
  AWAY = "away",       // 客队
  NEUTRAL = "neutral", // 中立 / 裁判 / 赛场系统
}

export const LEISU_MATCH_SIDE_NAMES: Record<LeisuMatchSide, string> = {
  [LeisuMatchSide.HOME]: "主队",
  [LeisuMatchSide.AWAY]: "客队",
  [LeisuMatchSide.NEUTRAL]: "中立",
};

// ==========================================
// 2.1 赛事/联赛 ID 与名称字典枚举 (Competition / League Directory)
// ==========================================

export enum LeisuKnownCompetitionId {
  PREMIER_LEAGUE = 82,      // 英超
  CHAMPIONSHIP = 83,        // 英冠
  LEAGUE_ONE = 84,          // 英甲
  LEAGUE_TWO = 85,          // 英乙
  EFL_TROPHY = 100,         // 英锦赛 (英格兰联赛锦标赛)
  FA_CUP = 98,              // 足总杯
  EFL_CUP = 99,             // 英联杯
  LA_LIGA = 120,            // 西甲
  LA_LIGA_2 = 121,          // 西乙
  SERIE_A = 135,            // 意甲
  SERIE_B = 136,            // 意乙
  BUNDESLIGA = 129,         // 德甲
  BUNDESLIGA_2 = 130,       // 德乙
  LIGUE_1 = 142,            // 法甲
  LIGUE_2 = 143,            // 法乙
  CHAMPIONS_LEAGUE = 160,   // 欧冠
  EUROPA_LEAGUE = 161,      // 欧联杯
  CONFERENCE_LEAGUE = 162,  // 欧协联
  CONFERENCE_LEAGUE_ALT = 3265, // 欧协联 (新周期代码)
  COPA_DEL_REY = 125,       // 国王杯
  CLUB_FRIENDLIES = 24,     // 球会友谊
  CHINESE_SUPER = 210,      // 中超
  J1_LEAGUE = 230,          // 日职联
  K_LEAGUE_1 = 240,         // 韩K联
}

export const LEISU_COMPETITION_NAMES: Record<number, string> = {
  [LeisuKnownCompetitionId.PREMIER_LEAGUE]: "英超",
  [LeisuKnownCompetitionId.CHAMPIONSHIP]: "英冠",
  [LeisuKnownCompetitionId.LEAGUE_ONE]: "英甲",
  [LeisuKnownCompetitionId.LEAGUE_TWO]: "英乙",
  [LeisuKnownCompetitionId.EFL_TROPHY]: "英锦赛",
  [LeisuKnownCompetitionId.FA_CUP]: "足总杯",
  [LeisuKnownCompetitionId.EFL_CUP]: "英联杯",
  [LeisuKnownCompetitionId.LA_LIGA]: "西甲",
  [LeisuKnownCompetitionId.LA_LIGA_2]: "西乙",
  [LeisuKnownCompetitionId.COPA_DEL_REY]: "国王杯",
  [LeisuKnownCompetitionId.SERIE_A]: "意甲",
  [LeisuKnownCompetitionId.SERIE_B]: "意乙",
  [LeisuKnownCompetitionId.BUNDESLIGA]: "德甲",
  [LeisuKnownCompetitionId.BUNDESLIGA_2]: "德乙",
  [LeisuKnownCompetitionId.LIGUE_1]: "法甲",
  [LeisuKnownCompetitionId.LIGUE_2]: "法乙",
  [LeisuKnownCompetitionId.CHAMPIONS_LEAGUE]: "欧冠",
  [LeisuKnownCompetitionId.EUROPA_LEAGUE]: "欧联杯",
  [LeisuKnownCompetitionId.CONFERENCE_LEAGUE]: "欧协联",
  [LeisuKnownCompetitionId.CONFERENCE_LEAGUE_ALT]: "欧协联",
  [LeisuKnownCompetitionId.CLUB_FRIENDLIES]: "球会友谊",
  [LeisuKnownCompetitionId.CHINESE_SUPER]: "中超",
  [LeisuKnownCompetitionId.J1_LEAGUE]: "日职联",
  [LeisuKnownCompetitionId.K_LEAGUE_1]: "韩K联",
};

// ==========================================
// 2.2 球队 ID 与名称字典枚举 (Team Directory)
// ==========================================

export enum LeisuKnownTeamId {
  SHEFFIELD_WED = 10101,    // 谢周三
  BRADFORD_CITY = 10102,    // 布拉德福德
  RAYO_VALLECANO = 11845,   // 巴列卡诺
  ALAVES = 10646,           // 阿拉维斯
  BOLTON = 10007,           // 博尔顿
  LEYTON_ORIENT = 12503,    // 莱顿东方
  OLDHAM = 10497,           // 奥尔德姆
  ACCRINGTON = 10861,       // 阿克灵顿
  PRESTON = 10174,          // 普雷斯顿
  MAN_UNITED = 10001,       // 曼联
  LIVERPOOL = 10002,        // 利物浦
  CHELSEA = 10003,          // 切尔西
  TOTTENHAM = 10004,        // 托特纳姆热刺
  ARSENAL = 10005,          // 阿森纳
  MAN_CITY = 10006,         // 曼城
  REAL_MADRID = 10217,      // 皇家马德里
  BARCELONA = 10015,        // 巴塞罗那
  ATLETICO_MADRID = 10251,  // 马德里竞技
  ATHLETIC_BILBAO = 10027,  // 毕尔巴鄂竞技
  REAL_BETIS = 10029,       // 皇家贝蒂斯
  REAL_SOCIEDAD = 10034,    // 皇家社会
  ESPANYOL = 10220,         // 西班牙人
  MALLORCA = 10326,         // 皇家马略卡
  OSASUNA = 10749,          // 奥萨苏纳
  CELTA_VIGO = 10371,       // 塞尔塔
  GRANADA = 10044,          // 格拉纳达
  LEVANTE = 10458,          // 莱万特
  OVIEDO = 11847,           // 皇家奥维耶多
  RACING_SANTANDER = 10221, // 桑坦德竞技
  CASTELLON = 12097,        // 卡斯迪隆
  EIBAR = 10035,            // 埃瓦尔
  BAYERN_MUNICH = 10301,    // 拜仁慕尼黑
  PSG = 10401,              // 巴黎圣日耳曼
  INTER_MILAN = 10501,      // 国际米兰
  AC_MILAN = 10502,         // AC米兰
  JUVENTUS = 10503,         // 尤文图斯
}

export const LEISU_TEAM_NAMES: Record<number, string> = {
  [LeisuKnownTeamId.SHEFFIELD_WED]: "谢周三",
  [LeisuKnownTeamId.BRADFORD_CITY]: "布拉德福德",
  [LeisuKnownTeamId.RAYO_VALLECANO]: "巴列卡诺",
  [LeisuKnownTeamId.ALAVES]: "阿拉维斯",
  [LeisuKnownTeamId.BOLTON]: "博尔顿",
  [LeisuKnownTeamId.LEYTON_ORIENT]: "莱顿东方",
  [LeisuKnownTeamId.OLDHAM]: "奥尔德姆",
  [LeisuKnownTeamId.ACCRINGTON]: "阿克灵顿",
  [LeisuKnownTeamId.PRESTON]: "普雷斯顿",
  [LeisuKnownTeamId.MAN_UNITED]: "曼联",
  [LeisuKnownTeamId.LIVERPOOL]: "利物浦",
  [LeisuKnownTeamId.CHELSEA]: "切尔西",
  [LeisuKnownTeamId.TOTTENHAM]: "托特纳姆热刺",
  [LeisuKnownTeamId.ARSENAL]: "阿森纳",
  [LeisuKnownTeamId.MAN_CITY]: "曼城",
  [LeisuKnownTeamId.REAL_MADRID]: "皇家马德里",
  [LeisuKnownTeamId.BARCELONA]: "巴塞罗那",
  [LeisuKnownTeamId.ATLETICO_MADRID]: "马德里竞技",
  [LeisuKnownTeamId.ATHLETIC_BILBAO]: "毕尔巴鄂竞技",
  [LeisuKnownTeamId.REAL_BETIS]: "皇家贝蒂斯",
  [LeisuKnownTeamId.REAL_SOCIEDAD]: "皇家社会",
  [LeisuKnownTeamId.ESPANYOL]: "西班牙人",
  [LeisuKnownTeamId.MALLORCA]: "皇家马略卡",
  [LeisuKnownTeamId.OSASUNA]: "奥萨苏纳",
  [LeisuKnownTeamId.CELTA_VIGO]: "塞尔塔",
  [LeisuKnownTeamId.GRANADA]: "格拉纳达",
  [LeisuKnownTeamId.LEVANTE]: "莱万特",
  [LeisuKnownTeamId.OVIEDO]: "皇家奥维耶多",
  [LeisuKnownTeamId.RACING_SANTANDER]: "桑坦德竞技",
  [LeisuKnownTeamId.CASTELLON]: "卡斯迪隆",
  [LeisuKnownTeamId.EIBAR]: "埃瓦尔",
  [LeisuKnownTeamId.BAYERN_MUNICH]: "拜仁慕尼黑",
  [LeisuKnownTeamId.PSG]: "巴黎圣日耳曼",
  [LeisuKnownTeamId.INTER_MILAN]: "国际米兰",
  [LeisuKnownTeamId.AC_MILAN]: "AC米兰",
  [LeisuKnownTeamId.JUVENTUS]: "尤文图斯",
};

// ==========================================
// 3. 球员阵容出场与伤停状态枚举 (Player Lineup & Availability Status)
// ==========================================

export enum LeisuPlayerStatus {
  STARTER = 1,         // 首发出场
  SUBSTITUTE = 0,      // 替补待命
  INJURED_ABSENT = 2,  // 伤停缺阵
  SUSPENDED = 3,       // 停赛缺阵
  UNKNOWN = -1,        // 未知状态
}

export const LEISU_PLAYER_STATUS_NAMES: Record<number, string> = {
  [LeisuPlayerStatus.STARTER]: "首发",
  [LeisuPlayerStatus.SUBSTITUTE]: "替补",
  [LeisuPlayerStatus.INJURED_ABSENT]: "伤停",
  [LeisuPlayerStatus.SUSPENDED]: "停赛",
  [LeisuPlayerStatus.UNKNOWN]: "未指定",
};

// ==========================================
// 4. 球员场上位置简码枚举 (Player Position Code)
// ==========================================

export enum LeisuPlayerPositionCode {
  GOALKEEPER = "G",  // 守门员
  DEFENDER = "D",    // 后卫
  MIDFIELDER = "M",  // 中场
  FORWARD = "F",     // 前锋
  UNKNOWN = "U",     // 未知
}

export const LEISU_PLAYER_POSITION_NAMES: Record<string, string> = {
  [LeisuPlayerPositionCode.GOALKEEPER]: "守门员",
  [LeisuPlayerPositionCode.DEFENDER]: "后卫",
  [LeisuPlayerPositionCode.MIDFIELDER]: "中场",
  [LeisuPlayerPositionCode.FORWARD]: "前锋",
  [LeisuPlayerPositionCode.UNKNOWN]: "未知",
};

// ==========================================
// 5. 文字直播时序事件类型枚举 (Timeline Event Type)
// ==========================================

export enum LeisuTimelineEventType {
  SYSTEM_NOTICE = 0,        // 系统提示 / 准备
  GOAL = 1,                 // 进球
  CORNER = 2,               // 角球
  YELLOW_CARD = 3,          // 黄牌
  RED_CARD = 4,             // 直接红牌
  OFFSIDE = 5,              // 越位
  SUBSTITUTION = 9,         // 换人
  KICK_OFF = 10,            // 开球 (上半场/下半场)
  HALF_TIME_WHISTLE = 11,   // 半场结束哨
  FULL_TIME_WHISTLE = 12,   // 全场结束哨
  PENALTY_MISSED = 16,      // 射失点球
  SHOT_ON_TARGET = 21,      // 射正
  SHOT_OFF_TARGET = 22,     // 射偏
  TWO_YELLOW_TO_RED = 23,   // 两黄变红
  VAR_INCIDENT = 28,        // VAR 核查
  FOUL = 30,                // 犯规
}

export const LEISU_TIMELINE_EVENT_NAMES: Record<number, string> = {
  [LeisuTimelineEventType.SYSTEM_NOTICE]: "系统提示/准备",
  [LeisuTimelineEventType.GOAL]: "进球",
  [LeisuTimelineEventType.CORNER]: "角球",
  [LeisuTimelineEventType.YELLOW_CARD]: "黄牌",
  [LeisuTimelineEventType.RED_CARD]: "红牌",
  [LeisuTimelineEventType.OFFSIDE]: "越位",
  [LeisuTimelineEventType.SUBSTITUTION]: "换人",
  [LeisuTimelineEventType.KICK_OFF]: "开球",
  [LeisuTimelineEventType.HALF_TIME_WHISTLE]: "半场结束",
  [LeisuTimelineEventType.FULL_TIME_WHISTLE]: "全场结束",
  [LeisuTimelineEventType.PENALTY_MISSED]: "点球射失",
  [LeisuTimelineEventType.SHOT_ON_TARGET]: "射正",
  [LeisuTimelineEventType.SHOT_OFF_TARGET]: "射偏",
  [LeisuTimelineEventType.TWO_YELLOW_TO_RED]: "两黄变红",
  [LeisuTimelineEventType.VAR_INCIDENT]: "VAR核查",
  [LeisuTimelineEventType.FOUL]: "犯规",
};

// ==========================================
// 6. 球员个人事件类型枚举 (Player Incident Type - 独立命名空间)
// ==========================================

export enum LeisuPlayerIncidentType {
  GOAL = 1,                 // 进球
  YELLOW_CARD = 3,          // 黄牌
  RED_CARD = 4,             // 红牌
  SAVE = 8,                 // 门将扑救 / 关键解围
  INJURY_SUB = 9,           // 受伤换下
  PENALTY_MISSED = 16,      // 射失点球
  TWO_YELLOW_TO_RED = 23,   // 两黄变红
  SPECIAL_EVENT = 28,       // 关键技术事件
  ASSIST = 99,              // 助攻
}

export const LEISU_PLAYER_INCIDENT_NAMES: Record<number, string> = {
  [LeisuPlayerIncidentType.GOAL]: "进球",
  [LeisuPlayerIncidentType.YELLOW_CARD]: "黄牌",
  [LeisuPlayerIncidentType.RED_CARD]: "红牌",
  [LeisuPlayerIncidentType.SAVE]: "扑救",
  [LeisuPlayerIncidentType.INJURY_SUB]: "受伤换人",
  [LeisuPlayerIncidentType.PENALTY_MISSED]: "射失点球",
  [LeisuPlayerIncidentType.TWO_YELLOW_TO_RED]: "两黄变红",
  [LeisuPlayerIncidentType.SPECIAL_EVENT]: "特殊事件",
  [LeisuPlayerIncidentType.ASSIST]: "助攻",
};

export type { UnknownEnumReport };

/**
 * 雷速专属枚举管理器 (Leisu Enum Manager)
 */
class LeisuEnumManager {
  private dynamicTeamMap: Map<number, string> = new Map();
  private dynamicCompetitionMap: Map<number, string> = new Map();

  /**
   * 解析比赛状态
   */
  public resolveMatchStatus(code: number | null | undefined, context?: string): { code: LeisuMatchStatus; name: string; is_known: boolean } {
    if (code !== null && code !== undefined && LEISU_MATCH_STATUS_NAMES[code]) {
      return { code: code as LeisuMatchStatus, name: LEISU_MATCH_STATUS_NAMES[code], is_known: true };
    }
    const rawCode = code ?? -1;
    commonEnumRegistry.recordUnknownEnum({
      category: "leisu_match_status",
      raw_code: rawCode,
      sample_context: context,
      module: "LeisuEnumManager",
      trigger_popup: false,
    });
    return { code: rawCode as LeisuMatchStatus, name: `未知状态(${rawCode})`, is_known: false };
  }

  /**
   * 解析文字直播事件类型
   */
  public resolveTimelineEventType(code: number, sampleText?: string): { code: number; name: string; is_known: boolean } {
    if (LEISU_TIMELINE_EVENT_NAMES[code]) {
      return { code, name: LEISU_TIMELINE_EVENT_NAMES[code], is_known: true };
    }
    commonEnumRegistry.recordUnknownEnum({
      category: "leisu_timeline_event",
      raw_code: code,
      sample_context: sampleText,
      module: "LeisuEnumManager",
      trigger_popup: true,
    });
    return { code, name: `未知事件(${code})`, is_known: false };
  }

  /**
   * 解析球员个人事件类型
   */
  public resolvePlayerIncidentType(code: number, desc?: string): { code: number; name: string; is_known: boolean } {
    if (LEISU_PLAYER_INCIDENT_NAMES[code]) {
      return { code, name: LEISU_PLAYER_INCIDENT_NAMES[code], is_known: true };
    }
    commonEnumRegistry.recordUnknownEnum({
      category: "leisu_player_incident",
      raw_code: code,
      sample_context: desc,
      module: "LeisuEnumManager",
      trigger_popup: true,
    });
    return { code, name: `未知事件(${code})`, is_known: false };
  }

  /**
   * 解析球员阵容与出场/伤停状态
   */
  public resolvePlayerStatus(
    statusCode: number | null | undefined,
    context?: { isStarter?: boolean; isInjury?: boolean; isSuspended?: boolean; playerName?: string }
  ): { code: LeisuPlayerStatus; name: string; is_known: boolean } {
    if (context?.isSuspended) {
      return { code: LeisuPlayerStatus.SUSPENDED, name: LEISU_PLAYER_STATUS_NAMES[LeisuPlayerStatus.SUSPENDED], is_known: true };
    }
    if (context?.isInjury) {
      const code = statusCode === 3 ? LeisuPlayerStatus.SUSPENDED : LeisuPlayerStatus.INJURED_ABSENT;
      return { code, name: LEISU_PLAYER_STATUS_NAMES[code], is_known: true };
    }
    if (statusCode === null || statusCode === undefined) {
      if (context?.isStarter === true) {
        return { code: LeisuPlayerStatus.STARTER, name: LEISU_PLAYER_STATUS_NAMES[LeisuPlayerStatus.STARTER], is_known: true };
      }
      if (context?.isStarter === false) {
        return { code: LeisuPlayerStatus.SUBSTITUTE, name: LEISU_PLAYER_STATUS_NAMES[LeisuPlayerStatus.SUBSTITUTE], is_known: true };
      }
      return { code: LeisuPlayerStatus.UNKNOWN, name: LEISU_PLAYER_STATUS_NAMES[LeisuPlayerStatus.UNKNOWN], is_known: true };
    }

    if (LEISU_PLAYER_STATUS_NAMES[statusCode]) {
      return { code: statusCode as LeisuPlayerStatus, name: LEISU_PLAYER_STATUS_NAMES[statusCode], is_known: true };
    }

    commonEnumRegistry.recordUnknownEnum({
      category: "leisu_player_status",
      raw_code: statusCode,
      sample_context: context?.playerName,
      module: "LeisuEnumManager",
      trigger_popup: true,
    });
    return { code: statusCode as LeisuPlayerStatus, name: `未知状态(${statusCode})`, is_known: false };
  }

  /**
   * 智能解析赛事 ID 与名称 (附带缺省回退与自动学习)
   * 1. 若静态字典存在 ID 则取标准名；
   * 2. 若动态自学习库中存在则直接取用；
   * 3. 若数据源提供了原始名称，则系统自动吸收登记进动态库，标记为已知赛事 (无需人工干预)；
   * 4. 只有既无静态收录、又无动态收录、且数据源未提供名称时，才作为真正异常上报
   */
  public resolveCompetition(
    competitionId: number | null | undefined,
    fallbackName?: string | null
  ): { id: number | null; name: string; is_known: boolean } {
    const rawName = fallbackName ? String(fallbackName).trim() : "";
    if (competitionId !== null && competitionId !== undefined) {
      if (LEISU_COMPETITION_NAMES[competitionId]) {
        return { id: competitionId, name: LEISU_COMPETITION_NAMES[competitionId], is_known: true };
      }
      if (this.dynamicCompetitionMap.has(competitionId)) {
        return { id: competitionId, name: this.dynamicCompetitionMap.get(competitionId)!, is_known: false };
      }
      // 数据源自带名称：系统自动学习入库，无需用户手动维护
      if (rawName) {
        this.dynamicCompetitionMap.set(competitionId, rawName);
        return { id: competitionId, name: rawName, is_known: false };
      }
      // 真正的孤儿未知赛事 ID (既未收录又无名称)
      commonEnumRegistry.recordUnknownEnum({
        category: "leisu_competition",
        raw_code: competitionId,
        sample_context: undefined,
        module: "LeisuEnumManager",
        trigger_popup: false,
      });
      return {
        id: competitionId,
        name: `赛事(${competitionId})`,
        is_known: false,
      };
    }

    // ID 为空，仅有名称
    if (rawName) {
      return { id: null, name: rawName, is_known: true };
    }

    return { id: null, name: "未指定赛事", is_known: false };
  }

  /**
   * 智能解析球队 ID 与名称 (附带缺省回退与自动学习)
   * 1. 若静态字典存在 ID 则取标准名；
   * 2. 若动态自学习库中存在则直接取用；
   * 3. 若数据源提供了原始名称，则系统自动吸收登记进动态库，标记为已知球队 (无需人工干预)；
   * 4. 只有既无静态收录、又无动态收录、且数据源未提供名称时，才作为真正异常上报
   */
  public resolveTeam(
    teamId: number | null | undefined,
    fallbackName?: string | null
  ): { id: number | null; name: string; is_known: boolean } {
    const rawName = fallbackName ? String(fallbackName).trim() : "";
    if (teamId !== null && teamId !== undefined) {
      if (LEISU_TEAM_NAMES[teamId]) {
        return { id: teamId, name: LEISU_TEAM_NAMES[teamId], is_known: true };
      }
      if (this.dynamicTeamMap.has(teamId)) {
        return { id: teamId, name: this.dynamicTeamMap.get(teamId)!, is_known: false };
      }
      // 数据源自带名称：系统自动学习入库，无需用户手动维护
      if (rawName) {
        this.dynamicTeamMap.set(teamId, rawName);
        return { id: teamId, name: rawName, is_known: false };
      }
      // 真正的孤儿未知球队 ID (既未收录又无名称)
      commonEnumRegistry.recordUnknownEnum({
        category: "leisu_team",
        raw_code: teamId,
        sample_context: undefined,
        module: "LeisuEnumManager",
        trigger_popup: false,
      });
      return {
        id: teamId,
        name: `球队(${teamId})`,
        is_known: false,
      };
    }

    // ID 为空，仅有名称
    if (rawName) {
      return { id: null, name: rawName, is_known: true };
    }

    return { id: null, name: "未指定球队", is_known: false };
  }

  /**
   * 获取当前收集到的所有未登记枚举报告
   */
  public getUnknownReports(): UnknownEnumReport[] {
    return commonEnumRegistry.getAllUnknownReports();
  }

  /**
   * 清除收集缓存（供单元测试使用）
   */
  public clearUnknownReports(): void {
    commonEnumRegistry.clear();
  }
}

export const leisuEnumManager = new LeisuEnumManager();
