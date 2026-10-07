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
