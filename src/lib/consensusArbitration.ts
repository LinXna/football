import { DecisionItem } from '../types';
import { formatAsianLine } from './quarterSettlement';

export type ConsensusTier =
  | 'DUAL_STRONG_CONSENSUS'  // 🏆 双重强共识・顶级优选
  | 'AI_VALUE_UPGRADE'       // 💡 AI量化升级・价值机会
  | 'DIVERGENCE_AVOID'       // ⚠️ 方向分歧・建议回避
  | 'HIGH_RISK_AVOID'        // ⛔ 高风险拦截・严禁下注
  | 'AWAITING_AI'            // ⏳ 等待AI深度复核
  | 'INSUFFICIENT_DATA';     // ❓ 数据不足

export interface BestBettingProposal {
  market: string;
  line: string;
  odds: number;
  direction: string;
  grade: 'A' | 'B' | 'C' | 'NO_BET';
  valueEdgePct?: number | null;
  recommendedStake: string;
  actionGuide?: string;
  isQuarter: boolean;
  marketOptionId?: string | null;
}

export interface DualConsensusAnalysis {
  tier: ConsensusTier;
  title: string;
  badgeLabel: string;
  badgeClass: string;
  isBetWorthy: boolean;
  isHighRisk: boolean;
  summary: string;
  bestProposal: BestBettingProposal | null;
  systemSummary: {
    grade: string;
    market: string;
    line: string;
    odds: number | null;
    status: string;
  };
  aiSummary: {
    grade: string;
    market: string;
    line: string;
    odds: number | null;
    status: string;
    valueEdge: number | null;
    proStrategy?: string;
  } | null;
  riskFlags: string[];
  consensusReasons: string[];
}

/**
 * 统一将各种英文或原始玩法键名转义为标准中文
 */
export function formatMarketLabel(market?: string | null): string {
  if (!market) return '未知玩法';
  const m = String(market).trim();
  const lower = m.toLowerCase();
  if (lower === 'full_spread' || lower === 'spread' || lower === 'asian_handicap') return '全场让球';
  if (lower === 'half_spread') return '半场让球';
  if (lower === 'full_total' || lower === 'total' || lower === 'asian_total') return '全场大小球';
  if (lower === 'half_total') return '半场大小球';
  if (lower === 'full_h2h' || lower === 'h2h' || lower === '1x2' || lower === 'moneyline') return '全场独赢1X2';
  if (lower === 'half_h2h') return '半场独赢1X2';
  if (lower === 'full_correct_score' || lower === 'correct_score') return '全场波胆';
  if (lower === 'both_to_score' || lower === 'btts') return '双方进球 (BTTS)';
  if (lower === 'total_goals_odd_even' || lower === 'odd_even') return '总进球单双';
  if (lower === 'home_goals' || lower === 'team_total_home') return '主队进球大小';
  if (lower === 'away_goals' || lower === 'team_total_away') return '客队进球大小';
  if (lower === 'total_goals') return '总进球数';
  if (lower === 'goal_time_window' || lower === 'intervals') return '进球时间段';
  if (lower === 'corners' || lower === 'corners_total') return '角球大小';
  if (lower === 'corners_spread') return '角球让球';
  return m;
}

/**
 * 格式化完整的投注方向与选项描述（例如：全场让球 · 主队 (赫根) -0.5 或 全场大小球 · 大球 6/6.5）
 */
export function formatBetOption(
  categoryOrMarket?: string | null,
  direction?: string | null,
  line?: string | number | null,
  homeTeam?: string | null,
  awayTeam?: string | null
): { marketName: string; sideLabel: string; lineStr: string; fullSummary: string } {
  const marketName = formatMarketLabel(categoryOrMarket);
  const rawDir = String(direction || '').trim();
  const cleanHome = String(homeTeam || '').replace(/-(?:ybty|leisu)$/i, '').trim();
  const cleanAway = String(awayTeam || '').replace(/-(?:ybty|leisu)$/i, '').trim();
  const formattedLine = line !== null && line !== undefined && String(line).trim() !== '' ? formatAsianLine(line) : '';

  let sideLabel = '';

  const isSpread = /让球|spread|handicap/i.test(categoryOrMarket || '') || /让球|spread/i.test(marketName);
  const isTotal = /大小|total|over_under/i.test(categoryOrMarket || '') || /大小/i.test(marketName);
  const isH2H = /独赢|1x2|h2h|moneyline/i.test(categoryOrMarket || '') || /独赢/i.test(marketName);
  const isBTTS = /双方进球|btts/i.test(categoryOrMarket || '');
  const isTeamTotal = /主队进球|客队进球/i.test(marketName);

  if (isSpread) {
    if (/主|home|1/i.test(rawDir) && !/客|away|2/i.test(rawDir)) {
      sideLabel = cleanHome ? `主队 (${cleanHome})` : '主队';
    } else if (/客|away|2/i.test(rawDir)) {
      sideLabel = cleanAway ? `客队 (${cleanAway})` : '客队';
    } else if (cleanHome && rawDir.includes(cleanHome)) {
      sideLabel = `主队 (${cleanHome})`;
    } else if (cleanAway && rawDir.includes(cleanAway)) {
      sideLabel = `客队 (${cleanAway})`;
    } else if (rawDir) {
      sideLabel = rawDir;
    } else {
      sideLabel = cleanHome ? `主队 (${cleanHome})` : '主队';
    }
  } else if (isTotal || isTeamTotal) {
    if (/大|over|大球/i.test(rawDir)) {
      sideLabel = '大球';
    } else if (/小|under|小球/i.test(rawDir)) {
      sideLabel = '小球';
    } else if (rawDir) {
      sideLabel = rawDir;
    } else {
      sideLabel = '大球';
    }
  } else if (isH2H) {
    if (/主|home|1/i.test(rawDir) && !/客|away|2/i.test(rawDir)) {
      sideLabel = cleanHome ? `主胜 (${cleanHome})` : '主胜';
    } else if (/客|away|2/i.test(rawDir)) {
      sideLabel = cleanAway ? `客胜 (${cleanAway})` : '客胜';
    } else if (/平|draw|x/i.test(rawDir)) {
      sideLabel = '平局';
    } else {
      sideLabel = rawDir || (cleanHome ? `主胜 (${cleanHome})` : '主胜');
    }
  } else if (isBTTS) {
    if (/是|yes|y|进球/i.test(rawDir)) {
      sideLabel = '双方进球 (是)';
    } else if (/否|no|n|不进/i.test(rawDir)) {
      sideLabel = '双方进球 (否)';
    } else {
      sideLabel = rawDir || '双方进球 (是)';
    }
  } else {
    sideLabel = rawDir || '';
  }

  // Combine fullSummary
  const parts: string[] = [marketName];
  if (sideLabel) parts.push(sideLabel);
  if (formattedLine && formattedLine !== '--') parts.push(formattedLine);

  return {
    marketName,
    sideLabel,
    lineStr: formattedLine,
    fullSummary: parts.join(' · '),
  };
}

/**
 * 规范化文本，便于比较方向是否一致
 */
function normalizeDirection(text: string | null | undefined): string {
  if (!text) return '';
  const clean = text.toLowerCase().replace(/[\s\-_()（）]/g, '');
  if (/大球|over/i.test(clean)) return 'OVER';
  if (/小球|under/i.test(clean)) return 'UNDER';
  if (/主胜|主队|home/i.test(clean)) return 'HOME';
  if (/客胜|客队|away/i.test(clean)) return 'AWAY';
  if (/平局|draw/i.test(clean)) return 'DRAW';
  return clean;
}

/**
 * 综合系统评估与 AI 评估，给出最终综合仲裁判定、最佳投注方案与高风险拦截
 */
export function analyzeDualConsensus(
  systemMatch: DecisionItem,
  latestAiEvaluation: any | null,
): DualConsensusAnalysis {
  const isLive = Boolean(Number(systemMatch.minute || 0) > 0 || (systemMatch as any).source_type === 'live');
  const scoreVerified = systemMatch.score_verified === true ||
    latestAiEvaluation?.score_verified === true ||
    /\|true\|/i.test(latestAiEvaluation?.summary || '') ||
    (systemMatch.score_source && systemMatch.score_source !== 'unverified');

  const systemGrade = String(systemMatch.grade || 'C').toUpperCase();
  const systemStatus = String(systemMatch.status || 'PASS').toUpperCase();
  const systemRec = systemMatch.recommendation;
  const hasSystemRec = Boolean(
    systemRec &&
    String(systemRec.market || '').trim() &&
    String(systemRec.line || '').trim() &&
    Number(systemRec.odds) > 1
  );

  const sysTarget = formatBetOption(
    systemRec?.market,
    (systemRec as any)?.direction || systemRec?.market,
    systemRec?.line,
    systemMatch.ybty_home,
    systemMatch.ybty_away
  );

  const systemSummary = {
    grade: systemGrade,
    market: systemRec?.market ? sysTarget.fullSummary : '无主选',
    line: sysTarget.lineStr || '--',
    odds: systemRec?.odds ? Number(systemRec.odds) : null,
    status: systemStatus,
  };

  const riskFlags: string[] = [];
  const consensusReasons: string[] = [];

  // 1. 基础硬性风控检查
  if (isLive && !scoreVerified) {
    riskFlags.push('滚球比分未经多源验证 (禁止A/B级真实投注)');
  }

  const leagueName = systemMatch.league || '';
  const isCupOrFriendly = /杯|cup|friendly|友谊|trophy|u\d+|qualif/i.test(leagueName) ||
    /杯|友谊|梯队/i.test(systemMatch.match || '');
  
  if (isCupOrFriendly) {
    const hasConfirmedLineup = Boolean(
      systemMatch.lineups &&
      (
        systemMatch.lineups.home?.starters?.length ||
        systemMatch.lineups.home?.players?.length ||
        systemMatch.lineups.away?.starters?.length ||
        systemMatch.lineups.away?.players?.length
      )
    );
    if (!hasConfirmedLineup) {
      riskFlags.push('杯赛/友谊赛轮换风险高，且官方首发阵容尚未确认');
    }
  }

  // 2. 盘口深盘风险
  const spreadLine = parseFloat(String(systemRec?.line || 0));
  if (Math.abs(spreadLine) >= 1.5 && systemGrade !== 'A') {
    riskFlags.push('深盘穿盘风险：净胜幅度未获同级硬性数据支撑');
  }

  // 3. 提取 AI 深度评估指标
  if (!latestAiEvaluation) {
    const isSystemStrong = (systemGrade === 'A' || systemGrade === 'B') && hasSystemRec;
    if (riskFlags.length > 0) {
      return {
        tier: 'HIGH_RISK_AVOID',
        title: '⛔ 高风险拦截・严禁下注',
        badgeLabel: '高风险规避',
        badgeClass: 'border-rose-600/60 bg-rose-950/50 text-rose-300',
        isBetWorthy: false,
        isHighRisk: true,
        summary: `系统初筛虽有数据，但触发风控红线：${riskFlags.join('；')}。`,
        bestProposal: null,
        systemSummary,
        aiSummary: null,
        riskFlags,
        consensusReasons: ['触发硬性风控拦截规则'],
      };
    }

    return {
      tier: 'AWAITING_AI',
      title: '⏳ 等待 AI 深度复核',
      badgeLabel: '待AI深挖',
      badgeClass: 'border-slate-700 bg-slate-900 text-slate-400',
      isBetWorthy: isSystemStrong,
      isHighRisk: false,
      summary: isSystemStrong
        ? '原系统初筛已达标，建议点击「AI 协议深挖」进行剥离抽水与公允赔率复核。'
        : '原系统初筛为观察/数据不足，建议运行 AI 深度评估挖掘潜在价值。',
      bestProposal: isSystemStrong && systemRec
        ? {
            market: sysTarget.marketName,
            line: sysTarget.lineStr,
            odds: Number(systemRec.odds),
            direction: sysTarget.sideLabel || sysTarget.marketName,
            grade: systemGrade as any,
            recommendedStake: systemGrade === 'A' ? '3%~5%' : '1%~2%',
            isQuarter: false,
          }
        : null,
      systemSummary,
      aiSummary: null,
      riskFlags,
      consensusReasons: ['仅有系统初筛数据'],
    };
  }

  const aiGrade = String(latestAiEvaluation.grade || 'C').toUpperCase();
  const aiRec = latestAiEvaluation.recommendation;
  const aiAssessments: any[] = Array.isArray(latestAiEvaluation.market_assessments)
    ? latestAiEvaluation.market_assessments
    : [];
  
  const hasAiRec = Boolean(
    aiRec &&
    String(aiRec.market || '').trim() &&
    String(aiRec.line || '').trim() &&
    Number(aiRec.odds) > 1 &&
    aiRec.grade !== 'NO_BET'
  );

  const aiValueEdge = typeof latestAiEvaluation.value_edge === 'number'
    ? latestAiEvaluation.value_edge
    : (aiRec?.value_edge ? Number(aiRec.value_edge) : null);

  const aiProStrategy = latestAiEvaluation.pro_strategy_guide?.action_path ||
    latestAiEvaluation.pro_strategy_guide?.phase || null;

  const aiTarget = formatBetOption(
    aiRec?.category || aiRec?.market,
    aiRec?.direction,
    aiRec?.line,
    systemMatch.ybty_home,
    systemMatch.ybty_away
  );

  const aiSummary = {
    grade: aiGrade,
    market: hasAiRec ? aiTarget.fullSummary : '无主选',
    line: aiTarget.lineStr || '--',
    odds: aiRec?.odds ? Number(aiRec.odds) : null,
    status: aiRec ? (aiRec.status || 'recommend') : 'avoid',
    valueEdge: aiValueEdge,
    proStrategy: aiProStrategy,
  };

  // 检查 AI 评估中是否发现了致命风险（如攻防转化率极低、庄家严重负期望）
  const avoidCount = aiAssessments.filter((a) => a.status === 'avoid' || a.grade === 'NO_BET').length;
  if (avoidCount >= 4 && !hasAiRec) {
    riskFlags.push('AI 评估显示全盘口期望值不足或处于庄家抽水陷阱');
  }

  // 4. 判断系统与 AI 的方向是否冲突
  let isDirectionConflict = false;
  if (hasSystemRec && hasAiRec) {
    const sysDir = normalizeDirection(sysTarget.fullSummary);
    const aiDir = normalizeDirection(aiTarget.fullSummary);
    if (sysDir && aiDir && sysDir !== aiDir) {
      if (
        (sysDir === 'OVER' && aiDir === 'UNDER') ||
        (sysDir === 'UNDER' && aiDir === 'OVER') ||
        (sysDir === 'HOME' && aiDir === 'AWAY') ||
        (sysDir === 'AWAY' && aiDir === 'HOME')
      ) {
        isDirectionConflict = true;
        riskFlags.push(`方向冲突：原系统倾向 [${sysTarget.fullSummary}]，但 AI 评估倾向 [${aiTarget.fullSummary}]`);
      }
    }
  }

  // 5. 综合仲裁定级逻辑
  // 5.1 致命风险 / 风控拦截
  if (riskFlags.some((f) => f.includes('比分未经') || f.includes('杯赛/友谊赛轮换') || f.includes('负期望'))) {
    return {
      tier: 'HIGH_RISK_AVOID',
      title: '⛔ 高风险拦截・严禁下注',
      badgeLabel: '高风险规避',
      badgeClass: 'border-rose-600/70 bg-rose-950/60 text-rose-200',
      isBetWorthy: false,
      isHighRisk: true,
      summary: `经系统与 AI 双重研判，本场存在硬性风控风险：${riskFlags.join('；')}。建议坚决规避。`,
      bestProposal: null,
      systemSummary,
      aiSummary,
      riskFlags,
      consensusReasons: ['触发硬性风控红线', '不满足资金安全边际'],
    };
  }

  // 5.2 评估分歧
  if (isDirectionConflict) {
    return {
      tier: 'DIVERGENCE_AVOID',
      title: '⚠️ 评估分歧・建议回避',
      badgeLabel: '分歧观望',
      badgeClass: 'border-amber-600/70 bg-amber-950/50 text-amber-200',
      isBetWorthy: false,
      isHighRisk: true,
      summary: `系统初筛与 AI 深度量化模型结论产生方向分歧（${sysTarget.fullSummary} vs ${aiTarget.fullSummary}），概率与期望值未达成共识，建议放弃或仅作盘口走势观察。`,
      bestProposal: null,
      systemSummary,
      aiSummary,
      riskFlags,
      consensusReasons: ['模型分歧率 > 50%', '缺乏确定性边际'],
    };
  }

  // 5.3 双重强共识（顶级优选）
  const isSystemGood = (systemGrade === 'A' || systemGrade === 'B') && hasSystemRec;
  const isAiGood = (aiGrade === 'A' || aiGrade === 'B') && hasAiRec;

  if (isSystemGood && isAiGood) {
    const finalGrade: 'A' | 'B' = (systemGrade === 'A' || aiGrade === 'A') ? 'A' : 'B';
    const edgeText = aiValueEdge && aiValueEdge > 0 ? `正期望值 +${aiValueEdge}%` : '公允赔率优势';
    consensusReasons.push('系统初筛与 AI 量化模型高度共识');
    consensusReasons.push(`确认具备 ${edgeText}`);
    consensusReasons.push('首发/比分核验通过，符合资金管理准则');

    const targetRec = aiRec || systemRec!;
    const bestBet = aiRec ? aiTarget : sysTarget;
    const stake = finalGrade === 'A' ? '3%~5% (核心主选)' : '1%~2% (标准配比)';

    return {
      tier: 'DUAL_STRONG_CONSENSUS',
      title: '🏆 双重强共识・顶级优选',
      badgeLabel: finalGrade === 'A' ? '🏆 S级双重共识' : '💎 A级双重共识',
      badgeClass: 'border-emerald-500 bg-emerald-950/60 text-emerald-200 shadow-lg shadow-emerald-950/30',
      isBetWorthy: true,
      isHighRisk: false,
      summary: `原系统与 AI 深度评估达成强共识，锁定玩法 [${bestBet.fullSummary}] @${targetRec.odds}，具备 ${edgeText}，推荐作为核心投注方案。`,
      bestProposal: {
        market: bestBet.marketName,
        line: bestBet.lineStr,
        odds: Number(targetRec.odds),
        direction: bestBet.sideLabel || bestBet.marketName,
        grade: finalGrade,
        valueEdgePct: aiValueEdge,
        recommendedStake: stake,
        actionGuide: aiProStrategy || '顺应场面压制与盘口轨迹顺势切入',
        isQuarter: false,
        marketOptionId: targetRec.market_option_id || null,
      },
      systemSummary,
      aiSummary,
      riskFlags,
      consensusReasons,
    };
  }

  // 5.4 AI 量化升级发现（系统初筛一般，但 AI 深度量化发现高价值）
  if (!isSystemGood && isAiGood && (aiValueEdge === null || aiValueEdge > 0)) {
    consensusReasons.push('AI 深度量化（进攻转化与公允赔率）识别超额价值');
    consensusReasons.push(`期望价值边际: +${aiValueEdge || 3}%`);

    return {
      tier: 'AI_VALUE_UPGRADE',
      title: '💡 AI量化升级・价值机会',
      badgeLabel: '💡 AI价值机会',
      badgeClass: 'border-sky-500 bg-sky-950/60 text-sky-200 shadow-md shadow-sky-950/20',
      isBetWorthy: true,
      isHighRisk: false,
      summary: `系统初筛原为观察，但 AI 在攻防压迫倾角与剥离庄家抽水后发现价值边际，推荐 [${aiTarget.fullSummary}] @${aiRec!.odds}。`,
      bestProposal: {
        market: aiTarget.marketName,
        line: aiTarget.lineStr,
        odds: Number(aiRec!.odds),
        direction: aiTarget.sideLabel || aiTarget.marketName,
        grade: (aiGrade === 'A' ? 'A' : 'B') as any,
        valueEdgePct: aiValueEdge,
        recommendedStake: '1%~2% (稳健观察注码)',
        actionGuide: aiProStrategy || '关注实时水位变化与加注时机',
        isQuarter: false,
        marketOptionId: aiRec!.market_option_id || null,
      },
      systemSummary,
      aiSummary,
      riskFlags,
      consensusReasons,
    };
  }

  // 5.5 数据不足或无合格方案
  return {
    tier: 'INSUFFICIENT_DATA',
    title: '⚪ 观望不入账・缺乏安全边际',
    badgeLabel: '无优势观望',
    badgeClass: 'border-slate-700 bg-slate-900/80 text-slate-400',
    isBetWorthy: false,
    isHighRisk: false,
    summary: '系统与 AI 评估均未发现具备显著价值边际的投注选项，遵循严格风控原则，本场不予推荐。',
    bestProposal: null,
    systemSummary,
    aiSummary,
    riskFlags,
    consensusReasons: ['未达正期望值门槛 (+EV <= 0)'],
  };
}
