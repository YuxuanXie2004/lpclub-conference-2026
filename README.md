# LP CLUB Conference 2026 — Website + Feishu Registration System

## Architecture

Feishu Base is the **only registration database and source of truth**.

```text
Conference website
      ↓ POST /api/order
Node backend
      ↓
Feishu Base (only database)
      ├─ active registrations
      └─ soft-deleted registrations / recycle bin
```

There is **no local registration database, Excel database, or NDJSON backup**.

Normal website/admin actions work automatically while the Node server is running. `npm run feishu:init` is only a schema setup/migration command and is **not** run for each registration.

## Feishu configuration

`server/.env` needs:

```env
FEISHU_APP_ID=
FEISHU_APP_SECRET=
FEISHU_APP_TOKEN=B7EUbCcwiadz93sGX0xcpoDgnrh
FEISHU_TABLE_ID=tbl8lbo4hjnVHW9m
ADMIN_TOKEN=
```

The enterprise app must have Base/Bitable read-write permissions and must be allowed to access the target Base.

## One-time schema setup

After creating a new Base, or after upgrading this project to soft-delete, run once:

```bash
npm install
npm run feishu:init
```

The schema includes all website registration fields plus these recycle-bin fields:

- `Is Deleted / 已删除`
- `Deleted At / 删除时间`
- `Deleted By / 删除人`
- `Deletion Reason / 删除原因`

Running the command again is safe: existing fields are skipped.

## Normal local run

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:8787
```

Health:

```text
http://localhost:8787/health
```

Admin operations page (requires `ADMIN_TOKEN`):

```text
http://localhost:8787/table?token=YOUR_ADMIN_TOKEN
```

## Registration flow

A successful website submission does this automatically:

1. validates the selected package and server-owned price;
2. validates required fields and business email;
3. checks Feishu for an active duplicate email;
4. creates a new Feishu record with `Is Deleted = false`;
5. returns the registration reference to the confirmation page;
6. if SMTP is configured, sends the attendee confirmation email and updates the email status in Feishu.

If Feishu cannot save the record, the website **does not show registration success**.

## Soft delete / restore

The admin page has two views:

- **Active Registrations** — normal records only;
- **Deleted / 回收站** — records whose `Is Deleted / 已删除` flag is true.

Clicking Delete does **not** call the Feishu delete-record endpoint. It updates:

```text
Is Deleted = true
Deleted At = current time
Deleted By = LP CLUB admin
Deletion Reason = optional reason
```

Normal GET/list/export operations hide these records.

Clicking Restore changes the record back to:

```text
Is Deleted = false
Deleted At = empty
Deleted By = empty
Deletion Reason = empty
```

Do not manually hard-delete rows in Feishu if you want them recoverable.

## Admin APIs

```text
GET  /api/registrations?mode=active
GET  /api/registrations?mode=deleted
POST /api/admin/status
POST /api/admin/delete
POST /api/admin/restore
GET  /export.csv?mode=active
GET  /export.csv?mode=deleted
```

All admin endpoints require the configured admin token.

## Email

Email is optional until LP CLUB provides SMTP credentials:

```env
SMTP_HOST=smtp.feishu.cn
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=LPCLUBGROUP@LP-club.cn
SMTP_PASS=
ORGANISER_EMAIL=LPCLUBGROUP@LP-club.cn
```

Registrations still save to Feishu when SMTP is not configured.

## Packages

The authoritative prices live in:

```text
server/packages.js
```

Do not trust a price sent from the browser. The backend always selects the package and amount from this server file.

## Tests

```bash
npm test
```

The tests cover business-email validation, server-owned package pricing, the default soft-delete flag, and Feishu record mapping.
