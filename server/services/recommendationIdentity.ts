export function createRecommendationIdentity(cleanTeamName: (value: any) => string) {
  const matchIdentity = (item: any): string => [cleanTeamName(item?.ybty_home || item?.match?.split(' vs ')[0] || ''), cleanTeamName(item?.ybty_away || item?.match?.split(' vs ')[1] || '')].join('|');
  return {
    matchIdentity,
    recommendationKey(item: any): string {
      const recommendation = item?.recommendation || {};
      const score = item?.score_at_recommendation || item?.score || {};
      return [matchIdentity(item), Number(item?.minute ?? 0), Number(score.home ?? 0), Number(score.away ?? 0), String(recommendation.market || '').trim().toLowerCase(), String(recommendation.line ?? '').trim().toLowerCase(), String(recommendation.odds ?? '').trim().toLowerCase()].join('|');
    },
    directionIdentity(item: any): string {
      const recommendation = item?.recommendation || item || {};
      return [matchIdentity(item), String(recommendation.market || '').trim().toLowerCase(), String(recommendation.line ?? '').trim().toLowerCase()].join('|');
    },
    hasUsableRecommendation(recommendation: any): boolean {
      return Boolean(recommendation && typeof recommendation === 'object' && String(recommendation.market ?? '').trim() && String(recommendation.line ?? '').trim() && Number.isFinite(Number(recommendation.odds)) && Number(recommendation.odds) > 1);
    },
    hasExplicitBetDirection(item: any): boolean {
      const recommendation = item?.recommendation || item || {};
      const market = String(recommendation.market || '').trim();
      const line = String(recommendation.line ?? '').trim();
      const combined = `${market} ${line}`.toLowerCase();
      if (/(?:大小球|total)/i.test(market)) {
        const direction = `${market.replace(/(?:全场|半场)?大小球|total goals?/gi, ' ')} ${line}`;
        return /(?:大球|小球|(?:^|\s)大(?:\s|$)|(?:^|\s)小(?:\s|$)|over|under)/i.test(direction);
      }
      if (/(?:让球|spread|handicap)/i.test(market)) {
        const normalized = (value: unknown) => String(value || '').toLowerCase().replace(/[\s\-_\.（）()]/g, '');
        const text = normalized(combined);
        return /(?:主队|客队|home|away)/i.test(combined) || Boolean(normalized(item?.ybty_home) && text.includes(normalized(item.ybty_home))) || Boolean(normalized(item?.ybty_away) && text.includes(normalized(item.ybty_away)));
      }
      return true;
    },
  };
}
