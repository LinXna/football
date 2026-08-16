const preferredKeys = ['text', 'data', 'name', 'label', 'message', 'reason', 'status', 'value'];

/** Convert provider values into React-safe text without hiding useful structured data. */
export function displayText(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => displayText(item)).filter(Boolean).join(' · ') || fallback;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of preferredKeys) {
      if (record[key] !== undefined && record[key] !== value) {
        const rendered = displayText(record[key]);
        if (rendered) return rendered;
      }
    }
    try { return JSON.stringify(value); } catch { return fallback; }
  }
  return String(value);
}

export function playerNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((player) => displayText(player)).filter(Boolean);
}
