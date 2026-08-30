/**
 * Layer 00: 结构化追踪日志器 (Structured Execution Tracer)
 * 算子编号: [OP-00-01]
 * 规则绑定: [RC-SYS] 统一结构化日志规范
 * 
 * 强制输出规范：[ISO-Time][Level][OP-XXX][RC-XXX][MATCH:ID] Message + JSON Payload
 * 杜绝全系统无上下文的裸 console.log / console.error
 */

export type TraceLogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface TraceEntry {
  timestamp: string;
  level: TraceLogLevel;
  operatorId: string;
  ruleId: string;
  matchId?: string | number;
  message: string;
  payload?: unknown;
}

export class Tracer {
  private static instance: Tracer;
  private logs: TraceEntry[] = [];
  private isSilent: boolean = false;

  private constructor() {}

  public static getInstance(): Tracer {
    if (!Tracer.instance) {
      Tracer.instance = new Tracer();
    }
    return Tracer.instance;
  }

  public setSilent(silent: boolean): void {
    this.isSilent = silent;
  }

  public log(
    level: TraceLogLevel,
    operatorId: string,
    ruleId: string,
    message: string,
    payload?: unknown,
    matchId?: string | number
  ): TraceEntry {
    const entry: TraceEntry = {
      timestamp: new Date().toISOString(),
      level,
      operatorId,
      ruleId,
      matchId,
      message,
      payload,
    };

    this.logs.push(entry);

    if (!this.isSilent) {
      const matchPrefix = matchId !== undefined ? `[MATCH:${matchId}]` : '';
      const formatted = `[${entry.timestamp}][${level}][${operatorId}][${ruleId}]${matchPrefix} ${message}`;
      
      switch (level) {
        case 'ERROR':
          console.error(formatted, payload !== undefined ? payload : '');
          break;
        case 'WARN':
          console.warn(formatted, payload !== undefined ? payload : '');
          break;
        case 'INFO':
          console.info(formatted, payload !== undefined ? payload : '');
          break;
        case 'DEBUG':
          console.debug(formatted, payload !== undefined ? payload : '');
          break;
      }
    }

    return entry;
  }

  public debug(operatorId: string, ruleId: string, message: string, payload?: unknown, matchId?: string | number): TraceEntry {
    return this.log('DEBUG', operatorId, ruleId, message, payload, matchId);
  }

  public info(operatorId: string, ruleId: string, message: string, payload?: unknown, matchId?: string | number): TraceEntry {
    return this.log('INFO', operatorId, ruleId, message, payload, matchId);
  }

  public warn(operatorId: string, ruleId: string, message: string, payload?: unknown, matchId?: string | number): TraceEntry {
    return this.log('WARN', operatorId, ruleId, message, payload, matchId);
  }

  public error(operatorId: string, ruleId: string, message: string, payload?: unknown, matchId?: string | number): TraceEntry {
    return this.log('ERROR', operatorId, ruleId, message, payload, matchId);
  }

  public getRecentLogs(limit = 100): TraceEntry[] {
    return this.logs.slice(-limit);
  }

  public clearLogs(): void {
    this.logs = [];
  }
}

export const tracer = Tracer.getInstance();
