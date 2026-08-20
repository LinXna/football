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

## 预测使用边界

- 即时比分、比赛分钟、真实盘口和实时射门数据仍是滚球判断主体。
- 近期战绩、交锋、积分、进球分布、阵容、伤停和赛程生成结构化研究证据与风险项；在系数完成历史校准前不直接加减模型分。
- 控球率、进攻次数和危险进攻不能单独代表高质量机会。没有射门位置、角度、助攻类型、身体部位和压迫信息时，不生成伪 xG。Opta 对 xG 的说明明确包含这些机会质量变量：[Opta xG definition](https://www.statsperform.com/opta-event-definitions/)。
- 市场隐含概率须去除同一市场的水位总和后再解释；盘口是市场先验，不是比赛事实，也不等于独立模型胜率。

## 后续校准要求

正式给基本面或效率指标分配权重前，至少需要保存足量的逐分钟快照和完赛结果，并按时间顺序划分训练集、验证集和测试集；使用 log loss、Brier score、校准曲线及分盘口收益作评估，禁止用同一批比赛同时拟合和验证。
