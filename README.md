# 第一阶段滚球数据采集器

该工具每天从 SofaScore 获取正在进行的足球比赛，将其与本地盘口 JSON
进行球队双向匹配，并输出统一的滚球候选数据。第一阶段不接实时赔率，
因此输出是“待进一步分析的候选”，不是自动投注指令。

## 每天运行

```powershell
python football_live.py sources\soccer_odds_20260728.json sources\prime_market_data_for_ai.json
```

默认先尝试 SofaScore；若被限制访问，会自动切换到 ESPN 免费实时源。也可以指定：

```powershell
python football_live.py sources\soccer_odds_20260728.json --provider espn
```

默认结果写入 `output/live_candidates.json`，内容包括：

- 当前比分、分钟和比赛状态
- 射门、射正、控球、角球、红黄牌等可用统计
- 进球、红牌、换人等比赛事件
- 原始盘口来源
- 赛事匹配置信度
- B/C 候选评分及数据不足提示
- 未匹配的盘口赛事

匹配完成后运行保守决策层：

```powershell
python recommend_live.py output\live_candidates.json
```

它会拦截过期盘口、模拟/电竞赛事、缺少关键实时统计或超出滚球窗口的场次，
并把其余场次标记为 `WATCH`（B级候选）或 `PASS`。模型不会在盘口时间不明时
把旧赔率当作当前赔率，也不会为了产生推荐而放宽条件。

无需手写当天文件名的日常入口：

```powershell
.\run_daily.ps1
```

它会自动选择当天的 `soccer_odds_YYYYMMDD.json` 和长期盘口库，并输出带日期的结果文件。
如果盘口来自刚刚抓取的已登录页面快照，可直接指定：

```powershell
.\run_daily.ps1 -MarketFile output\ybty_live_snapshot.json
```

该入口会连续生成候选文件和决策文件，不需要再手工执行第二条命令。

安装YBTY本地导出扩展后，最简日常流程是：在盘口页点击一次“一键导出盘口”，
随后运行：

```powershell
.\run_latest_ybty.ps1
```

脚本会自动找到下载目录里最新的YBTY快照，不需要复制文件名或路径。

持续监控并形成最近5/15分钟走势：

```powershell
.\run_monitor.ps1
```

默认每60秒保存一次统计快照。首次运行会直接读取雷速详情中已有的分钟事件，
生成标注为 `incident_timeline` 的5/15分钟事件趋势；积累满5分钟和15分钟后，
再优先使用射门、射正、进攻和危险进攻等累计统计的快照差值。事件趋势不会被
冒充为完整统计趋势。

盘口源也可以直接传入常见 TXT 导出，只要比赛行类似
`主队 vs 客队`、`主队 v 客队`、`主队 — 客队` 或 `主队 对阵 客队`。

## YBTY 已登录页面

`ybty_dom_extractor.js` 是该页面的专用渲染层提取器。它只读取页面已经显示的
比赛和盘口，不接触账号、密码、Cookie或浏览器存储。由于页面使用虚拟滚动，
自动化调用方需要逐屏滚动，按联赛、主队、客队组合去重后保存为 JSON。

## 球队别名

在 `team_aliases.json` 中添加中文、英文或当地语言别名，可提高跨平台匹配率。
程序还会自动处理重音符号、常见俱乐部后缀和轻微拼写差异。

## 离线验证

可保存 SofaScore 返回的数据后运行：

```powershell
python football_live.py sources\soccer_odds_20260728.json --live-fixture sample_live.json
```

## 当前边界

- 仅匹配当前正在进行或半场中的比赛。
- SofaScore/ESPN 未覆盖的低级别赛事会列入 `unmatched_markets`。
- 未接入当前让球、大小球及赔率变化，最高只标为 B 级候选。
- 网站接口属于第三方公开接口，若结构或访问策略变化，需要更新采集适配。
