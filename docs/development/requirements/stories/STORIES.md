# 用户故事索引

> 本文件只维护 Story 文档索引；优先级队列、当前 Story 和进度视图统一见 [BOARD.md](../../../BOARD.md)。状态与权限见 [STATES.md](../../../os/process/STATES.md)，卡片 Status 为权威，目录不决定状态。

## Story 清单

| Story | 标题 / 用户价值 | 文件链接 |
|---|---|---|
| US-001 | 判断每日定时任务的运行与数据完整性（FS P0 首批）— **Completed（2026-11-05）** | [Story](./active/US-001-cron-worker-health-and-data-completeness.md) |
| US-002 | 从看板追到原因——停滞提示、再平衡分发记录与原始日志下钻（FS-cron-worker-status-board P1） | [Story](./active/US-002-board-drilldown-and-staleness.md) |
| US-003 | 组合详情「总览」——卡片说偏了，点进去看得见（FS-portfolio-ia-cleanup 交付单元 A） | [Story](./active/US-003-portfolio-detail-overview-ia.md) |
| US-004 | Dashboard 组合健康表——首屏回答「哪个账户该先动」（FS-portfolio-ia-cleanup 交付单元 B） | [Story](./active/US-004-dashboard-portfolio-health.md) |
| US-005 | 交易流水查询与筛选——「上个月投了多少」不用逐页翻（FS-transaction-query-filters） | [Story](./active/US-005-transaction-query-filters.md) |

取消 Story 保留索引链接及退出标记，统计时按 STATES.md §2.3 排除；恢复或归档修复链接并保持编号。不要在本索引另行维护进度计数、状态或优先级。

## 创建 Story

使用唯一正式 [STORY_TEMPLATE.md](../../../os/templates/STORY_TEMPLATE.md)，文件命名 US-<三位编号>-<简短名称>.md；编号全局递增、不复用。关系与拆分规则见 [REQUIREMENTS.md](../../../os/process/REQUIREMENTS.md)。
