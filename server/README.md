# 服务端运行说明

`server/index.js` 提供大会官网、报名 API、资料补交及管理后台。需要 Node.js 22+、MySQL 8.0.17+ 和持久化私有磁盘；MySQL 是唯一业务数据源。

```bash
npm ci
npm run db:init
npm run dev
npm test
npm run test:mysql
```

生产配置、子路径代理、备份与恢复见根目录 `README.md` 及 `deploy/README.md`。历史飞书报名与 SQLite VIP 的一次性离线导入见 `deploy/legacy-migration.md`，运行时不再使用旧存储。

管理员令牌和加密密钥必须保持稳定。补交链接由真实 HTTPS `PUBLIC_BASE_URL` 生成，包含部署子路径；资料原件与缓存目录独立设置，不对外暴露私有目录。报名价格保存在 MySQL `registration_pricing` 表，修改时使用配置修订号防止并发覆盖，服务运行时不使用本地价格文件。
