/**
 * Layer 00: 显式数据缺陷收集总线 (Explicit Data Deficit Collector)
 * 算子编号: [OP-00-02]
 * 规则绑定: [RC-001][RC-002][RC-003] 零隐式兜底与显式缺陷抛出机制
 * 
 * 职责：
 * 1. 彻底消灭内部 try-catch 静默吞异常或使用虚假默认值；
 * 2. 收集解析与组装过程中所有数据缺失与异常，显式登记并输出到 CanonicalMatch.data_deficits；
 * 3. 作为 Layer 04 风控准入门禁与 Layer 05 AI 提示词缺陷标注的单一事实来源 (SSOT)。
 */

import { tracer } from './Tracer';
import { DataCompletenessTier } from '../02_canonical_model/enums';

export interface RecordedDeficit {
  code: string;
  operatorId: string;
  ruleId: string;
  reason: string;
  suggestedTier?: DataCompletenessTier;
}

export class DeficitCollector {
  private deficits: RecordedDeficit[] = [];

  /**
   * 显式记录一项数据缺陷或异常
   */
  public record(
    code: string,
    operatorId: string,
    ruleId: string,
    reason: string,
    suggestedTier?: DataCompletenessTier,
    matchId?: string | number
  ): void {
    const deficit: RecordedDeficit = {
      code,
      operatorId,
      ruleId,
      reason,
      suggestedTier,
    };
    this.deficits.push(deficit);

    tracer.warn(operatorId, ruleId, `发现数据缺陷: ${reason}`, {
      deficit_code: code,
      tier: suggestedTier,
    }, matchId);
  }

  /**
   * 获取纯净的缺陷代码字符串列表 (用于 CanonicalMatch.data_deficits)
   */
  public getDeficits(): string[] {
    return this.deficits.map((d) => d.code);
  }

  /**
   * 获取完整的缺陷结构列表 (用于底层调试与深度审计)
   */
  public getDetailedDeficits(): RecordedDeficit[] {
    return [...this.deficits];
  }

  /**
   * 是否存在特定缺陷
   */
  public has(code: string): boolean {
    return this.deficits.some((d) => d.code === code);
  }

  /**
   * 是否包含硬熔断级致命错误
   */
  public hasFatalDeficit(): boolean {
    return this.deficits.some(
      (d) =>
        d.code === 'SCORE_MISMATCH_FUSED' ||
        d.code === 'DATA_INVALID_HARD_FUSE' ||
        d.suggestedTier === DataCompletenessTier.TIER_INVALID
    );
  }
}
