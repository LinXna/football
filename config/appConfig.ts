export const APP_CONFIG = {
  host: process.env.HOST || '0.0.0.0',
  // 回归修复（2026-09-25）：此前「端口与监听绑定加固」把 port 硬编码为 3000，导致
  // tests-ts/api.integration.test.ts 通过 PORT 环境变量指定随机端口（避免端口冲突）的机制失效——
  // server 始终监听 3000，健康检查却 fetch 随机端口，10 秒超时判 fail。
  // 恢复读取 PORT：生产未设 PORT 时仍默认 3000（保留加固意图），集成测试设随机端口时生效。
  port: Number(process.env.PORT) || 3000,
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  geminiModel: process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash',
} as const;
