export function formatToBeijingTime(date: Date): string {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  const h = String(shifted.getUTCHours()).padStart(2, '0');
  const min = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}`;
}

export function calculateExactBeijingTime(item: any): string {
  const explicitBeijing = item?.start_time_beijing || item?.ybty_start_time_beijing || item?.beijing_time;
  if (explicitBeijing) return String(explicitBeijing);
  const raw = String(item?.countdown || item?.commence_time || item?.start_time || item?.ybty_start_time || item?.time_str || item?.relative_time || item?.time || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? '推算时间' : formatToBeijingTime(parsed);
    }
    const localMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    return localMatch ? `${localMatch[1]} ${localMatch[2]}` : raw;
  }
  const capturedRaw = item?.captured_at || item?.export_time || item?.capturedAt;
  if (!capturedRaw) return '推算时间';
  const base = new Date(capturedRaw);
  if (Number.isNaN(base.getTime())) return '推算时间';
  let minutes: number;
  if (item?.mins_until_start !== undefined && Number.isFinite(Number(item.mins_until_start))) {
    minutes = Number(item.mins_until_start);
  } else {
    const hours = Number((raw.match(/(\d+(?:\.\d+)?)\s*(?:小时|hours?|hrs?|h)(?![a-z])/i) || [])[1] || 0);
    const mins = Number((raw.match(/(\d+(?:\.\d+)?)\s*(?:分钟|minutes?|mins?|m)(?![a-z])/i) || [])[1] || 0);
    minutes = hours * 60 + mins;
  }
  if (!Number.isFinite(minutes) || minutes < 0 || (minutes === 0 && !/(?:0\s*(?:分钟|min)|立即|马上)/i.test(raw))) return '推算时间';
  return `${formatToBeijingTime(new Date(base.getTime() + minutes * 60_000))} (推算时间)`;
}
