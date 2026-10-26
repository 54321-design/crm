# Connecting n8n

There are two ways leads reach the CRM. You can use both at the same time; duplicates are merged automatically.

## A. Today: n8n -> Google Sheet -> CRM sync (no change to your workflows)

1. Open each lead sheet -> **File -> Share -> Publish to web** -> choose the sheet tab and **CSV** -> Publish. Copy the link.
2. `cp backend/sheets.config.example.json backend/sheets.config.json` and paste the link(s):

| Sheet | Columns it reads | source | workflow |
|---|---|---|---|
| lead generation (LinkedIn) | Company Name, Person Name, Title, LinkedIn URL, Email, Phone, City, Country, Company Website, Date Scraped, Status | LinkedIn | LinkedIn Lead Generation |
| Google Scaper details (Maps) | emails, Business Name, Address, Phone, Website | Google Maps / GMB | Google Maps Lead Generation |

3. The backend syncs every 5 minutes. Rows that have not changed are skipped. Use **Sync Now** (POST /api/sync/sheet) for an instant sync.
4. To add another sheet later, add another entry to `sheets.config.json` (no restart needed). If a new sheet uses different header names, add them to `HEADERS` in `backend/src/services/sheetSync.js`.

Note: if the sheet link is shared "anyone with the link", the CSV link works without any Google login.

## B. Later: n8n -> CRM directly

Add an **HTTP Request** node at the end of the workflow (after "Add to Sheet" / "Append or update row"):

- Method: `POST`
- URL: `https://YOUR-CRM-DOMAIN/api/webhooks/leads`
- Header: `x-api-key` = the `WEBHOOK_API_KEY` from `backend/.env`
- Body (JSON), mapped from your items:

```json
{
  "company": "{{ $json['Business Name'] }}",
  "person_name": "",
  "email": "{{ $json.emails }}",
  "phone": "{{ $json.Phone }}",
  "address": "{{ $json.Address }}",
  "website": "{{ $json.Website }}",
  "source": "Google Maps / GMB",
  "workflow": "Google Maps Lead Generation"
}
```

You can also send an array of up to 500 leads in one request. Response:
`{ "success": true, "leadId": 123, "action": "created", "message": "Lead created successfully" }`
(`action` is `created`, `updated` or `duplicate`).

Optional: report each run so the Automation page shows status. Add an HTTP Request node (and an Error Trigger workflow for failures):

`POST /api/webhooks/workflow-execution` with `{ "workflow": "Google Maps Lead Generation", "source": "Google Maps / GMB", "status": "success", "leads_created": 12 }`
(`status` is `running`, `success` or `failed`; add `"error": "message"` for failures).

New sources and workflow names are created automatically the first time they are received, so adding another n8n workflow needs no CRM change.

## C. Sending LinkedIn messages from the CRM (Outreach page)

Flow: CRM "Send on LinkedIn" -> n8n webhook -> your LinkedIn sender -> n8n calls the CRM back with the result.

1. In n8n create a workflow that starts with a **Webhook** node (POST). Put its production URL in `backend/.env` as `N8N_LINKEDIN_WEBHOOK_URL`. The CRM sends the header `x-api-key` (same value as `WEBHOOK_API_KEY`); add a Header Auth check on the webhook so only the CRM can call it.
2. The CRM posts this JSON:
```json
{ "outreachId": 12, "leadId": 345, "linkedin_url": "https://www.linkedin.com/in/...", "person_name": "...", "company": "...",
  "message": "the text to send", "callback_url": "https://YOUR-API/api/webhooks/outreach-status" }
```
3. Add the node/service that actually sends the DM (n8n has no built-in LinkedIn DM node; use the provider you already run, for example an Apify actor, PhantomBuster, Unipile or HeyReach, via HTTP Request).
4. Finish with an HTTP Request node (and an error branch) that calls `callback_url` with header `x-api-key`:
   `{ "outreachId": {{ $json.outreachId }}, "status": "sent" }` or `{ "outreachId": ..., "status": "failed", "error": "reason" }`
5. When the callback says `sent`, the lead moves from New to Contacted and the Outreach page shows the message as Sent. Until then it shows "Waiting for n8n".

Set `GROQ_API_KEY` in `backend/.env` for the "Write with AI" button, and run `database/migrations/003_outreach.sql` on your existing database.
Keep sending volume low: LinkedIn limits automated messages and can restrict accounts that send too many.

## D. Private sheets with a Google service account (+ deploying the API on Vercel)

Use this instead of "Publish to web". The sheets stay private; only the service account can read them.

**1. Create the service account (once)**
1. Google Cloud Console -> create/select a project -> **APIs & Services -> Library** -> enable **Google Sheets API**.
2. **IAM & Admin -> Service Accounts -> Create**. Open it -> **Keys -> Add key -> JSON**. A `.json` file downloads.
3. Copy the `client_email` value from that file (looks like `name@project.iam.gserviceaccount.com`).

**2. Share each lead sheet** with that email as **Viewer** (Share button in Google Sheets). Do not make the sheet public.

**3. Tell the CRM which sheets to read**
Get the sheet ID from the URL: `docs.google.com/spreadsheets/d/<THIS_PART>/edit`.
- Local / Railway: copy `sheets.config.example.json` to `sheets.config.json` and fill `sheetId` and `tab` (tab name at the bottom of the sheet, e.g. `Sheet1`).
- Vercel: there is no config file, so paste the same JSON array (on one line) into the env var `SHEETS_CONFIG_JSON`.

**4. Set env vars** (`backend/.env` or Vercel -> Settings -> Environment Variables)
- `GOOGLE_SERVICE_ACCOUNT_JSON` = the whole downloaded JSON, pasted on one line
- `WEBHOOK_API_KEY`, `JWT_SECRET`, `DATABASE_*`, `CORS_ORIGIN`, `API_URL`
- On Vercel also set `DISABLE_CRON=1`

**5. Vercel (backend)**: import the repo, set **Root Directory** to `backend`. `api/index.js` and `vercel.json` are already included. MySQL must be hosted elsewhere (Railway, Hostinger, etc.); allow connections from outside.

**6. Make the sync run every 5 minutes (Vercel has no background cron)**
Create an n8n workflow:
```
Schedule Trigger (every 5 minutes)  ->  HTTP Request
```
HTTP Request: `POST https://YOUR-API/api/webhooks/sync`, header `x-api-key` = `WEBHOOK_API_KEY`.
The response shows `created`, `updated`, `duplicate`, `errors`. Rows that did not change are skipped, so frequent runs are cheap.

**Check it works**: open Automation in the CRM and press "Sync sheets now". If Google says it cannot open the sheet, the sheet is not shared with the service account email or the sheet ID is wrong.
