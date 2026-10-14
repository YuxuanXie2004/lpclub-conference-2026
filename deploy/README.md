# Production deployment

Run the Node service continuously behind HTTPS/Nginx (PM2 or an equivalent process manager is recommended).

Required production environment values include Feishu App ID/Secret, Base App Token/Table ID and a strong ADMIN_TOKEN. SMTP can be added later.

`npm run feishu:init` is a one-time schema migration, not part of the normal server start command.

Because Feishu is the only registration database, production monitoring should alert if Feishu writes fail. The website intentionally returns an error rather than confirming a registration that was not saved.

## One-time VIP storage

Use Node.js >=22 on one persistent host. Set `VIP_DB_PATH=/opt/lpclub/data/vip-codes.sqlite` and a stable base64 32-byte `VIP_CODE_ENCRYPTION_KEY` in the server environment. The `data` directory must survive application uploads/restarts. Back up the database with `npm run vip:backup -- /secure/path/vip-backup.sqlite` and keep a separate protected copy of its encryption key. Never replace the key when codes already exist.

The upload script excludes the developer's `server/.env` and persistent data. Review `server/.env` on the host manually. The Nginx setup forwards `/vip-codes` and `/api/admin/vip-codes` to Node. Existing deployed Nginx configuration must include `/vip-codes` before using the new management page. Application files only change in this task; no production upload or setup has been run.

Independent serverless or multi-host instances are not supported for VIP redemption. The serverless entry points reject VIP redemption on Vercel/AWS Lambda. Regular registration APIs retain their existing deployment paths.
