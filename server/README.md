# Server notes

`server/index.js` runs the conference site and registration API. Feishu Base is the only registration database.

## Commands

```bash
npm run feishu:init   # one-time Base schema setup / migration
npm run dev           # normal website + API server
npm test              # local unit tests
```

Do not run `feishu:init` for each registration. The website automatically writes a new record to Feishu through `/api/order`.

## Soft delete

Registrations are never hard-deleted by the website. `/api/admin/delete` marks `Is Deleted / 已删除 = true`; `/api/admin/restore` clears the flag. The admin UI and APIs filter records by that flag.

## VIP code store

VIP codes and redemption attempts use a separate persistent SQLite database; registration records remain in Feishu. Node.js >=22 and `npm install` are required. Run `npm run vip:init` once for local setup (then restart), or configure `VIP_CODE_ENCRYPTION_KEY` and optionally `VIP_DB_PATH` before enabling the management page at `/vip-codes?token=<ADMIN_TOKEN>`. See the root README for manual distribution, review-state recovery and backup instructions.

`npm run vip:backup -- /secure/path/vip-backup.sqlite` uses SQLite's online backup API and does not recover or change redemption statuses.
