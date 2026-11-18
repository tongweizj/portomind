# TASK-077 历史 symbol 工具

## 只读探测

从仓库根目录运行，先按 [部署手册 §3–4](../docs/handbook/ops/DEPLOYMENT.md#3-安装依赖) 安装依赖并配置连接。建议使用有目标库读取权限的专用账号。连接优先级为命令行、进程的 MONGO_URI、server/.env 的 MONGO_URI。URI 必须显式包含库名。

    node scripts/probe-symbol-data-quality.cjs --help
    node scripts/probe-symbol-data-quality.cjs
    node scripts/probe-symbol-data-quality.cjs --uri "<隔离开发库 URI>" --out "<报告路径>"

默认输出 [TASK-077 分类报告](../docs/development/tasks/active/TASK-077-data-quality-report.md)。自定义输出的父目录须已存在，相对路径从当前目录解析。同名报告会被替换。报告含资产和文档标识，应按数据库信息的访问权限保存。

脚本使用 MongoDB 原生驱动，探测接口仅开放读取和无写出的聚合。脚本不会建立业务索引、修复数据或注册调度。现有的隔离库可直接用于探测。需要镜像时，参照 [部署手册 §5](../docs/handbook/ops/DEPLOYMENT.md#5-本地开发搭建) 选择源和独立目标，先预览方向和集合。sync:db 会覆盖目标集合并清理临时归档，执行前先保全目标上需要保留的数据。尽量在镜像和应用停写期间探测。

### 读报告

「（无）」表示该类扫描成功且无发现。「扫描失败」表示该类结果未知，脚本写出其他类别后返回非零退出码。连库失败时在终端报错。表中「标识」可定位资产、任务或文档与目标下标，「值」保留精确键、运行状态或归属，「数量」按该类的单位计量，「日期范围」是该行的观测区间。「建议严重度」衡量排查优先级，「升级建议」帮助 Human 判断。价格日期显示 UTC，失败日按调度时区。报告头记录库名、探测日期、脚本和共用模块的 SHA256。

| 类别 | 口径和误报排查 |
|---|---|
| 双键资产、键歧义与旧键影响 | 遍历全部 active=true 的资产，匹配旧存储键、由 TASK-073 派生的裸码与新键，以及这些键的大小写变体；按精确存储值列各自价格条数和最早至最晚时间。裸码可同时被多个市场使用，价格的 market 字段不足以缩小按 symbol 整组删除的范围。核对候选资产、市场和精确键后再决定。旧键影响行提示现有历史将无法按目标键命中，历史保留。 |
| 资产 symbol 格式 | 依据 Asset 模型校验和 ADR-003 的 market 派生。核对 market、前导零和原始大小写。 |
| NOT_FOUND 连续失败 | 同任务、资产和 provider 最近一段连续日历日；同一天多次失败只算一天，缺日断开。日期范围为该段，另显示历史失败日数和币种桶。休市、未执行、换 provider、成功及缺日志都可能导致缺日；以 TaskRun 和后续市场查询确认当前影响。 |
| 僵尸 RUNNING | 复用 cron status 的阈值函数，起始时间严格早于阈值。先核对 worker、日志和任务是否仍在执行。 |
| 悬挂 symbol 引用 | 交易及资产级目标按存储 symbol 精确对照全部资产，包含停用资产。缺省 level 的历史目标按 Portfolio 模型的默认值视为资产级，迁移保留字段缺省形态。因大小写或旧别名造成的表面悬挂可用迁移映射复核。asset_class 目标无需资产引用。 |

Human 可根据影响范围、复现频率、归一后是否仍存在、数据能否稳定获取，指定某类升级到 TASK-076。提供报告版本、类别、可复现文档标识和期望告警行为，由 TASK-076 的负责人更新其范围与验收。

## 迁移预览、备份和确认

    node scripts/migrate-symbol-data.cjs --help
    node scripts/migrate-symbol-data.cjs --uri "<目标 URI>" > "<私有目录>/plan.json"
    node scripts/migrate-symbol-data.cjs --uri "<目标 URI>" --force --approval "<私有目录>/approval.json"

默认或显式 --dry-run 仅读库。标准输出是冻结的 JSON，包含目标库与四个集合的 UUID、文档和索引指纹、逐条映射、逐资产的两套精确删除键及其条数和日期范围、歧义、旧键影响、未解析引用和阻断项。blockers 非空时退出码为 1。先请 Orchestrator 确认旧键影响与未解析引用的验收口径。Human 核对精确删除清单并批准具体执行，保存原文件字节与 SHA256。含歧义的双键资产、缺少有效 market 或唯一键碰撞需要先处理再生成清单。无法归属的引用保留原值。

执行前暂停目标库的 API、worker、采集、导入、镜像和其他写入者，并持续停写到完成。按 [部署手册 §10](../docs/handbook/ops/DEPLOYMENT.md#10-备份与迁移) 核定目标。对已停写的实际目标库保留持久的 mongodump gzip archive。sync:db 可用于镜像演练，它的临时归档会在命令结束后删除。用 MongoDB Database Tools 另存持久归档，并把同一文件用 mongorestore 试还原到与目标同一实例的独立库。用独立库名、明确的 namespace 选择及源到试还原库的映射核对方向。归档与试还原库应保持至验收结束。例如：

    mongodump --uri="<目标库 URI>" --gzip --archive="<私有目录>/before.archive"
    mongorestore --uri="<试还原库 URI>" --gzip --archive="<私有目录>/before.archive" --nsInclude="<目标库>.*" --nsFrom="<目标库>.*" --nsTo="<试还原库>.*"

迁移脚本回读试还原库的四个集合，逐文档和索引对照批准清单并校验归档 SHA256。请在私有目录创建标记。路径相对于标记文件，也可用绝对路径。标记无需连接凭证。

    {
      "approvedBy": "<Human 标识>",
      "approvedAt": "<ISO 8601 时间>",
      "writersStopped": true,
      "plan": "plan.json",
      "planSha256": "<批准的 plan.json SHA256>",
      "backupDb": "<试还原数据库名>",
      "archive": "before.archive",
      "archiveSha256": "<已试还原的归档 SHA256>"
    }

标记是 Human 的本地确认记录。运行目录、归档和标记的访问应限定为本次维护人员。执行输出含迁移前后集合计数、映射与实际删除数。将清单、标记、执行输出和同目录的 plan.json.journal.jsonl 一同保留。

### 中断和回滚

- 使用同一目标 URI、同一标记和原冻结清单续跑。完成的键在日志中有记录；部分删除的键按原文档 ID 和内容恢复进度。没有开始删除的键必须完整。归一已经完成时，后续仍使用原冻结键。脚本发现新增、改写、清单或进度漂移时停止。
- 如果进程被强制结束，先确认原进程已退出、同一计划未被其他维护者使用、目标库仍停写，再移除计划旁的空 .lock 目录并续跑。保留 .journal.jsonl。日志缺失或不完整且库已变化时，人工复核现场；无法证明安全时按备份回滚。
- 回滚前保全现场和日志，重新确认目标、归档 SHA256、试还原结果和停写状态。先对试还原库核对完整性，再经 Human 批准用 mongorestore 将已验证归档恢复到实际目标库。覆盖恢复应显式限定原库 namespace，并以 --drop 覆盖选中的集合。若决定仅回滚 TASK-077 写集，限定 assets、transactions、portfolios 和 prices 四个 namespace。回读计数、索引及内容。恢复通常改变集合 UUID，后续执行须重新探测、冻结并批准清单。保留原审计文件。
- 日志记录完成后才重启写入者。完成后的原计划重复运行只返回原审计结果，保留后续采集写入的价格。下一次采集负责写回新键，历史回补由 Human 另行决定。
