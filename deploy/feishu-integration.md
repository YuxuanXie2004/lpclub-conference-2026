# 飞书通知与只读投影

MySQL 是唯一业务数据源。飞书通知使用事件快照，表格读取最新数据库状态。每次新报名通知一次；名片、头像、Logo 每个文件成功上传分别通知，授权及审核修改只同步表格。

## 配置与初始化

备份数据库及受保护配置，执行 `npm run db:init` 应用新增迁移。旧迁移不变。

在 `server/.env` 配置 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_SYNC_APP_TOKEN`、`FEISHU_SYNC_TABLE_ID`。同步目标与历史离线导入的 `FEISHU_APP_TOKEN/FEISHU_TABLE_ID` 分开，不覆盖旧配置。

通知配置 `FEISHU_BOT_WEBHOOK`、可选 `FEISHU_BOT_SECRET`，以及明确的 ISO 格式 `FEISHU_NOTIFY_SINCE`。该时间之前的事件不生成群通知任务；启用后的事件即使渠道暂停仍记录待发送任务。不要在重启时重设启用时间，也不要将真实凭据写入 Git。

先保持 `FEISHU_NOTIFY_ENABLED=false`、`FEISHU_SYNC_ENABLED=false`，依次执行：

```bash
npm run feishu:manage -- schema
npm run feishu:manage -- schema --apply
npm run feishu:manage -- backfill
```

`schema` 只读预检；`--apply` 添加缺失字段及受管业务/回收站视图，字段类型冲突会停止，不自动改类型。已有不含数据库 ID 的记录保留。应用需要多维表格字段、记录及视图读写权限，并在目标文档添加为可管理应用。时区应在 Base 设置为 Asia/Shanghai。普通查看成员设为只读；权限配置由管理员在飞书完成，表格名称不会自动授予只读权限。

配置两个渠道为 `true`，重启大会 Node 进程。后台任务每秒轮询，两个渠道独立处理；目标更新延迟为 30 秒内，积压和外部故障会延长此时间。历史回填只排队同步，不生成群通知。

## 运维

管理后台顶部展开“飞书通知与同步”，可以查看渠道开关、积压、最近成功同步、失败任务及对账结果。失败重试输入报名编号或通知任务 ID。后台接口复用原管理员鉴权：

- `GET /api/admin/integrations/feishu`
- `POST /api/admin/integrations/feishu/retry`，请求体为 `{"ref":"报名编号"}` 或 `{"jobId":"任务ID"}`。
- `POST /api/admin/integrations/feishu/reconcile`，异步排队对账。

命令行也可执行：

```bash
npm run feishu:manage -- status
npm run feishu:manage -- retry LPC26-EXAMPLE
npm run feishu:manage -- reconcile
```

每 5 分钟检查待同步版本，每 24 小时分页全量对账；比较实际字段内容，不能仅依赖飞书中的版本号或摘要。全量对账修复误改、缺失记录及重复行，重复行标记后由受管视图排除，不物理删除。未关联数据库 ID 的旧行不猜测归属，不自动覆盖。

同一数据库的飞书处理器通过专用 MySQL 连接持有命名锁，多个进程不会同时投递。所有 HTTP 请求有超时，发生临时错误按 1 分钟、5 分钟、15 分钟、1 小时退避，最多自动尝试 8 次；配置及权限错误阻塞待人工修复。成功通知不会因表格失败重发。Webhook 接收后响应丢失可能导致少量重复，卡片事件编号可用于辨识。

图片和私人补交链接不进入飞书。消息卡片的后台按钮从环境配置读取 `ADMIN_TOKEN`，作为链接的 `token` 参数以便直接访问后台。多维表格中的后台入口不携带令牌，访问仍需现有管理后台凭据。

通知暂停不影响表格同步。关闭两渠道后重启可暂停投递，数据库任务保留；恢复时沿用原启用时间。不要删除映射表或回退数据库结构。健康检查显示渠道配置，不因飞书故障使报名服务不可用。

## 验证

`npm test` 使用本地模拟请求验证卡片、签名、错误处理、独立重试、任务去重和版本并发。测试不会发送真实飞书消息。隔离 MySQL 测试需显式设置 `RUN_MYSQL_TESTS=1`，默认跳过。生产发布、生产数据库迁移及实际飞书消息验收需另行安排。
