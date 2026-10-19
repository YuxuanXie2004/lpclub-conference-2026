# 大会管理页 HTTPS 发布计划

目标：以 `017834d5768d1e0914bce1b490c498ad2d7da672` 为基线，沿用 `https://lp-club.cn/2026-pe-conference/`，修复后台子路径兼容并关闭公网明文直连。

架构：保留现有 Nginx TLS 终止、PM2 和应用目录。管理页链接和接口使用相对路径；Node 增加可配置的 HOST，生产设为 127.0.0.1 并启用 TRUST_PROXY。保留所有线上凭据和 VIP 数据，不执行飞书迁移。

- [x] 回归测试：新增 `test/admin-paths.test.js`，在根目录及 `/2026-pe-conference/` 下执行真实管理页脚本，检查列表请求、导出及导航解析结果；新增 `test/server-listen.test.js` 检查 HOST 配置的启动参数。先运行并确认原实现失败。
- [x] 最小修复：`server/sheet.js`、`server/vip-admin.js` 中管理页 URL 移除根路径前导斜杠；`server/index.js` 使用 `process.env.HOST || '0.0.0.0'` 作为 listen 的 host；更新 `.env.example`、部署说明和已有测试中的 URL 预期。
- [x] 本地验证：`npm test`；通过隔离 SQLite、模拟飞书和 SMTP，在 Chrome 验证根目录和大会前缀下的报名列表、状态修改、软删除、恢复、导出、VIP 列表及生成；运行首页双语浏览器回归；检查完整 diff。
- [x] 发布备份：重新确认线上版本与文件哈希；将代码、PM2 状态、Nginx 配置和权限受限的 `.env` 复制到时间戳备份目录；使用 SQLite 在线 backup 并执行 integrity_check，不直接复制活动 WAL 数据库。
- [x] 发布应用：仅上传指定提交的发布文件和已验证补丁；在现有目录更新，不改变 node_modules、`.git`、`.env` 和 data；设置 HOST=127.0.0.1、TRUST_PROXY=true，仅重启大会 PM2 服务并保存现有进程列表。若版本、依赖或数据验证异常，停止发布并保留备份。
- [x] 线上验收：HTTPS 首页及图片、health、鉴权拒绝、报名与 VIP 管理页和只读接口、CSV 下载，确认管理页 URL 均保留大会前缀，检查官网、证书和 HTTP 跳转；确认 8787 仅监听回环且公网无法连接。线上不创建报名、不发送邮件、不生成或作废 VIP 码。

回退：恢复备份的应用文件和 `.env`，重启原大会 PM2 服务；数据库默认不回滚，避免覆盖发布后的业务数据。Nginx 无必要不变更。发布阶段未执行 Git commit 或 push。

## 验证记录

- 本地单元测试：60/60 通过；新增用例先复现子路径失败，再验证修复。
- Chrome：根路径与大会子路径下鉴权、列表、状态、软删除、恢复、CSV、VIP 导航均通过；原有首页双语（含 320px）、VIP 桌面/移动操作及核对回归通过。
- 线上：1440px、390px 管理页的报名/回收站/VIP 读取、CSV 和导航通过，全部请求保留大会前缀，未发起写请求；首页、Logo、favicon、health、未授权拒绝与官网返回正常。
- 发布：线上 HEAD 为 017834d5768d1e0914bce1b490c498ad2d7da672，另应用本目录中的 HTTPS 补丁；使用已有依赖，未执行迁移。
- 备份：`/home/ubuntu/backups/lpclub-conference/20261019-https-1714`，SQLite backup integrity_check 为 ok；发布后全部 VIP 数据表内容与备份一致。
- 服务：大会仅监听 127.0.0.1:8787，PM2 已保存；官网进程 PID 不变。Nginx 配置与凭据均验证未变化（仅新增 HOST、启用 TRUST_PROXY）。
- 原工作区的 34 个未提交文件保持不变；发布时补丁保留于隔离工作区，未执行 commit 或 push。
