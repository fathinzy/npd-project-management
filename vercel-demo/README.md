# NPD Project Management — Vercel Demo (read-only)

A Vercel-deployable clone of the [NPD Project Management System](../README.md), built to give the project a **live, shareable demo link**.

The original app is a stateful Express + SQLite server that reads and writes a local database and stores uploaded files on disk. Vercel runs stateless serverless functions with no persistent filesystem, so this clone is a **read-only** variant: it serves the fictional demo dataset directly and skips persistence.

## How it differs from the full app

| | Full app (`../backend`) | This demo (`vercel-demo`) |
|---|---|---|
| Backend | Express server, always on | Serverless function (`api/[[...path]].js`) |
| Data | SQLite database on disk | In-memory seed data (`api/_data.js`) |
| Writes | Persisted to DB | Accepted but **not saved** (read-only) |
| File uploads | Saved to local `Project/` folder | Not available |
| Frontend | `frontend/index.html` | Same file, copied to `public/index.html` (unchanged) |

The frontend is byte-for-byte the same single-page app. It loads everything through `GET /api/export`, which this demo answers from `api/_data.js`. Editing in the UI still updates the on-screen state for your session, but changes disappear on refresh, which is expected for a demo.

## Structure

```
vercel-demo/
├── api/
│   ├── [[...path]].js   # Catch-all API: GET returns seed data, writes are no-ops
│   └── _data.js         # Fictional demo dataset (port of ../backend/seed-demo-data.js)
├── public/
│   └── index.html       # The frontend SPA (copied, unmodified)
├── vercel.json          # Routes non-API paths to the SPA
├── package.json
└── README.md
```

## Deploy to Vercel

### Option A — Vercel CLI

```bash
npm i -g vercel

# from this folder:
cd vercel-demo
vercel          # preview deploy, follow the prompts
vercel --prod   # production deploy
```

### Option B — Git + Vercel dashboard

1. Push this repo to GitHub.
2. In the Vercel dashboard, **Add New → Project** and import the repo.
3. Set the **Root Directory** to `vercel-demo`.
4. Leave build/output settings at their defaults (no build step needed) and deploy.

## Run locally

```bash
cd vercel-demo
npx vercel dev
```

Then open the printed local URL. Alternatively, verify the API data layer without Vercel:

```bash
node -e "console.log(require('./api/_data').buildExport().parts.length)"   # -> 6
```

## Data

All demo data is fictional — the same customers, parts, sample builds, and issues as the original seeder (`../backend/seed-demo-data.js`), covering shipped builds across 2025–2026 so the Dashboard and Report charts render with real-looking numbers. No real customer or business information is included.
