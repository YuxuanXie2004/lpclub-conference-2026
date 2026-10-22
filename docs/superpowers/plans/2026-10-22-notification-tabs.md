# 通知管理实施计划

目标：将飞书通知与同步移到侧栏，增加邮件通知页面，提供统计、分页筛选、详情和失败重试。

架构：沿用单页面后台 Tab、管理员会话与 CSRF 校验；查询现有 integration_jobs、integration_events、feishu_sync_state、mail_jobs。新增通知查询服务与共享前端控制器。新邮件通过独立加密快照保留发送内容，旧记录明确提示正文不可用。

技术：Node.js、MySQL、原生 JavaScript、node:test。

- [x] 增加失败测试：七个 Tab、独立面板、查询过滤与详情、邮件失败重试限制、快照加密。
- [x] 新增 server/notification-admin.js、assets/notification-admin.js 和样式，接入 server/index.js 与 server/sheet.js；扩充导航标题和翻译。
- [x] 新增 mail_jobs.encrypted_snapshot 迁移，在 enqueue 时保存独立快照，发送后继续清理原 encrypted_payload。
- [x] 验证：node --test test/notification-admin.test.js test/admin-tabs.test.js test/admin-shell.test.js test/mail-outbox.test.js test/admin-auth-http.test.js test/feishu-integration.test.js；检查 git diff --check 和本次差异。

范围说明：保留现有飞书对账、失败任务重试；邮件仅重试仍保有发送负载的失败任务，成功邮件不自动重发。统计成功表示渠道接受，不声称已读或实际送达。历史正文无法恢复，不伪造历史内容。
