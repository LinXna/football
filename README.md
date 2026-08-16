# 足球比赛数据分析系统

这是一个 Windows 本地运行的足球数据分析系统，由 React 前端、TypeScript 本地 API、Python 数据流水线和浏览器导出扩展组成。

## 启动 Web 应用

```powershell
pnpm install
pnpm dev
```

生产构建：`pnpm build`，启动：`pnpm start`。

## 数据流水线

`sources/` 是只读参考输入，`output/` 是可重建的运行产物。

```powershell
.\run_daily.ps1       # 实时数据流程
.\run_prematch.ps1    # 赛前数据流程
.\run_latest_ybty.ps1 # 处理浏览器扩展最新导出
```

`team_aliases.json` 为人工维护别名库，`team_aliases_auto.json` 为自动学习结果，`team_aliases_suppressed.json` 为抑制列表。

后续AI和开发者必须先阅读 [系统与数据契约](docs/AI_SYSTEM_AND_DATA_CONTRACT.md)，其中完整定义YBTY/雷速滚球与赛前导入、三种Prompt导出及Gemini结果导入格式。启动说明见 [LOCAL_STARTUP.md](LOCAL_STARTUP.md)，架构约束见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。本项目只提供分析和决策辅助，不自动下注。
