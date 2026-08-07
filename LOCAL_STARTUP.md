# 本地启动说明（Windows）

项目由两部分组成：

- Web 管理界面：React + TypeScript + Express，访问地址为 `http://127.0.0.1:3000`。
- 足球数据分析流水线：Python + PowerShell，负责处理 YBTY、雷速、滚球和非滚球数据。

`sources/` 是只读参考资料，不要修改、移动或删除其中的文件。

## 一、首次准备

### 1. 确认运行环境

在 PowerShell 中执行：

```powershell
node --version
npm --version
python --version
```

当前项目已验证的本机版本为：

- Node.js `v22.22.3`
- npm `10.9.8`
- Python `3.13.3`

### 2. 安装前端和服务端依赖

打开 PowerShell，进入项目目录：

```powershell
Set-Location -LiteralPath 'D:\开发\football\CODEX'
npm install
```

`npm install` 成功后会生成 `node_modules/`。通常只需首次运行或依赖变化后重新执行。

### 3. 配置 AI 密钥（可选）

只有使用网页中的 Gemini AI 评估功能时才需要设置：

在项目根目录创建 `.env`，并写入：

```dotenv
GEMINI_API_KEY=你的_Gemini_API_Key
```

`npm run dev` 和 `npm start` 会自动加载 `.env`。不要把真实密钥写入会被 Git 跟踪的 `.env.example`，也不要写入前端源码。

如果不使用 AI 评估功能，可以不设置；滚球、非滚球分析和普通页面仍可使用。

## 二、日常启动 Web 管理界面

在项目目录执行：

```powershell
Set-Location -LiteralPath 'D:\开发\football\CODEX'
npm run dev
```

看到以下类似信息表示服务已启动：

```text
[LX Football System] Express Server running on http://127.0.0.1:3000
```

然后用浏览器打开：

```text
http://127.0.0.1:3000
```

服务仅监听本机地址，局域网其他设备默认无法访问，这是预期的安全设置。

停止服务：回到运行服务的 PowerShell 窗口，按 `Ctrl+C`。

## 三、运行足球分析流水线

### 推荐方式：图形菜单

双击项目根目录中的：

```text
run_analysis.cmd
```

图形菜单可启动滚球、非滚球、球队别名管理，以及完整整合数据导出。

### 直接运行滚球分析

先确保浏览器扩展已把最新 YBTY 与雷速滚球 JSON 导出到 Windows“下载”目录，然后执行：

```powershell
Set-Location -LiteralPath 'D:\开发\football\CODEX'
.\run_latest_ybty.ps1
```

默认限制：

- YBTY 与雷速快照时间差不超过 180 秒。
- 导出文件年龄不超过 900 秒。

### 直接运行非滚球分析

导出最新的 YBTY 与雷速非滚球 JSON 后执行：

```powershell
Set-Location -LiteralPath 'D:\开发\football\CODEX'
.\run_prematch.ps1
```

也可以双击：

```text
run_prematch.cmd
```

### 同时运行滚球和非滚球

```powershell
.\run_both.ps1
```

### 持续监控滚球趋势

```powershell
.\run_monitor.ps1
```

默认每 60 秒保存一次快照，用于形成最近 5/15 分钟趋势。

## 四、推荐的日常顺序

1. 在 YBTY 页面展开需要分析的赛事并导出相应盘口。
2. 在雷速页面导出同一批次的赛事数据。
3. 运行 `run_analysis.cmd`，选择滚球或非滚球分析。
4. 确认流程状态、快照时间差、成功匹配和未匹配赛事。
5. 启动 Web 界面：`npm run dev`。
6. 在浏览器打开 `http://127.0.0.1:3000` 查看候选、补充数据和进行 AI 深挖。
7. 只有完成基本面、战意、阵容、伤停、盘口价值和风险核验后，才写入正式推荐台账。

机器产生的 `WATCH`、`RESEARCH` 或候选评分不是正式投注推荐。

## 五、正式推荐写入要求

Web 服务会拦截不完整的正式推荐。写入前需要满足：

- 等级为 A 或 B。
- 有明确的北京时间。
- 有完整市场、盘口和数值赔率。
- 滚球推荐必须有已核验比分、比分来源和推荐分钟。
- 串关每一腿都有队名、市场、盘口、赔率、时间及独立研究结论。
- 同一场可以在不同串关采用不同玩法，但每个玩法必须独立研究。
- B级同一方向最多进入一组；符合条件的A级同一方向最多进入两组。

## 六、检查与构建

安装依赖后可执行：

```powershell
npm run lint
npm run build
```

Python 回归测试：

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
python -m unittest discover -s tests -v
```

生产方式启动：

```powershell
npm run build
$env:NODE_ENV='production'
npm start
```

生产模式同样访问 `http://127.0.0.1:3000`。

## 七、常见问题

### `vite`、`tsx` 或 `tsc` 不是内部或外部命令

说明依赖尚未安装，执行：

```powershell
npm install
```

### 端口 3000 已被占用

查找占用进程：

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess
```

确认进程后再决定是否关闭。不要在未确认进程用途时强制结束。

### 网页能打开，但没有最新比赛

Web 页面只读取 `output/` 中已有的最新结果。请先重新导出 YBTY、雷速数据并运行相应分析脚本。

### AI 评估提示缺少 `GEMINI_API_KEY`

在项目根目录创建 `.env`：

```dotenv
GEMINI_API_KEY=你的_Gemini_API_Key
```

然后彻底重启 Node 服务并执行 `npm run dev`。

### PowerShell 阻止脚本执行

仅对当前进程临时放行：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

然后重新运行对应 `.ps1` 脚本。
