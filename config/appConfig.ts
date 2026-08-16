const parsePort = (value: string | undefined, fallback: number): number => {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback;
};

export const APP_CONFIG = {
  host: process.env.HOST?.trim() || '0.0.0.0',
  port: parsePort(process.env.PORT, 3000),
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  geminiModel: process.env.GEMINI_MODEL?.trim() || 'gemini-3.6-flash',
} as const;
