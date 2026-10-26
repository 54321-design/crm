# Lead CRM (React + Node/Express + MySQL)

```
n8n -> Google Sheet -> sync (every 5 min) -> Node/Express -> MySQL -> REST API -> React CRM
n8n -> POST /api/webhooks/leads (later, same database) ------^
```

## Status
- Done and tested: MySQL schema, auth (JWT, roles), Google Sheet sync (multi-sheet), n8n webhooks, leads / dashboard / analytics / workflows / team / activity REST APIs.
- Done: React frontend (frontend/): login, dashboard, leads, lead detail, trends, AI outreach, automation, team, activity.
- New: outreach API (`/api/outreach/*`, run `database/migrations/003_outreach.sql`), see docs/N8N_SETUP.md section C.

## Run the backend
1. MySQL 8+ (or MariaDB 10.6+). Create the database: `mysql -u root -p < database/schema.sql`
   (already created it earlier? run `database/migrations/002_multi_sheet.sql` instead)
2. `cd backend && cp .env.example .env` and fill in DATABASE_* , JWT_SECRET, WEBHOOK_API_KEY
3. `cp sheets.config.example.json sheets.config.json` and paste your published CSV links (see docs/N8N_SETUP.md)
4. `npm install`
5. `npm run seed:admin -- "Your Name" you@example.com YourStrongPassword`
6. `npm run dev` (API on http://localhost:5000)

## API (all except login/webhooks need `Authorization: Bearer <token>`)
| | |
|---|---|
| POST /api/auth/login, GET /api/auth/me | sign in |
| GET /api/dashboard/stats, /lead-trends, /recent-leads, /recent-activity | dashboard |
| GET /api/leads, /leads/export (CSV), /leads/:id, /leads/:id/activity | read leads (filters: q, status, source, assigned, range, from, to, sort, order, page, limit) |
| POST /api/leads, PUT /api/leads/:id, DELETE /api/leads/:id | manage leads |
| PATCH /api/leads/:id/status, /assign; POST /api/leads/:id/notes | actions |
| GET /api/analytics/lead-trends, /sources, /status, /funnel, /conversion, /source-conversion, /team, /monthly-comparison | charts (range = today, 7d, 30d, this_month, last_month, 3m, 6m, this_year, all, custom + from/to) |
| GET /api/workflows, /workflows/:id | automation page |
| GET/POST /api/team, PUT /api/team/:id, GET /api/team/options | team |
| GET /api/activity | activity feed |
| POST /api/sync/sheet, GET /api/sync/status | Sync Now / sync panel |
| POST /api/webhooks/leads, /webhooks/workflow-execution | n8n (header `x-api-key`) |

Roles: admin = everything; manager = leads, analytics, team (read), automation; employee = only leads assigned to them (view, update status, notes).

## Production
Run behind HTTPS (Nginx or Caddy), set a long random JWT_SECRET and WEBHOOK_API_KEY, use a MySQL user limited to the `crm` database, keep `.env` and `sheets.config.json` out of git, run the API with `pm2 start server.js --name crm-api`, and back up MySQL daily.


## Run the frontend
`cd frontend && npm install && npm run dev` (http://localhost:5173, proxies /api to localhost:5000).
Production: set `VITE_API_URL` to your API URL, run `npm run build`, deploy `dist/` (Vercel/Netlify configs included), and add the site URL to `CORS_ORIGIN` in backend/.env.

## Sheets via service account / Vercel
See docs/N8N_SETUP.md section D (private sheets, `SHEETS_CONFIG_JSON`, `POST /api/webhooks/sync` for n8n to trigger the sync, Vercel deploy of `backend/`).

## Quick database setup
Put your DATABASE_* values in `backend/.env`, then: `cd backend && npm install && npm run setup:db && npm run seed:admin -- "Name" you@example.com Password123`
