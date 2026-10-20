# 2026-10-20 生产部署记录

已将当前工作目录版本部署到 `https://lp-club.cn/2026-pe-conference/`，业务存储切换为 MySQL。飞书和旧 SQLite 保留作为历史存档，后续业务只在新官网与管理后台维护，不进行双写或持续同步。

## 数据迁移结果

- 飞书来源：用户指定 Base 的 `tbl8lbo4hjnVHW9m`，最终修订号 205，CLI 确认无后续分页。
- 报名 23 条：有效 21 条、回收站 2 条；保留原编号、历史金额与时间，逐项核对 1,058 个字段。
- SQLite VIP 2 条，均保持已核销；保留 2 条核销关联和 17 条操作历史，旧加密密钥未更换。
- 源附件、补交凭证及资料状态均为空，因此仅初始化未授权、未发布的空资料条目。
- 迁移没有创建邮件任务，没有向历史报名人自动发送邮件。需要历史参会者补交时，在资料审核后台重发专属链接。

上述数量为迁移提交时的对账结果。上线后已出现新的报名及管理操作，实时数量会随业务变化；不得再用飞书旧快照覆盖 MySQL 的后续修改。

## 当前运行位置

- 发布目录：`/home/ubuntu/releases/lpclub-conference-20261020-1710`
- 当前版本入口：`/home/ubuntu/lpclub-conference-current`，指向上述发布目录。
- 当前生产配置：`/home/ubuntu/lpclub-conference-current/server/.env`，权限 0600。
- 持久原件：`/home/ubuntu/lpclub-conference-data/originals`，权限 0700。
- 可重建缓存：`/home/ubuntu/lpclub-conference-data/cache`，权限 0700。
- PM2 进程：`lpclub-conference`，监听 `127.0.0.1:8787`，已保存开机恢复配置。
- 独立 MySQL 库：`lpclub_conference`，15 张表，迁移版本 `002-showcase.sql`。
- 运行账号：`lpclub_conf2026`，仅具备该库 SELECT、INSERT、UPDATE、DELETE 权限；临时测试库权限已撤销，测试库已清理。后续结构迁移需要单独的迁移权限。

旧目录 `/home/ubuntu/lpclub-conference-2026` 原样保留，包含原线上未提交修改与旧 `.env`，已不被大会进程使用。后续更新须以当前生产配置和持久存储目录为准，不应重新启用旧目录里的飞书服务。

主官网 `lpclub-api` 进程未重启，官网 `lpclub` 数据库未修改。Nginx 当前实际生效的站点文件为 `/etc/nginx/sites-enabled/default`（独立文件），与 `sites-available/default` 内容不同；本次只在实际生效文件中增加大会上传接口的 6m 限制，保留其他代理和证书。

## 验证

- 本地 `npm test`：174 通过，52 个需要 MySQL 的测试跳过，无失败。
- 服务器隔离 MySQL 测试：54 通过，无跳过或失败。
- 真实数据在隔离库完整演练后，生产再次完成字段、VIP 状态与事件对账。
- 真实 HTTPS 域名的官网、健康检查、后台鉴权、资料页面及 JS/CSS、公开展示和资料配置接口通过。
- 用短期测试凭证验证历史报名的补交身份读取，随后删除该测试凭证；未更改参会者资料或展示授权。
- 2MiB 上传请求通过 Nginx 到达应用鉴权层，超过 6m 的请求被 Nginx 以 413 拒绝。
- SMTP TLS 与账号认证通过，没有发送测试邮件；真实邮件收件仍需人工验收。
- 健康检查确认 `database=mysql`、`schemaReady=true`、`ok=true`、`email=true`、`vipReady=true`、`materialsReady=true`。

## 备份与恢复

受保护的备份目录：`/home/ubuntu/backups/lpclub-conference/20261020-mysql-170621`，目录权限 0700。内含部署前应用及未提交修改、前后配置、实际生效 Nginx 快照、PM2 状态、SQLite 一致性快照、飞书 CLI 最终导出、迁移及校验报告、上线后 MySQL 转储 `lpclub-conference-after.sql`。

本次未设置定时备份。后续应配套备份 MySQL、原件目录和稳定密钥，缓存无需备份；当前原件目录为空。

新版已开始接收业务写入，禁止直接回退到旧飞书服务，否则会造成数据分叉。恢复前须先停写并保留当前 MySQL 与配套原件快照，对账新增业务后再决定恢复目标。

项目未执行 Git commit 或 push；部署通过独立发布目录完成。
