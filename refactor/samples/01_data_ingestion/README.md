# 数据接入层样例与规范索引目录 (01 Data Ingestion Samples Index)

本目录为 Layer 01（数据接入与清洗层）清洗后标准 JSON 样例文件及其中文对照文档的总索引。

---

## 1. 快速导航与排查索引

| 数据源类型 | 样本数据文件 (JSON) | 对应中文全量字段对照手册 (Markdown) | 提取器与类型契约实现 |
| :--- | :--- | :--- | :--- |
| **雷速 (Leisu)**<br>赛事详情/阵容/技术统计/事件 | [`leisu/leisu_extracted_sample.json`](./leisu/leisu_extracted_sample.json) | 👉 [**`leisu/README.md`**](./leisu/README.md) | 提取器: `refactor/01_data_ingestion/leisu/leisuInterfaceExtractor.ts`<br>类型契约: `refactor/01_data_ingestion/leisu/types.ts`<br>枚举管理: `refactor/01_data_ingestion/leisu/enums.ts` |
| **YBTY 滚球**<br>滚球盘口/比分/即时状态 | [`ybty/ybty_live_extracted_sample.json`](./ybty/ybty_live_extracted_sample.json) | 👉 [**`ybty/README.md`**](./ybty/README.md) | 提取器: `refactor/01_data_ingestion/ybty/ybtyLiveExtractor.ts`<br>类型契约: `refactor/01_data_ingestion/ybty/types.ts`<br>枚举管理: `refactor/01_data_ingestion/ybty/enums.ts` |
| **YBTY 赛前**<br>赛前盘口/开赛倒计时 | [`ybty/ybty_prematch_extracted_sample.json`](./ybty/ybty_prematch_extracted_sample.json) | 👉 [**`ybty/README.md`**](./ybty/README.md) | 提取器: `refactor/01_data_ingestion/ybty/ybtyPrematchExtractor.ts`<br>类型契约: `refactor/01_data_ingestion/ybty/types.ts`<br>枚举管理: `refactor/01_data_ingestion/ybty/enums.ts` |

---

## 2. 全局数据契约与架构总纲

若需查看全系统层级的完整数据契约与各模块联动说明，请查阅：
- 📖 **全系统数据契约大典**：[`/refactor/DATA_SPECIFICATION.md`](../../DATA_SPECIFICATION.md)
- 📖 **系统整体架构与执行流水线**：[`/refactor/SYSTEM_ARCHITECTURE_AND_PIPELINE.md`](../../SYSTEM_ARCHITECTURE_AND_PIPELINE.md)
- 📖 **开发工作快照与进度看板**：[`/refactor/HANDOVER_AND_PROGRESS.md`](../../HANDOVER_AND_PROGRESS.md)
