const cooldowns = new Map<string, number>();
let cursor = 0;

export function isGeminiKeyAvailable(key: string, now = Date.now()): boolean {
  return (cooldowns.get(key) || 0) <= now;
}

export function getGeminiKeyCooldown(key: string): number {
  return cooldowns.get(key) || 0;
}

export function setGeminiKeyCooldown(key: string, until: number): void {
  cooldowns.set(key, Math.max(Date.now(), until));
}

export function geminiKeyIndex(offset: number, total: number): number {
  return total > 0 ? (cursor + offset) % total : 0;
}

export function advanceGeminiKeyCursor(index: number, total: number): void {
  cursor = total > 0 ? (index + 1) % total : 0;
}
