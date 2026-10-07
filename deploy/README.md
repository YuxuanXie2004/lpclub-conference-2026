# Production deployment

Run the Node service continuously behind HTTPS/Nginx (PM2 or an equivalent process manager is recommended).

Required production environment values include Feishu App ID/Secret, Base App Token/Table ID and a strong ADMIN_TOKEN. SMTP can be added later.

`npm run feishu:init` is a one-time schema migration, not part of the normal server start command.

Because Feishu is the only registration database, production monitoring should alert if Feishu writes fail. The website intentionally returns an error rather than confirming a registration that was not saved.
