# 雷速接口字段参与预测的方法约束

## 原则

接口字段先完成口径校验，再生成可解释指标。没有经过本系统历史完赛样本的时间切分验证、概率校准和回测，不得把字段存在与否或单场高低值直接换算成任意加减分。

## 滚球射门与门将指标

依据 [Opta Event Definitions](https://www.statsperform.com/opta-event-definitions/)：射正包括进球和被门将扑出的射门；射偏不包括被封堵射门。因此当前接口只有射正和射偏时：

- `recorded_shots = shots_on_target + shots_off_target`，明确标注不是完整射门数；
- 射正率 = 射正 / 当前可记录射门；
- 进球效率 = 进球 / 当前可记录射门；
- 射正转化率 = 进球 / 射正；
- 门将扑救率 = (面对射正 - 失球) / 面对射正。

若进球数大于射正数，可能存在乌龙球或数据不同步，相关转化率和扑救率判为不可用。射正少于 3 次或当前可记录射门少于 5 次时标记为小样本，不据此直接升降评分。

简单扑救率不能等同门将真实能力。StatsBomb 的门将研究使用 PSxG/GSAA 校正射门质量，并强调小样本扑救表现不稳定：[Goalkeeper analysis](https://statsbomb.com/articles/soccer/goalkeepers-how-repeatable-are-shot-saving-performances/)、[Post-shot expected goals](https://statsbomb.com/articles/soccer/a-new-way-to-measure-keepers-shot-stopping-post-shot-expected-goals/)。当前接口没有射门落点、轨迹和 PSxG，所以系统只报告观察值，不伪造 GSAA。

## 双轨盘口在预测与执行中的严格分工

1. **YBTY 盘口（执行源）**：
   - 唯一的真实可投注盘口与盈亏结算依据。AI 推荐输出的玩法、选项 ID、赔率必须完全以 YBTY 为准。
2. **雷速盘口（参考与预测辅助源）**：
   - 雷速的初盘（`opening`）与即盘（`instant`/`live`）作为全网机构预期基准线，用于量化机构初定实力差、监测滚球盘口衰减与异动，辅助提升预测的逻辑置信度与安全边际，严禁用作投注下单与结算。

## 动能引擎双模架构：单批次首批即激活与跨批次差分 (Single-Import vs Multi-Snapshot)

为消除“必须依赖二次导入才能展现动能与盘口表现”的系统瓶颈，系统设计并实施了**动能时序波形与盘口合流双模引擎**：

### 1. 单批次/首批次导入即时激活 (First Import Instant Activation)
- **攻势动量时序穿透**：直接解析雷速逐分钟压制波形（`attack_momentum_timeline`），无需等待后续批次即可计算近15分钟攻势斜率、均分与战术形态（单边窒息压制/中场泥潭缠斗/持续起势）；
- **初盘先验 vs 即盘即时对比**：提取雷速初始让球/大小球与当前 YBTY 滚球盘口（或雷速即盘参考），立刻输出盘口衰减量与 4 大战术成色评判；
- **Prompt 导出与前端视图同步**：即使系统只有单次快照，Prompt 导出与 UI 视图也会完整注入动量形态报告与初即对比结论，绝不显示“待二次导入”的空白占位。

### 2. 跨批次多快照差分计算 (Cross-Batch Multi-Snapshot Differencing)
- **离散指标速度与加速度**：基于缓存的多时间点快照（`match_snapshot_history.json`），计算离散时间窗口内的危攻加速度（`dangerous_attacks_rate_per_min`）、射正净增量与控球率转移；
- **盘口水位漂移与黄金切入点**：对比前后两次采样的滚球盘口升降（`ou_line_drop`）与水位浮动，结合攻势加速度自动捕捉“大小球大幅掉落而攻势持续高涨”的黄金切入契机（`GOLDEN_ENTRY_LINE_DROP`）。

## 赛前初盘 vs 滚球即盘偏离度与战术成色研判 (Initial vs Live Expectation)

### 1. 衰减与偏离度计算
- **让球衰减量**: `handicap_decay = current_handicap - initial_handicap`
- **大小球衰减量**: `total_decay = current_total - initial_total`
- **即盘多层穿透逻辑**: 优先提取实时 YBTY 滚球盘口；若 YBTY 因特定时段临时封盘或未开，系统自动穿透提取雷速即盘数据（`instant_handicap` / `instant_total`、`current_line`、`markets.*.live`），保障初即对照不中断。

### 2. 战术成色与价值模式识别
- **🔥 强队破门迟滞·初盘折价黄金期 (`VALUE_DILUTION_OPPORTUNITY`)**：
  - *特征*：赛前初盘深让（如 `-0.75` 或更深），随着比赛时间推移（如第 50-70 分钟比分仍平局），即时让步折价至浅盘（如 `-0.25` 或平半）；但场面危攻比、射正数与控球率显示强队持续维持绝对围攻态势。
  - *研判价值*：机构因时间衰减释放出更低的门槛与更具防守边际的盘口空间，构成极佳的战术成色博弈机会。
- **⚠️ 强队攻势疲软·谨防初盘诱深 (`PERFORMANCE_BELOW_INITIAL`)**：
  - *特征*：赛前机构深让，但场面进攻极其乏力、射正过少甚至被对手频频反击，实际表现严重落后于初盘设定。
  - *研判价值*：提示初盘名气诱盘或强队轮换战意不足，坚决避免盲目按“强队名气”追单，触发防爆冷预警。
- **🚀 战局反客为主 / 超出初盘预期 (`PERFORMANCE_BEATS_INITIAL`)**：
  - *特征*：赛前平手或浅盘拉锯，场面实际呈现出单边攻势压制。
- **⚖️ 契合初盘预期 (`PERFORMANCE_MATCHES_INITIAL`)**：
  - *特征*：攻势走势与初盘预期及时间衰减完全匹配。

## 全指标联合物理演算与战术反转约束 (Universal Penetration & Tactical Calibration)

为防止单一指标割裂与刻板阵型误导，系统在特征工程中执行严格的联合约束：

1. **三层渗透递进计算 (Effective Territory $\to$ Disruption $\to$ Lethality)**：
   - 控球率不直接贡献优势，必须与三区危险进攻和终结动作（射正、造牌、角球）形成乘积门控；
   - 控球率 $\ge 65\%$ 但射正 $\le 1$ 且角球 $\le 1$ 时，自动降级判定为 `STERILE_POSSESSION`（无效传控），阻止向高控方推荐深盘。
2. **角球与定位球高危空战通道 (Set-Piece Dominance)**：
   - 提取 90 分钟角球密度预期（$\ge 7$ 次/90'）与禁区混乱系数（`box_chaos_factor`），量化阵地战受阻但定位球轰炸能力极强队伍的真实进球潜力。
3. **脉冲式致命密度与反击捕获 (Attack Lethality Density - ALD)**：
   - 当低控球方在单次攻势中能高频转化出射正、进球或迫使对手战术犯规吃牌时（$\text{ALD} \ge 0.35$），系统判定为 `LETHAL_COUNTER`，对受让与冷门破门方向给予充分保护。
4. **贝叶斯先验时间衰减 (Bayesian Time-Decay)**：
   - 阵型几何克制等静态先验在比赛进行至 20~25 分钟时权重衰减超 50%，30 分钟后完全让位给实战 UPTS 物理表现。

## 赛前量化精算与足球计量经济学方法论 (Prematch Econometric & Tactical Quant Framework v2.5)

系统在赛前推演（`calculatePrematchQuantAnalysis`）中，采用经过欧洲顶级体育量化基金检验的实证计量经济学方法体系：

### 1. Dixon-Coles 低比分二元相关性泊松修正模型 (Dixon-Coles Bivariate Poisson)
依据 Mark J. Dixon & Stuart G. Coles (1997) 经典文献《Modelling Association Football Scores and Inefficiencies in the Football Betting Market》：
- 独立泊松假设认为主客队进球数相互独立，这在足球比赛中存在明显的结构性缺陷——当比赛处于 0-0 或 1-1 平局时，双方为了稳妥保分会收缩防线、降低攻防节奏，导致低比分平局事件实际发生率显著高于独立二项分布预测；
- 系统引入相关性修正函数 $\tau(x, y, \lambda_H, \lambda_A, \rho)$（基准相关系数 $\rho = -0.07$）：
  $$\tau(x, y) = \begin{cases}
  1 - \lambda_H \lambda_A \rho & (x=0, y=0) \\
  1 + \lambda_A \rho & (x=1, y=0) \\
  1 + \lambda_H \rho & (x=0, y=1) \\
  1 - \rho & (x=1, y=1) \\
  1.0 & (\text{其他比分})
  \end{cases}$$
- 展开为 $8 \times 8$（0~7 球）二元概率矩阵后进行全概率归一化，精准消除了全场 1X2 平局及大小球低比分定价的系统性负偏差。

### 2. 历史交锋 (H2H) 时效衰减与主客同态加权 (Temporal Half-Life & Venue Weighting)
现代职业足球战术周期更迭极快（平均战术与人员半衰期约 1~1.5 年）：
- **指数时间衰减**：设定半衰期 $T_{\text{half}} = 438$ 天（1.2 年），权重为 $w(t) = \exp\left(-\frac{\Delta t}{438}\right)$；
- **3 年硬性截断**：$\Delta t > 1095$ 天的历史交锋彻底剔除（球员阵容、主教练体系均已发生根本变化）；
- **主客场同态加权**：相同主客场对阵权重乘以 $1.25$，颠倒主客场乘以 $0.80$；
- **贝叶斯样本量平滑收缩**：
  $$\lambda_{\text{H2H, final}} = \lambda_{\text{weighted}} \cdot \min\left(1.0, \frac{N}{4.0}\right) + \lambda_{\text{baseline}} \cdot \left(1 - \min\left(1.0, \frac{N}{4.0}\right)\right)$$
  当交锋记录不足 4 场时，自动向联赛基准总进球（$2.65$ 球）平滑收缩，避免单场极端大比分主导推演。

### 3. 双层近期走势分解模型 (Two-Tier Form Analysis)
为防止“主场龙客场虫”或“假性客场连胜”的样本污染，系统将近期战绩拆分为双层结构：
- **Layer 1（65% 纯净主客场环境）**：主队仅取主场真实进球/失球期望，客队仅取客场真实进球/失球期望；
- **Layer 2（35% 交叉环境）**：主队客场表现与客队主场表现作为基础实力底座；
- **近 6 场时间递减衰减向量**：$[0.28, 0.23, 0.18, 0.14, 0.10, 0.07]$，赋予最新一场比赛近 $4\times$ 于第 6 场比赛的权重。

### 4. 联赛积分梯队与 6 大博弈陷阱排查 (Standings Traps & Tactical Payoffs)
- **中游散步陷阱 (`MID_TABLE_COMPLACENCY`)**：双方排第 8~14 名，既无欧战/升级希望又无降级之忧，战意松弛，领先易控节奏，对强行穿深盘实施 $25\%$ 信心惩罚；
- **保级保平默契陷阱 (`MUTUAL_DRAW_SURVIVAL`)**：赛季中后段保级区直接对话且分差 $\le 1$ 分，各拿 1 分均为理性纳什均衡，系统调高平局修正因子 $\tau_{\text{draw}} +0.12$，触发小球防御；
- **悬崖保级死磕陷阱 (`RELEGATION_DESPERATION`)**：客队身陷降级区死磕防守，破坏强队阵地战进攻流畅度。

### 5. 动态半场动力学模型 (Dynamic First-Half Kinetics)
- 提取双方赛季真实的 $0\sim 45$ 分钟进球占比；
- 在 $[0.35, 0.52]$ 动态区间内计算半场期望进球 $\lambda_{\text{half}} = \lambda_{\text{full}} \times \text{Ratio}_{\text{half}}$，替代固定静态比例。

### 6. 数据资产完备度分级与 EV 削顶防御 (Data Completeness Tiering)
- `FULL_A`：首发名单确认、有效交锋 $\ge 3$、近期走势 $\ge 4$、积分榜完备。允许最高置信度，EV 上限 $35\%$；
- `STANDARD_B`：基础战绩完备。EV 削顶上限 $22\%$，防止小样本暴冲；
- `DEGRADED_C`：数据严重缺失。置信度强制定为 `LOW`，EV 上限强制限幅 $\le 8\%$，系统平滑退化为纯市场共识。

## 预测使用边界与单向推演铁律 (Forward-Only DAG)

1. **单向因果推演链（严禁比分倒推）**：
   - 必须严格遵循 `物理动能与进球期望 (λ_home, λ_away) → 盘口公允概率积分 (P_model) → 比对机构赔率计算 +EV → 泊松矩阵最高频比分离散展示`；
   - 离散比分只是二元矩阵的最高频统计切片，单点概率通常仅 $10\%\sim 15\%$，绝非连续累积分布盘口（如大小球、让球）的推导前提。
2. **非破坏性量化审计**：
   - 系统检测到理由包含“预测比分是X-X”、“看好X-X所以推荐”等倒推特征时，保留原始文本并在数据层和前端 UI 标记 `⚠️ 倒推标记`。
3. 即时比分、比赛分钟、真实盘口和实时射门数据仍是滚球判断主体。
4. 近期战绩、交锋、积分、进球分布、阵容、伤停和赛程生成结构化研究证据与风险项；在系数完成历史校准前不直接加减模型分。
5. 控球率、进攻次数和危险进攻不能单独代表高质量机会。没有射门位置、角度、助攻类型、身体部位和压迫信息时，不生成伪 xG。Opta 对 xG 的说明明确包含这些机会质量变量：[Opta xG definition](https://www.statsperform.com/opta-event-definitions/)。
6. 市场隐含概率须去除同一市场的水位总和后再解释；盘口是市场先验，不是比赛事实，也不等于独立模型胜率。

## 后续校准要求

正式给基本面或效率指标分配权重前，至少需要保存足量的逐分钟快照和完赛结果，并按时间顺序划分训练集、验证集和测试集；使用 log loss、Brier score、校准曲线及分盘口收益作评估，禁止用同一批比赛同时拟合和验证。
