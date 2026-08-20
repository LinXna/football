# 足球比赛智能量化与分析系统 (LX Football Analysis System)

这是一个面向实盘决策辅助的足球数据量化分析与 AI 深度评估系统，运行于本地环境（Windows / Linux / 容器），由 **React 18 前端**、**TypeScript / Express 本地 API**、**Python 核心数据与初筛流水线**以及**浏览器数据导出扩展**共同构成。

---

## 🌟 核心特性与量化引擎

1. **真实盘口与多源数据交叉验证**：
   - YBTY 真实盘口赔率（独赢、亚洲让球、全场大小球、半场大小球、角球盘等）白名单严格校验与去水。
   - 雷速现场技术统计、比赛事件、主客首发阵容、近期战绩与 H2H 历史交锋深度挖掘。
   - 滚球分钟比分双源交叉核验（优先画布与接口比分，杜绝射门/角球误识别）。
2. **六大高阶战术量化引擎**：
   - **泊松非线性时段衰减**：引入换人提速攻坚期（56'-75', 1.22x）与搏命攻防期（76'-90'+, 1.28x）分段加权。
   - **现场压制力与角球爆发速率**：动态计算角球净差、每 10 分钟爆发速率与禁区挤压比率，量化撕裂防线概率。
   - **纪律失衡物理倍数**：红牌少打一人物理放大受罚方失球率（1.75x ~ 2.30x），并在进攻优势指数（Dominance Index）中施加偏置。
   - **主客场特异性与历史交锋（H2H）先验**：计算理论进球期望 $\lambda_{prior}$ 作为基准锚点。
   - **+EV 正期望值与去水门禁**：剥离机构抽水（Overround），仅推荐 $EV > 0$ 且价值边际 $\ge +2.5\%$ 的优势方向。
3. **串关防重复与核心腿相关性风控**：
   - 跨票组合签名去重（Ticket Signature Hash），杜绝完全相同的比赛组合。
   - 核心腿重叠率硬性熔断（2串1之间 0 重叠，2串1与3串1之间重叠 $\le 1$ 场）。
   - 前端专项推荐（进球大战/大小球专项）与价值组合严格排他选取。
4. **AI 智能评估与 Prompt 精简导出**：
   - 支持自动化 Gemini API 评估与外部网页端 Prompt 复制精简导出。
   - 严格区分机器初筛（`machine_candidate`）与正式推荐（`formal_ai_recommendation`）。
   - 完整的台账记录、赛后逐腿复盘、Brier Score 与 ECE 概率校准监控。

---

## 🚀 快速启动

### 1. 运行 Web 管理界面

```bash
# 安装依赖
npm install

# 启动开发服务器 (默认端口 3000)
npm run dev

# 生产构建与启动
npm run build
npm start
```

启动后在浏览器打开：`http://127.0.0.1:3000`

### 2. 配置 AI 评估密钥（可选）

如需在 Web 界面直接调用 Gemini API 自动评估，请在根目录创建 `.env`：

```dotenv
GEMINI_API_KEY=你的_Gemini_API_Key
```

### 3. 数据分析流水线（Windows / PowerShell）

```powershell
# 推荐方式：双击运行图形化控制台
run_analysis.cmd

# 命令行单独执行
.\run_latest_ybty.ps1 # 处理浏览器扩展最新导出的滚球数据
.\run_prematch.ps1    # 处理赛前数据
.\run_both.ps1        # 同时处理滚球与赛前数据
.\run_monitor.ps1     # 持续监控滚球趋势 (每 60 秒快照)
```

---

## 📂 核心文档索引

在进行任何二次开发、AI 任务提示或风控复盘前，请务必阅读以下核心规范文档：

- 📑 [系统与数据契约 (`docs/AI_SYSTEM_AND_DATA_CONTRACT.md`)](docs/AI_SYSTEM_AND_DATA_CONTRACT.md)：系统运行、数据结构、导入导出与 AI 接口的统一契约。
- 📊 [量化预测方法学 (`docs/PREDICTION_FEATURE_METHODOLOGY.md`)](docs/PREDICTION_FEATURE_METHODOLOGY.md)：泊松分布、时间衰减积分、角球压制、红牌物理倍数与 +EV 门禁核心数学方程。
- 🛠️ [全链路排查诊断报告 (`docs/SYSTEM_DIAGNOSIS_AND_OPTIMIZATION_REPORT.md`)](docs/SYSTEM_DIAGNOSIS_AND_OPTIMIZATION_REPORT.md)：系统性缺陷溯源、两端计算割裂弥合与串关防重复加固方案。
- 🏛️ [系统架构与边界 (`docs/ARCHITECTURE.md`)](docs/ARCHITECTURE.md)：前后端与 Python 脚本边界、职责划分及并发文件锁机制。
- 🖥️ [本地启动指南 (`LOCAL_STARTUP.md`)](LOCAL_STARTUP.md)：详细环境配置、依赖安装、日常流水线操作与疑难解答。
- 📋 [系统审计台账 (`docs/AUDIT.md`)](docs/AUDIT.md)：架构变迁、历史问题修复与最新功能回归复审记录。

---

## ⚠️ 免责与使用声明

本项目定位为**足球数据量化研究与比赛决策辅助分析工具**。系统输出的机器评分与 AI 建议仅供数据分析与研究参考，不构成任何投注保证，请理性对待并遵守所在地相关法律法规。
