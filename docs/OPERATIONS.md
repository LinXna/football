# 项目操作与逻辑说明

## 1. 项目用途

本项目是本地运行的足球比赛数据分析工具。它接收 YBTY 和雷速的导出数据，完成球队名称匹配、滚球或赛前候选筛选、决策生成、人工复核和 AI 辅助评估。系统输出的是分析和决策辅助信息，不执行自动下注。

## 2. 目录职责

```text
src/                    React 前端
server.ts               Express API 和开发服务器入口
server/jsonStore.ts     JSON 文件读取、原子写入和多文件事务
server/routes/          按领域拆分的 API 路由
config/projectPaths.ts  项目根目录和路径解析
scripts/python/         Python 数据处理实现
scripts/powershell/     Windows 数据流程编排
scripts/cmd/            Windows CMD 启动器
sources/                只读参考输入
output/                 运行时结果、状态和台账
reports/                需要长期保留的人工报告
ybty_export_extension/  浏览器导出扩展
tests/                  Python 离线测试
```

根目录的 Python、PowerShell 和 CMD 文件是兼容入口，保留它们是为了不影响现有桌面快捷方式、任务计划和旧命令。新实现位于 `scripts/` 下。

## 3. 数据流

```text
浏览器扩展或外部市场文件
        ↓
sources/ 或 Downloads 中的导出 JSON
        ↓
football_live.py：读取、过滤、球队匹配、趋势计算
        ↓
output/*_candidates.json
        ↓
recommend_live.py / recommend_prematch.py：决策与研究队列
        ↓
output/*_decisions.json、状态文件、台账
        ↓
server.ts API
        ↓
src/ React 页面、人工补充和 AI 评估
```

## 4. 常用操作

安装前端依赖：

```powershell
pnpm install
```

启动本地 Web 应用：

```powershell
pnpm dev
```

启动完成后可访问 `GET /api/health` 检查服务状态。

生产构建和启动：

```powershell
pnpm build
pnpm start
```

处理当天市场文件的基础实时流程：

```powershell
.\run_daily.ps1
```

处理浏览器最新导出的实时数据：

```powershell
.\run_latest_ybty.ps1
```

处理赛前数据：

```powershell
.\run_prematch.ps1
```

同时运行实时和赛前流程：

```powershell
.\run_both.ps1
```

持续轮询实时流程：

```powershell
.\run_monitor.ps1
```

打开别名管理界面：

```powershell
.\manage_team_aliases.cmd
```

## 5. 关键数据文件

- `team_aliases.json`：人工确认的球队别名，优先级最高。
- `team_aliases_auto.json`：程序自动学习的别名。
- `team_aliases_suppressed.json`：禁止自动重新加入的别名。
- `output/recommendation_ledger.json`：当前推荐台账。
- `output/recommendation_ledger_archives.json`：已归档台账。
- `output/pipeline_status.json` 与 `output/prematch_pipeline_status.json`：最新流程状态。

回测页面自动读取 `output/` 中最近修改的 `BACKTEST_REPORT_*.md` 和 `formal_results_*.json`；新报告应沿用这些命名规则。

`sources/` 不应被运行流程覆盖；`output/` 可以重建，不应作为源码或长期归档位置。

可以安全清空 `output/` 后重新运行相应流程：服务端会将缺失的运行结果视为“暂无数据”，并在下一次分析、台账或 AI 操作时按既定文件名重新生成。仓库只保留 `output/.gitkeep` 作为目录标记。

别名操作会自动去除首尾空格；标准名称和别名不能是同一名称，且同一个别名会从其他人工映射中移除，保证一个别名只对应一个标准球队。

## 6. 开发与验证

TypeScript 检查：

```powershell
pnpm lint
```

Python 离线测试：

```powershell
python -m unittest discover -s tests -p 'test_*.py'
```

执行完整验证（类型检查、Python 测试、构建和健康检查）：

```powershell
.\verify.ps1
```

只跳过构建时使用：` .\verify.ps1 -SkipBuild `。

Python 脚本命令说明：

```powershell
python football_live.py --help
python recommend_live.py --help
python recommend_prematch.py --help
```

## 7. 已知边界与维护规则

- `server.ts` 仍是后端单体入口，包含 API、AI 调用和部分业务规则；后续应按 API 领域继续拆分路由和服务。
- AI 评估依赖 `.env` 中的 Gemini 配置；密钥不得提交。
- 可通过 `.env` 中的 `GEMINI_MODEL` 覆盖默认模型；未设置时使用项目默认模型。
- 浏览器导出文件必须满足脚本要求的时间差和时效限制，否则流程会主动停止。
- `output/` 中的历史验证 JSON 可能很大。需要保留的人工结论应迁移至 `reports/`，并用日期命名。
- 执行迁移后的脚本时，优先通过根目录兼容入口或 `scripts/` 内对应流程启动器运行；不要依赖任意当前工作目录。
