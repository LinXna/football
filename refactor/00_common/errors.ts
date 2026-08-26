/**
 * 足球量化系统统一异常与通知框架 (Common Error & Alert Framework)
 * 
 * 核心设计原则：
 * 1. 统一异常基类与错误代码分类管理 (Domain Error Hierarchy & Error Codes)
 * 2. 统一未知/异常枚举捕获与上报中心 (Unknown Enum Registry & Alert Bus)
 * 3. 统一 UI 弹窗/通知总线适配器 (UI Notification Adapter)，支持静默收集、控制台告警与 UI 弹窗提示
 * 4. 严禁各模块散落私有 try-catch 弹窗逻辑，所有异常必须走本公共模块！
 */

// ==========================================
// 1. 错误大类与状态码枚举 (System Error Codes)
// ==========================================

export enum SystemErrorCode {
  // 1000~1999: 数据接入与解析错误 (Data Ingestion & Parsing)
  UNKNOWN_ENUM_TYPE = 1001,       // 未知枚举代码
  INVALID_JSON_STRUCTURE = 1002,   // 非法或损坏的 JSON 结构
  MISSING_REQUIRED_FIELD = 1003,   // 缺失核心必填字段
  UNVERIFIED_SCORE = 1004,         // 比分未经过可靠核验
  TIME_PARSING_FAILED = 1005,      // 开赛时间解析失败

  // 2000~2999: 实体对齐与赛事匹配错误 (Entity Matching)
  MATCH_ALIGNMENT_FAILED = 2001,   // 赛事无法可靠匹配
  AMBIGUOUS_TEAM_NAME = 2002,      // 队伍别名冲突歧义
  SCORE_MISMATCH_ALERT = 2003,     // 双源比分冲突

  // 3000~3999: 量化计算与领域算法错误 (Quantitative Engine)
  ODDS_IMPLIED_PROB_OVERFLOW = 3001, // 赔率溢出或隐含概率异常
  POISSON_DECAY_CALC_FAILED = 3002,  // 泊松时间衰减推演异常
  ZERO_DIVISION_IN_QUANT = 3003,     // 量化计算除零异常

  // 4000~4999: 投资风控与台账错误 (Risk Control & Ledger)
  GRADE_A_LIMIT_EXCEEDED = 4001,   // 违反 A/B 级跨串限制
  CORRELATED_RISK_VIOLATION = 4002, // 串关相关性风控拦截
  LEDGER_WRITE_LOCK_FAILED = 4003, // 台账并发写入锁竞争失败
  INVALID_SETTLEMENT_RULE = 4004,  // 非法盘口结算规则
}

export type ErrorSeverity = "info" | "warning" | "error" | "critical";

// ==========================================
// 2. 统一领域异常基类 (Domain Base Error)
// ==========================================

export class DomainError extends Error {
  public readonly code: SystemErrorCode;
  public readonly severity: ErrorSeverity;
  public readonly module: string;
  public readonly payload?: Record<string, unknown>;
  public readonly timestamp: string;

  constructor(options: {
    code: SystemErrorCode;
    message: string;
    module: string;
    severity?: ErrorSeverity;
    payload?: Record<string, unknown>;
  }) {
    super(`[${options.module}] [ERR_${options.code}] ${options.message}`);
    this.name = "DomainError";
    this.code = options.code;
    this.module = options.module;
    this.severity = options.severity || "error";
    this.payload = options.payload;
    this.timestamp = new Date().toISOString();
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ==========================================
// 3. 统一告警事件定义与订阅总线 (Alert Bus)
// ==========================================

export interface SystemAlertEvent {
  id: string;
  code: SystemErrorCode;
  severity: ErrorSeverity;
  module: string;
  title: string;
  message: string;
  payload?: Record<string, unknown>;
  timestamp: string;
  requires_ui_popup: boolean; // 是否需要前端弹窗提示
}

export type AlertListener = (event: SystemAlertEvent) => void;

class SystemAlertBus {
  private static instance: SystemAlertBus;
  private listeners: Set<AlertListener> = new Set();
  private alertHistory: SystemAlertEvent[] = [];
  private readonly MAX_HISTORY = 500;

  private constructor() {}

  public static getInstance(): SystemAlertBus {
    if (!SystemAlertBus.instance) {
      SystemAlertBus.instance = new SystemAlertBus();
    }
    return SystemAlertBus.instance;
  }

  /**
   * 注册告警监听器（例如 UI 弹窗组件、控制台 logger）
   */
  public subscribe(listener: AlertListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 触发并广播一个系统告警/异常事件
   */
  public publish(alert: Omit<SystemAlertEvent, "id" | "timestamp">): SystemAlertEvent {
    const fullAlert: SystemAlertEvent = {
      ...alert,
      id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
    };

    // 记录历史
    this.alertHistory.unshift(fullAlert);
    if (this.alertHistory.length > this.MAX_HISTORY) {
      this.alertHistory.pop();
    }

    // 控制台输出
    const logPrefix = `[${fullAlert.severity.toUpperCase()}] [${fullAlert.module}]`;
    if (fullAlert.severity === "critical" || fullAlert.severity === "error") {
      console.error(`${logPrefix} ${fullAlert.title}: ${fullAlert.message}`, fullAlert.payload || "");
    } else if (fullAlert.severity === "warning") {
      console.warn(`${logPrefix} ${fullAlert.title}: ${fullAlert.message}`, fullAlert.payload || "");
    } else {
      console.info(`${logPrefix} ${fullAlert.title}: ${fullAlert.message}`, fullAlert.payload || "");
    }

    // 广播给所有订阅者（UI 弹窗等）
    for (const listener of this.listeners) {
      try {
        listener(fullAlert);
      } catch (err) {
        console.error("Error in alert listener execution:", err);
      }
    }

    return fullAlert;
  }

  /**
   * 获取告警历史
   */
  public getHistory(): SystemAlertEvent[] {
    return [...this.alertHistory];
  }

  /**
   * 清空历史
   */
  public clearHistory(): void {
    this.alertHistory = [];
  }
}

export const systemAlertBus = SystemAlertBus.getInstance();

// ==========================================
// 4. 通用未知枚举收集与告警处理器 (Generic Unknown Enum Collector)
// ==========================================

export interface UnknownEnumReport {
  category: string;       // 枚举所属分类（如 "leisu_timeline_event", "ybty_market_type"）
  raw_code: number | string; // 未收录的原始代码或标识
  sample_context?: string; // 现场文本或上下文
  first_seen_at: string;  // 首次发现时间
  count: number;          // 出现频次
}

export class CommonEnumRegistry {
  private static instance: CommonEnumRegistry;
  private unknownMap: Map<string, UnknownEnumReport> = new Map();

  private constructor() {}

  public static getInstance(): CommonEnumRegistry {
    if (!CommonEnumRegistry.instance) {
      CommonEnumRegistry.instance = new CommonEnumRegistry();
    }
    return CommonEnumRegistry.instance;
  }

  /**
   * 记录未知枚举并自动向系统总线广播告警
   */
  public recordUnknownEnum(options: {
    category: string;
    raw_code: number | string;
    sample_context?: string;
    module: string;
    trigger_popup?: boolean;
  }): UnknownEnumReport {
    const key = `${options.category}::${options.raw_code}`;
    let report = this.unknownMap.get(key);

    if (report) {
      report.count += 1;
    } else {
      report = {
        category: options.category,
        raw_code: options.raw_code,
        sample_context: options.sample_context,
        first_seen_at: new Date().toISOString(),
        count: 1,
      };
      this.unknownMap.set(key, report);

      // 首次发现时，自动向全局总线广播告警，支持触发弹窗
      systemAlertBus.publish({
        code: SystemErrorCode.UNKNOWN_ENUM_TYPE,
        severity: "warning",
        module: options.module,
        title: `发现未收录的未知枚举: ${options.category}`,
        message: `枚举分类 [${options.category}] 出现未登记的代码: "${options.raw_code}" (样本: "${options.sample_context || '无'}")，请在枚举字典中补充登记！`,
        payload: {
          category: options.category,
          raw_code: options.raw_code,
          context: options.sample_context,
        },
        requires_ui_popup: options.trigger_popup ?? true,
      });
    }

    return report;
  }

  /**
   * 获取所有未登记枚举报告
   */
  public getAllUnknownReports(): UnknownEnumReport[] {
    return Array.from(this.unknownMap.values());
  }

  /**
   * 清空收集记录（主要用于单元测试）
   */
  public clear(): void {
    this.unknownMap.clear();
  }
}

export const commonEnumRegistry = CommonEnumRegistry.getInstance();
