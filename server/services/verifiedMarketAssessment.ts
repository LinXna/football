type VerifiedOption = { option_id?: string; side?: string | null; line?: unknown; selection?: unknown; odds?: unknown; suspended?: boolean };
type VerifiedMarket = { market?: string; market_type_verified?: boolean; options?: VerifiedOption[] };

export function withVerifiedYbtyOptionIds(markets: VerifiedMarket[]): VerifiedMarket[] {
  const source = Array.isArray(markets) ? markets : [];
  const marketCounts = new Map<string, number>();
  const suppliedIdCounts = new Map<string, number>();
  for (const market of source) {
    const marketKey = String(market.market || 'market');
    marketCounts.set(marketKey, (marketCounts.get(marketKey) || 0) + 1);
    for (const option of Array.isArray(market.options) ? market.options : []) {
      const suppliedId = String(option.option_id || '').trim();
      if (suppliedId) suppliedIdCounts.set(suppliedId, (suppliedIdCounts.get(suppliedId) || 0) + 1);
    }
  }

  const marketOccurrences = new Map<string, number>();
  const usedIds = new Set<string>();
  return source.map((market) => {
    const marketKey = String(market.market || 'market');
    const occurrence = (marketOccurrences.get(marketKey) || 0) + 1;
    marketOccurrences.set(marketKey, occurrence);
    return {
      ...market,
      options: (Array.isArray(market.options) ? market.options : []).map((option, index) => {
        const suppliedId = String(option.option_id || '').trim();
        if (suppliedId && suppliedIdCounts.get(suppliedId) === 1 && !usedIds.has(suppliedId)) {
          usedIds.add(suppliedId);
          return { ...option, option_id: suppliedId };
        }
        const baseId = marketCounts.get(marketKey) === 1
          ? `${marketKey}__${index + 1}`
          : `${marketKey}__m${occurrence}__o${index + 1}`;
        let optionId = baseId;
        let suffix = 2;
        while (usedIds.has(optionId) || (suppliedIdCounts.get(optionId) || 0) > 0) optionId = `${baseId}__${suffix++}`;
        usedIds.add(optionId);
        return { ...option, option_id: optionId };
      }),
    };
  });
}

const categoryMarket: Record<string, string> = {
  '全场大小球': 'full_total', '半场大小球': 'half_total',
  '全场让球': 'full_spread', '半场让球': 'half_spread',
  '全场独赢1X2': 'full_h2h',
};

export function enforceLiveScoreVerification(assessment: any, scoreVerified: boolean): any {
  const isRealMarket = Boolean(categoryMarket[String(assessment?.category || '')]);
  if (scoreVerified || !isRealMarket || assessment?.status === 'unavailable') return assessment;
  return {
    ...assessment,
    grade: 'NO_BET',
    status: 'avoid',
    value_edge: null,
    reason: `${assessment?.reason || ''} 当前滚球比分未经核验，禁止形成正式投注建议。`.trim(),
  };
}

const normalizedLine = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, '').replace(/^\+/, '');

function expectedSide(category: string, direction: unknown): string | null {
  const text = String(direction || '').toLowerCase();
  if (category.includes('大小球')) return /小|under/.test(text) ? 'under' : /大|over/.test(text) ? 'over' : null;
  if (category.includes('让球')) return /客|away/.test(text) ? 'away' : /主|home/.test(text) ? 'home' : null;
  if (category.includes('独赢')) return /平|draw/.test(text) ? 'draw' : /客|away/.test(text) ? 'away' : /主|home/.test(text) ? 'home' : null;
  return null;
}

export function validateAssessmentAgainstVerifiedMarkets(assessment: any, markets: VerifiedMarket[]): any {
  const marketKey = categoryMarket[String(assessment?.category || '')];
  if (!marketKey) return assessment;

  const isExplicitlyUnavailable =
    assessment?.status === 'unavailable' ||
    (!assessment?.market_option_id && !assessment?.odds && !assessment?.line) ||
    (assessment?.grade === 'NO_BET' && !assessment?.market_option_id && !assessment?.odds);

  if (isExplicitlyUnavailable) {
    return {
      ...assessment,
      market: marketKey,
      market_option_id: null,
      direction: assessment?.direction || null,
      line: null,
      odds: null,
      grade: 'NO_BET',
      status: 'unavailable',
      value_edge: null,
      ybty_market_verified: false,
      verification_error: 'market_unavailable_or_no_bet',
    };
  }

  const side = expectedSide(String(assessment.category), assessment.direction);
  const candidates = withVerifiedYbtyOptionIds(markets)
    .filter((market) => market?.market === marketKey && market?.market_type_verified !== false)
    .flatMap((market) => Array.isArray(market.options) ? market.options : [])
    .filter((option) => option?.suspended !== true && Number(option?.odds) > 1);
  const requestedLine = normalizedLine(assessment.line);
  const requestedOdds = Number(assessment.odds);
  const requestedOptionId = String(assessment?.market_option_id || '').trim();
  const matchedById = requestedOptionId
    ? candidates.find((option) => option.option_id === requestedOptionId)
    : undefined;
  const matchedByLineAndOdds = candidates.find((option) => {
    if (String(option.side || '') !== side) return false;
    const actualLine = normalizedLine(option.line ?? option.selection);
    const lineMatches = marketKey.endsWith('_h2h') || actualLine === requestedLine;
    return lineMatches && Number.isFinite(requestedOdds) && Math.abs(Number(option.odds) - requestedOdds) <= 0.011;
  });
  const matchedBySide = side
    ? (requestedLine
        ? candidates.find((option) => String(option.side || '') === side && normalizedLine(option.line ?? option.selection) === requestedLine)
        : candidates.find((option) => String(option.side || '') === side))
    : undefined;

  const matched = matchedById || matchedByLineAndOdds || matchedBySide;

  if (matched) return {
    ...assessment,
    market: marketKey,
    market_option_id: matched.option_id,
    direction: marketKey.endsWith('_total')
      ? (matched.side === 'under' ? '小球' : '大球')
      : marketKey.endsWith('_spread')
        ? (matched.side === 'away' ? '客队' : '主队')
        : (matched.side === 'draw' ? '平局' : matched.side === 'away' ? '客胜' : '主胜'),
    line: marketKey.endsWith('_h2h') ? null : String(matched.line ?? matched.selection ?? assessment.line),
    odds: Number(matched.odds),
    ybty_market_verified: true,
    odds_source: 'ybty_verified',
  };
  const marketExists = candidates.length > 0;
  return {
    ...assessment,
    direction: '盘口未核验', line: null, odds: null, grade: 'NO_BET', status: 'unavailable', value_edge: null,
    ybty_market_verified: false,
    verification_error: marketExists ? (requestedOptionId ? 'invalid_ybty_option_id' : 'ai_option_not_in_ybty_whitelist') : 'ybty_market_not_provided',
    reason: marketExists
      ? `AI返回的方向/盘口/赔率（${assessment?.direction ?? '--'} ${assessment?.line ?? '--'} @${assessment?.odds ?? '--'}）不在本场YBTY真实选项白名单中，必须针对真实盘口重新评估，禁止直接改线套用原概率。`
      : 'YBTY没有提供该市场，AI不得生成盘口、赔率或投注建议。',
  };
}

export function validateParlayLegAgainstCandidate(leg: any, candidate: any): any {
  const marketText = String(leg?.market || '');
  const lineText = String(leg?.line ?? '');
  const category = /半场/.test(marketText)
    ? (/大小球/.test(marketText) ? '半场大小球' : /让球/.test(marketText) ? '半场让球' : '')
    : /大小球/.test(marketText) ? '全场大小球'
      : /让球/.test(marketText) ? '全场让球'
        : /独赢|1x2/i.test(marketText) ? '全场独赢1X2' : '';
  if (!category) return { ...leg, ybty_market_verified: false, verification_error: 'unsupported_parlay_market' };
  const home = String(candidate?.ybty_home || '');
  const away = String(candidate?.ybty_away || '');
  let direction = lineText;
  let line: string | null = lineText;
  if (category.includes('让球')) {
    direction = lineText.includes(away) || /客|away/i.test(lineText) ? '客队' : lineText.includes(home) || /主|home/i.test(lineText) ? '主队' : '';
    line = lineText.replace(home, '').replace(away, '').replace(/主队|客队|home|away/gi, '').trim();
  } else if (category.includes('大小球')) {
    direction = /小|under/i.test(lineText) ? '小球' : /大|over/i.test(lineText) ? '大球' : '';
    line = lineText.replace(/大球?|小球?|over|under/gi, '').trim();
  } else {
    direction = /平|draw/i.test(lineText) ? '平局' : lineText.includes(away) || /客|away/i.test(lineText) ? '客胜' : lineText.includes(home) || /主|home/i.test(lineText) ? '主胜' : '';
    line = null;
  }
  const markets = normalizeYbtyMarketTypes(candidate?.ybty_raw_markets || []) as VerifiedMarket[];
  const validated = validateAssessmentAgainstVerifiedMarkets({ ...leg, category, direction, line }, markets);
  return validated.ybty_market_verified === true
    ? { ...leg, line: category.includes('让球') ? `${direction === '客队' ? away : home} ${validated.line}`.trim() : category.includes('大小球') ? `${direction} ${validated.line}`.trim() : direction, odds: validated.odds, ybty_market_verified: true, odds_source: 'ybty_verified' }
    : { ...leg, ybty_market_verified: false, verification_error: validated.verification_error, validation_reason: validated.reason };
}
import { normalizeYbtyMarketTypes } from './marketTypeNormalizer';
