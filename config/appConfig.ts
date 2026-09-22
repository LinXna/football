export const APP_CONFIG = {
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT) || 3000,
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  geminiModel: process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash',
} as const;
