export function isGeminiNetworkFailure(error: any): boolean {
  const code = error?.cause?.code || error?.code;
  return error?.message === 'fetch failed' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ECONNRESET';
}

export function geminiHttpStatus(error: any): number | null {
  const direct = Number(error?.status || error?.statusCode || error?.response?.status);
  if (Number.isFinite(direct) && direct >= 100) return direct;
  const match = String(error?.message || error || '').match(/(?:\(|\b)(429|500|502|503|504)(?:\)|\b)/);
  return match ? Number(match[1]) : null;
}

export function isRetryableGeminiFailure(error: any): boolean {
  return isGeminiNetworkFailure(error) || [429, 500, 502, 503, 504].includes(geminiHttpStatus(error) || 0);
}

export function parseGeminiRetryDelay(error: any): number {
  const message = String(error?.message || error?.details || error || '');
  const match = message.match(/retry in ([\d.]+)s/i) || message.match(/retryDelay[:=]\s*["']?([\d.]+)s?["']?/i);
  return match && Number(match[1]) > 0 ? Math.ceil(Number(match[1]) * 1000) + 1000 : 15000;
}

export function waitForRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, delayMs)));
}
