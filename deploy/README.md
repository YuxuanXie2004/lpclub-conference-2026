# Production deployment

Run the Node service continuously behind HTTPS/Nginx (PM2 or an equivalent process manager is recommended).

Required production environment values include Feishu App ID/Secret, Base App Token/Table ID and a strong ADMIN_TOKEN. SMTP can be added later.

`npm run feishu:init` is a one-time schema migration, not part of the normal server start command.

Because Feishu is the only registration database, production monitoring should alert if Feishu writes fail. The website intentionally returns an error rather than confirming a registration that was not saved.

## One-time VIP storage

Use Node.js >=22 on one persistent host. Set `VIP_DB_PATH=/opt/lpclub/data/vip-codes.sqlite` and a stable base64 32-byte `VIP_CODE_ENCRYPTION_KEY` in the server environment. The `data` directory must survive application uploads/restarts. Back up the database with `npm run vip:backup -- /secure/path/vip-backup.sqlite` and keep a separate protected copy of its encryption key. Never replace the key when codes already exist.

The upload script excludes the developer's `server/.env` and persistent data. Review `server/.env` on the host manually. The Nginx setup forwards `/vip-codes` and `/api/admin/vip-codes` to Node. Existing deployed Nginx configuration must include `/vip-codes` before using the new management page. Application files only change in this task; no production upload or setup has been run.

Independent serverless or multi-host instances are not supported for VIP redemption. The serverless entry points reject VIP redemption on Vercel/AWS Lambda. Regular registration APIs retain their existing deployment paths.

## Existing production host and HTTPS admin

The existing installation uses PM2 in `/home/ubuntu/lpclub-conference-2026`, behind `https://lp-club.cn/2026-pe-conference/`. Keep the existing Nginx configuration and certificate; do not run `setup.sh` over this installation. Set `HOST=127.0.0.1` and `TRUST_PROXY=true` in its protected `server/.env`, then restart only the conference PM2 process. Nginx must retain the existing trailing-slash proxy that strips `/2026-pe-conference/` before forwarding to Node.

Admin entry points are `/2026-pe-conference/table?token=<ADMIN_TOKEN>` and `/2026-pe-conference/vip-codes?token=<ADMIN_TOKEN>`. Management links and API requests are relative to their directory so both root and prefixed installations work without routing conference APIs into the official site's `/api/`. Preserve `.env`, its encryption key, and `data/` during deployment. Back up the live VIP database with SQLite's online backup API before restarting. Verify the public HTTPS pages and authenticated read endpoints; do not create registrations or codes in production for smoke testing.
