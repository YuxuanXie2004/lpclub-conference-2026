# 报名管理布局与管理员登录实施方案

目标：保持现有五个业务入口和中英文能力，使用若依式固定左栏、顶栏及简约深绿视觉，增加单管理员 JWT 登录。

## 实施约定

- 在 main 实现；已先将 codex/registration-draft 快进合入，不提交或推送新改动。
- 复用原生 HTML/JavaScript、现有面板和业务服务，不引入新前端框架，不改数据库结构。
- 白色侧栏 224px / 折叠 64px，顶栏 64px，移动端抽屉；现有 Logo、五个菜单、语言、账号和退出入口。
- 管理员配置 ADMIN_USERNAME、ADMIN_PASSWORD_HASH、ADMIN_JWT_SECRET；scrypt 密码哈希，JWT 固定 HS256/issuer/audience，HttpOnly Cookie 有效期 8 小时；进程内登记会话，注销和重启失效。
- 所有管理页面、接口、CSV 导出、私有图片预览统一登录；不再接受旧 URL token 或 X-Admin-Token，公开报名及参会者补交授权保持原样。
- 写请求使用 Origin 与会话 CSRF token；登录失败按 IP 限流；配置不完整时后台关闭，公开服务不受影响。
- 增加 /login 和 /api/admin/auth/login、session、logout；登录后回到原菜单/报名记录/筛选分页，返回地址限制本站后台。
- 同时支持根路径、部署子目录、反代剥离前缀和 localhost HTTP；飞书链接不再携带管理员凭据。

## 验证与交付

先写并运行失败的鉴权、HTTP 和客户端测试，再实现；保留并更新现有业务测试，新增折叠/移动抽屉/语言标题/退出测试。运行 npm test、相关隔离 MySQL HTTP 测试、语法检查和 git diff --check。按用户要求不使用浏览器验证；保留所有未提交改动。重启现有本地服务，通过 HTTP 检查登录、管理页、业务读取与退出，交付本地验收地址和管理员登录信息。
