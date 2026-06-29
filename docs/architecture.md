# Architecture

## Current state (local / LAN deployment)

```
┌──────────────────────────────────────────────────────────┐
│  Office LAN                                               │
│                                                             │
│  ┌────────────┐        ┌──────────────────────────────┐  │
│  │ Engineer's │        │  Server PC                    │  │
│  │  Browser   │───────▶│  ┌──────────────────────────┐ │  │
│  └────────────┘        │  │ Node.js + Express        │ │  │
│                         │  │  - REST API              │ │  │
│  ┌────────────┐        │  │  - Static file serving   │ │  │
│  │ Engineer's │───────▶│  │  - Multer (uploads)      │ │  │
│  │  Browser   │        │  └──────────────────────────┘ │  │
│  └────────────┘        │  ┌──────────────────────────┐ │  │
│                         │  │ SQLite (npd.db)          │ │  │
│  ┌────────────┐        │  └──────────────────────────┘ │  │
│  │ Engineer's │───────▶│  ┌──────────────────────────┐ │  │
│  │  Browser   │        │  │ Filesystem (Project/*)   │ │  │
│  └────────────┘        │  └──────────────────────────┘ │  │
│                         └──────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

All traffic stays inside the office network. One PC acts as the server — meaning the app is only available while that PC is on, and it has no resilience against hardware failure.

---

## Data model

```
customers ──┐
materials ──┼──▶ parts ──┬──▶ part_ops ──▶ processes
processes ──┘            ├──▶ apqp_items
                          ├──▶ ppap
                          └──▶ issues

sample_builds ──┬──▶ sample_procs
                 └──▶ sample_etds   (multiple ETD dates per build, each with own qty)
```

Key design decisions:

- **APQP items** are stored as individual rows (`part_id`, `phase_idx`, `item_idx`) rather than a JSON blob, so individual items can be queried/updated independently without rewriting an entire checklist.
- **Sample build ETDs** are a one-to-many relationship rather than a single field — real manufacturing sample builds often ship in multiple partial batches with different delivery dates.
- **Foreign keys with cascading deletes** — deleting a part automatically cleans up its ops, APQP items, and PPAP record, preventing orphaned data.

---

## API design

RESTful resource-based routes, consistent response envelope:

```json
{ "ok": true,  "data": { ... } }
{ "ok": false, "error": "message" }
```

Notable endpoints beyond standard CRUD:

| Endpoint | Purpose |
|---|---|
| `GET /api/export` | Full database snapshot as JSON (backup/migration) |
| `POST /api/parts/bulk-import` | Bulk part creation from parsed Excel rows, with name-based entity matching |
| `POST /api/create-folders` | Creates the on-disk APQP folder structure for a part |
| `POST /api/apqp-upload` | Document upload, scoped to a specific APQP phase/item |
| `GET /api/apqp-file-url/...` | Resolves a file's actual path by walking the folder tree (decouples the DB record from exact folder naming) |
| `POST /api/open-file` / `/api/open-folder` | Opens a file/folder directly in the OS file explorer — only meaningful when the browser and server are on the same machine; gracefully no-ops otherwise |

---

## Target state (cloud)

See [`cloud-migration.md`](cloud-migration.md) for the full migration plan and reasoning.
