# 飞书与 SQLite 历史数据迁入 MySQL

此工具仅用于停写窗口的一次性导入。正常运行后 MySQL 为唯一业务数据源，飞书和旧 SQLite 作为历史存档保留，不进行双写或定时同步。先按 `README.md` 初始化独立大会数据库并备份源数据，不得指向官网业务库。

## 来源与格式

用 `lark-cli base +record-list --base-token <base-token> --table-id <table-id> --format json --limit 200 --as bot` 导出全部报名，必须检查并读取所有分页，包含已删除记录。CLI 的列式输出需按 `fields`、`record_id_list` 与 `data` 的位置关联，整理为：

```json
{"records":[{"record_id":"源记录 ID","fields":{"Registration Reference / 报名编号":"原编号"}}],"revision":205,"timezone":"Asia/Shanghai"}
```

`fields` 中须保留全部原始字段。另使用 SQLite 在线备份 API 创建一致性副本，再从该副本的 `vip_codes`、`vip_attempts`、`vip_events`、`vip_meta` 表导出为 JSON 的 `codes`、`attempts`、`events`、`meta` 数组。不要直接复制运行中的 SQLite 主文件而忽略 WAL。

所有导出、密钥、配置和报告保存在 web root 与 Git 外、权限为 0700 的目录内，文件权限 0600。不要把个人数据或 VIP 明码输出到日志。新环境必须保留原 `VIP_CODE_ENCRYPTION_KEY`。

## 验证与执行

```bash
node --test test/legacy-import.test.js
npm run test:mysql
node server/import-legacy.js /private/registrations.json /private/vip.json
node server/import-legacy.js /private/registrations.json /private/vip.json --apply
```

不带 `--apply` 时只解析、校验，不写数据库。导入会拒绝非空业务库、重复有效邮箱、重复编号、非法日期、未解决的 VIP 核销状态或无法匹配的核销关联；全部写入在同一事务中提交。相同来源重复执行会返回已导入，来源改变则拒绝覆盖。迁移摘要和来源记录 ID 写入审计表。

保留报名原编号、提交时间、费用、审核及软删除状态；无时区的旧飞书日期按 Asia/Shanghai 转为 UTC。源字段完整保存在 `attendee_snapshot._legacyFeishu`，不能据当前套餐价格重算历史费用。VIP 密文、状态、核销及操作说明沿用旧数据。

导入只建立空资料条目，不授权、不发布、不创建邮件任务或补交凭证。若源记录已有图片、资料状态或补交凭证，工具会拒绝执行，需要另行迁移附件与身份状态，不能丢弃。历史报名人需要补交时，由后台重发专属链接。

## 上线与恢复

在最终导出前停止大会进程，完成快照、校验、导入及对账后再启动 MySQL 版本；官网其他进程继续运行。检查 `/health` 的 `database=mysql`、`schemaReady=true`、`ok=true` 和邮件、VIP、资料配置状态，并核对有效报名、回收站、金额、VIP 核销与历史事件。

补交页面地址为 `https://lp-club.cn/2026-pe-conference/materials#ref=报名编号&token=专属凭证`，部署需保留子路径，上传接口须设置独立的 6m 请求体限制。迁移不向历史报名人自动发送邮件。

上线后配套备份 MySQL、私有原件和稳定密钥。新版开始接收写入后，不得直接切回旧飞书版本；必须先停写、保留新库完整快照，再核对新增业务数据并制定恢复方案。
