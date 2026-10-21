# 部署与恢复

新系统需要 Node.js 22+、MySQL 8.0.17+ 和持久化磁盘。MySQL 保存全部业务数据，图片原件位于独立私有目录。历史数据的一次性离线导入见 `legacy-migration.md`；旧飞书、SQLite、文件和加密密钥须保留。

## 配置与启动

部署前备份现有配置和数据，上传代码与 lockfile，执行 `npm ci --omit=dev`。补全受保护的 `server/.env`：

- `MYSQL_HOST/PORT/USER/PASSWORD/DATABASE`，目标数据库独立使用 `lpclub_conference`。
- 原有 `ADMIN_TOKEN`、`VIP_CODE_ENCRYPTION_KEY`、`MATERIALS_SIGNING_KEY` 保持稳定；新增稳定的 `MAIL_PAYLOAD_KEY`。
- `HOST=127.0.0.1`、`TRUST_PROXY=true`，以及真实 HTTPS `PUBLIC_BASE_URL`。
- `MATERIALS_ENABLED=true`、原件目录 `MATERIALS_STORAGE_DIR` 和独立的可丢弃缓存目录 `MATERIALS_CACHE_DIR`。
- SMTP 配置；没有配置时报名仍保存，邮件状态显示未配置。

原件目录位于 web root 外，目录权限 0700、文件 0600，运行用户须可读写。不要把原件目录和缓存目录设为同一个目录。部署上传不复制或删除持久化数据、`.env`。

人工确认目标 MySQL 后执行 `npm run db:init`，只建指定数据库及缺失的版本结构，不导入旧数据。建库账号和日常运行账号可分开。展示柜升级使用 `002-showcase.sql`，管理员手动上传使用新增的 `003-manual-showcase.sql`，保留原迁移及数据，不重跑清库脚本。随后重启单个大会 Node 进程，检查 `/health` 中 `database=mysql`、`schemaReady=true`、`ok=true`，核对后台分页、邮件配置和公开空列表。健康检查实际连接数据库。

`deploy/setup.sh` 用于新机器根域名安装，必须预先配置 MySQL。已有官网服务器不要直接套用其 Nginx 或 systemd 配置。

## 现有线上子路径

现有站点是 `https://lp-club.cn/2026-pe-conference/`，使用 PM2。保留现有 Nginx 和证书，只重启大会对应的进程；`PUBLIC_BASE_URL` 必须包含此子路径。

既有去前缀代理继续可用。需要在通用代理前补上上传请求体规则，例如：

```nginx
location ~ ^/2026-pe-conference/api/materials/upload/(card|portrait|logo)$ {
    client_max_body_size 6m;
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

此规则保留前缀，由 Node 识别；原有通用代理也可继续去前缀。其他接口保持原请求体限制。确认 `/materials`、后台、导出及 `/api/` 均交给大会服务，公开图片不得由 Nginx 静态目录绕过权限校验。

## 备份与恢复

MySQL 和原件必须作为一套备份，签名及加密密钥另外安全保管。新系统不要再用 SQLite 的 `vip:backup` 备份新数据。

一致备份建议进入维护窗口：停止大会服务，使用 MySQL 官方工具 `mysqldump --single-transaction` 导出目标业务库，再复制完整私有原件目录与配置备份，完成后启动服务。凭据使用受保护的 MySQL option file 或交互输入，不放命令行密码。缓存目录无需备份。

恢复时先停止服务，保留当前库和文件的独立备份，在明确的恢复目标导入 MySQL 快照，恢复配套原件和原密钥后启动。不要覆盖仍在使用的数据，也不要自动清理看似未引用的原件。应用没有自动原件回收任务。

迁移脚本有版本与 checksum 校验；发布新结构应增加新 SQL 文件，不修改已应用迁移。DDL 会隐式提交，重复执行会跳过已完成版本，结构错误会明确失败。

## 上线验收

确认素材通过审核后不自动展示；展示柜点击保存才统一上线。核对排序、新版手动替换、撤权立即下架与旧草稿冲突。机构和嘉宾布局分别保存，升级不清空原展示列表。

运行单元及隔离 MySQL 测试；人工检查中英文、手机布局、实际 SMTP 投递、磁盘权限和备份恢复。自动化验证不创建生产报名、不发送真实邮件。

资料功能可用 `MATERIALS_ENABLED=false` 暂停，普通报名继续；数据库不可用时返回失败，不切回旧飞书。此次本地实施不包含生产建库、配置变更或发布。
