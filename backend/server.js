/**
 * NPD Project Management System — Express + Node:SQLite Backend
 * Node 22+ built-in SQLite (no native addon required)
 *
 * Start:  node server.js
 * Env:    PORT=3001  (default)
 */

'use strict';

const { DatabaseSync } = require('node:sqlite');
const express = require('express');
const cors     = require('cors');
const multer   = require('multer');

// Global safe filename helper
function safeName(str){ return String(str||'').replace(/[\/:*?"<>|]/g,'_').trim()||'_'; }
const path    = require('path');
const fs      = require('fs');
const { exec } = require('child_process');

require('dotenv').config();

const PORT    = process.env.PORT || 3001;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'npd.db');

// ── Ensure data directory exists ──────────────────────────────────
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// ── Open database ─────────────────────────────────────────────────
const db = new DatabaseSync(DB_PATH);

// ── Schema ────────────────────────────────────────────────────────
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  -- ── Registry tables ──────────────────────────────
  CREATE TABLE IF NOT EXISTS customers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS processes (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS process_machines (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    process_id  INTEGER NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
    machine     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS materials (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    type    TEXT NOT NULL,
    size    TEXT,
    length  TEXT
  );

  -- ── NPD Parts ──────────────────────────────────────
  CREATE TABLE IF NOT EXISTS parts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    uid           TEXT UNIQUE NOT NULL,
    pn            TEXT NOT NULL,
    name          TEXT NOT NULL,
    rev           TEXT DEFAULT 'Rev A',
    customer_id   INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    program       TEXT,
    engineer      TEXT,
    ppap_level    INTEGER DEFAULT 3,
    part_type     TEXT NOT NULL,
    part_status   TEXT DEFAULT 'Active',
    sop           TEXT,
    material_id   INTEGER REFERENCES materials(id) ON DELETE SET NULL,
    psw_date      TEXT,
    notes         TEXT,
    drawing_file  TEXT,
    status        TEXT DEFAULT 'on-track',
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS part_ops (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    part_id     INTEGER NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
    op          TEXT,
    process_id  INTEGER REFERENCES processes(id) ON DELETE SET NULL,
    machine     TEXT,
    ct          TEXT,
    sort_order  INTEGER DEFAULT 0
  );

  -- ── APQP checklist ──────────────────────────────────
  CREATE TABLE IF NOT EXISTS apqp_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    part_id     INTEGER NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
    phase_idx   INTEGER NOT NULL,
    item_idx    INTEGER NOT NULL,
    done        INTEGER DEFAULT 0,
    plan_date   TEXT,
    compl_date  TEXT,
    UNIQUE(part_id, phase_idx, item_idx)
  );

  -- ── PPAP ────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS ppap (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    part_id     INTEGER NOT NULL UNIQUE REFERENCES parts(id) ON DELETE CASCADE,
    checks      TEXT DEFAULT '[]',   -- JSON array of booleans
    psw_status  TEXT,
    psw_date    TEXT
  );

  -- ── Sample Builds ────────────────────────────────────
  CREATE TABLE IF NOT EXISTS sample_builds (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    build_id        TEXT UNIQUE NOT NULL,
    customer        TEXT,
    pn              TEXT,
    plan_qty        INTEGER DEFAULT 0,
    actual_qty      INTEGER,
    ship_qty        INTEGER DEFAULT 0,
    po_num          TEXT,
    start_date      TEXT,
    etd_date        TEXT,
    shipped_date    TEXT,
    unit_price_usd  REAL DEFAULT 0,
    selling_price_usd REAL DEFAULT 0,
    cost_pc         REAL DEFAULT 0,
    cost_unit       TEXT DEFAULT 'USD',
    nw              REAL,
    gw              REAL,
    material_id        INTEGER REFERENCES materials(id) ON DELETE SET NULL,
    material_weight_kg  REAL DEFAULT 0,
    material_bar_pcs    INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sample_procs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    build_id        INTEGER NOT NULL REFERENCES sample_builds(id) ON DELETE CASCADE,
    name            TEXT,
    start_plan      TEXT,
    start_actual    TEXT,
    end_plan        TEXT,
    end_actual      TEXT,
    sort_order      INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sample_etds (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    build_id        INTEGER NOT NULL REFERENCES sample_builds(id) ON DELETE CASCADE,
    etd_date        TEXT,
    qty             INTEGER DEFAULT 0,
    sort_order      INTEGER DEFAULT 0
  );

  -- ── Issues ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS issues (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id    TEXT UNIQUE NOT NULL,
    part_uid    TEXT,
    title       TEXT NOT NULL,
    severity    TEXT DEFAULT 'medium',
    status      TEXT DEFAULT 'open',
    owner       TEXT,
    date        TEXT,
    notes       TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  -- ── RFQs ─────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS rfqs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    rfq_id        TEXT UNIQUE NOT NULL,
    part_number   TEXT,
    part_name     TEXT,
    customer      TEXT,
    rfq_date      TEXT,
    progress      TEXT DEFAULT 'Open',
    status        TEXT DEFAULT 'Active',
    created_at    TEXT DEFAULT (datetime('now'))
  );
`);

// ── Migrate existing DB: add drawing_file column if missing ──────────
try { db.exec('ALTER TABLE parts ADD COLUMN drawing_file TEXT'); } catch(_) {}
try { db.exec('ALTER TABLE sample_builds ADD COLUMN material_id INTEGER'); } catch(_) {}
try { db.exec('ALTER TABLE sample_builds ADD COLUMN material_weight_kg REAL DEFAULT 0'); } catch(_) {}
try { db.exec('ALTER TABLE sample_builds ADD COLUMN material_bar_pcs INTEGER DEFAULT 0'); } catch(_) {}

// ── Helpers ───────────────────────────────────────────────────────
const ok  = (res, data, status = 200) => res.status(status).json({ ok: true,  data });
const err = (res, msg, status = 400) => res.status(status).json({ ok: false, error: msg });

function updatedAt() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }

// ── Express setup ────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Optional: serve the frontend HTML from same origin
const FRONTEND = path.join(__dirname, 'index.html');
if (fs.existsSync(FRONTEND)) {
  app.get('/', (_, res) => res.sendFile(FRONTEND));
}

// ══════════════════════════════════════════════════════════════════
//  CUSTOMERS
// ══════════════════════════════════════════════════════════════════
app.get('/api/customers', (_, res) => {
  ok(res, db.prepare('SELECT * FROM customers ORDER BY name').all());
});

app.post('/api/customers', (req, res) => {
  const { name } = req.body;
  if (!name) return err(res, 'name required');
  try {
    // Return existing if already exists
    const existing = db.prepare('SELECT * FROM customers WHERE name=?').get(name);
    if (existing) return ok(res, existing, 200);
    const r = db.prepare('INSERT INTO customers (name) VALUES (?)').run(name);
    ok(res, { id: r.lastInsertRowid, name }, 201);
  } catch (e) { err(res, 'Customer name already exists'); }
});

app.put('/api/customers/:id', (req, res) => {
  const { name } = req.body;
  db.prepare('UPDATE customers SET name=? WHERE id=?').run(name, req.params.id);
  ok(res, { id: +req.params.id, name });
});

app.delete('/api/customers/:id', (req, res) => {
  db.prepare('DELETE FROM customers WHERE id=?').run(req.params.id);
  ok(res, null);
});

// ══════════════════════════════════════════════════════════════════
//  PROCESSES
// ══════════════════════════════════════════════════════════════════
app.get('/api/processes', (_, res) => {
  const procs   = db.prepare('SELECT * FROM processes ORDER BY name').all();
  const machines = db.prepare('SELECT * FROM process_machines ORDER BY process_id, id').all();
  const byProcId = {};
  machines.forEach(m => {
    (byProcId[m.process_id] = byProcId[m.process_id] || []).push(m.machine);
  });
  ok(res, procs.map(p => ({ ...p, machines: byProcId[p.id] || [] })));
});

app.post('/api/processes', (req, res) => {
  const { name, machines = [] } = req.body;
  if (!name) return err(res, 'name required');
  try {
    const existing = db.prepare('SELECT * FROM processes WHERE name=?').get(name);
    if (existing) {
      const existMachines = db.prepare('SELECT machine FROM process_machines WHERE process_id=?').all(existing.id).map(m=>m.machine);
      return ok(res, { id: existing.id, name, machines: existMachines }, 200);
    }
    const r  = db.prepare('INSERT INTO processes (name) VALUES (?)').run(name);
    const id = r.lastInsertRowid;
    const ins = db.prepare('INSERT INTO process_machines (process_id, machine) VALUES (?,?)');
    machines.forEach(m => ins.run(id, m));
    ok(res, { id, name, machines }, 201);
  } catch (e) { err(res, 'Process name already exists'); }
});

app.put('/api/processes/:id', (req, res) => {
  const { name, machines = [] } = req.body;
  db.prepare('UPDATE processes SET name=? WHERE id=?').run(name, req.params.id);
  db.prepare('DELETE FROM process_machines WHERE process_id=?').run(req.params.id);
  const ins = db.prepare('INSERT INTO process_machines (process_id, machine) VALUES (?,?)');
  machines.forEach(m => ins.run(+req.params.id, m));
  ok(res, { id: +req.params.id, name, machines });
});

app.delete('/api/processes/:id', (req, res) => {
  db.prepare('DELETE FROM processes WHERE id=?').run(req.params.id);
  ok(res, null);
});

// ══════════════════════════════════════════════════════════════════
//  MATERIALS
// ══════════════════════════════════════════════════════════════════
app.get('/api/materials', (_, res) => {
  ok(res, db.prepare('SELECT * FROM materials ORDER BY type').all());
});

app.post('/api/materials', (req, res) => {
  const { type, size = '', length = '' } = req.body;
  if (!type) return err(res, 'type required');
  const r = db.prepare('INSERT INTO materials (type, size, length) VALUES (?,?,?)').run(type, size, length);
  ok(res, { id: r.lastInsertRowid, type, size, length }, 201);
});

app.put('/api/materials/:id', (req, res) => {
  const { type, size = '', length = '' } = req.body;
  db.prepare('UPDATE materials SET type=?, size=?, length=? WHERE id=?').run(type, size, length, req.params.id);
  ok(res, { id: +req.params.id, type, size, length });
});

app.delete('/api/materials/:id', (req, res) => {
  db.prepare('DELETE FROM materials WHERE id=?').run(req.params.id);
  ok(res, null);
});

// ══════════════════════════════════════════════════════════════════
//  PARTS
// ══════════════════════════════════════════════════════════════════
function fetchPart(id) {
  const part = db.prepare('SELECT * FROM parts WHERE id=?').get(id);
  if (!part) return null;
  part.ops = db.prepare('SELECT * FROM part_ops WHERE part_id=? ORDER BY sort_order, id').all(id);
  // APQP: returns array of phase arrays
  const apqpRows = db.prepare('SELECT * FROM apqp_items WHERE part_id=? ORDER BY phase_idx, item_idx').all(id);
  // Build 2D array
  const PHASE_COUNTS = [9, 1, 14, 10, 4]; // Phase 3 has 14 items now // matches APQP_DEF items count
  part.apqp = PHASE_COUNTS.map((cnt, pi) =>
    Array.from({ length: cnt }, (_, ii) => {
      const row = apqpRows.find(r => r.phase_idx === pi && r.item_idx === ii);
      return row ? { done: !!row.done, planDate: row.plan_date || '', complDate: row.compl_date || '' }
                 : { done: false, planDate: '', complDate: '' };
    })
  );
  const ppap = db.prepare('SELECT * FROM ppap WHERE part_id=?').get(id);
  part.ppap = ppap
    ? { checks: JSON.parse(ppap.checks || '[]'), pswStatus: ppap.psw_status || '', pswDate: ppap.psw_date || '' }
    : { checks: Array(15).fill(false), pswStatus: '', pswDate: '' };
  return part;
}

app.get('/api/parts', (_, res) => {
  const parts = db.prepare('SELECT id FROM parts ORDER BY id').all();
  ok(res, parts.map(p => fetchPart(p.id)));
});

app.get('/api/parts/:id', (req, res) => {
  const part = fetchPart(req.params.id);
  if (!part) return err(res, 'Not found', 404);
  ok(res, part);
});


// ── Bulk import parts from Excel (frontend already parsed rows) ───
app.post('/api/parts/bulk-import', (req, res) => {
  const rows = req.body.rows || [];
  if (!Array.isArray(rows) || !rows.length) return err(res, 'No rows provided', 400);

  let imported = 0, skipped = 0;
  const errors = [];

  try {
    db.exec('BEGIN');

    const PART_TYPES = ["Prototype (Test)","Prototype (Sample)","Pre Launch (Pre Launch)","Production Run (Production)","Safe Launch (Safe Launch)"];

    for (const r of rows) {
      // Validate required fields
      if (!r.pn || !r.name || !r.customer || !PART_TYPES.includes(r.partType)) {
        skipped++; continue;
      }
      // Skip if part number already exists
      const existingPart = db.prepare('SELECT id FROM parts WHERE pn=? COLLATE NOCASE').get(r.pn);
      if (existingPart) { skipped++; continue; }

      // Find or create customer
      let cust = db.prepare('SELECT id FROM customers WHERE name=? COLLATE NOCASE').get(r.customer);
      let customerId;
      if (cust) customerId = cust.id;
      else customerId = db.prepare('INSERT INTO customers (name) VALUES (?)').run(r.customer).lastInsertRowid;

      // Find or create material (if provided)
      let materialId = null;
      if (r.material) {
        let mat = db.prepare('SELECT id FROM materials WHERE type=? COLLATE NOCASE').get(r.material);
        if (mat) materialId = mat.id;
        else materialId = db.prepare('INSERT INTO materials (type, size, length) VALUES (?,?,?)').run(r.material, '', '').lastInsertRowid;
      }

      // Generate UID
      const y = new Date().getFullYear();
      const lastUid = db.prepare("SELECT uid FROM parts WHERE uid LIKE 'NPD-' || ? || '-%' ORDER BY uid DESC LIMIT 1").get(String(y));
      let nextSeq = 1;
      if (lastUid) {
        const m = lastUid.uid.match(/NPD-\d{4}-(\d+)$/);
        if (m) nextSeq = parseInt(m[1]) + 1;
      }
      const uid = `NPD-${y}-${String(nextSeq).padStart(3,'0')}`;

      // Insert part
      const partResult = db.prepare(`
        INSERT INTO parts (uid,pn,name,rev,customer_id,program,engineer,ppap_level,
          part_type,part_status,sop,material_id,psw_date,notes,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        uid, r.pn, r.name, r.rev || 'Rev A', customerId, r.program || '', r.engineer || '',
        r.ppapLevel || 3, r.partType, r.partStatus || 'Active',
        r.sop || null, materialId, r.pswDate || null, r.notes || null, 'on-track'
      );
      const partId = partResult.lastInsertRowid;

      // Process ops — find or create each process by name
      const insOp = db.prepare('INSERT INTO part_ops (part_id,op,process_id,machine,ct,sort_order) VALUES (?,?,?,?,?,?)');
      (r.ops || []).forEach((o, i) => {
        if (!o.process) return;
        let proc = db.prepare('SELECT id FROM processes WHERE name=? COLLATE NOCASE').get(o.process);
        let processId;
        if (proc) processId = proc.id;
        else processId = db.prepare('INSERT INTO processes (name) VALUES (?)').run(o.process).lastInsertRowid;
        insOp.run(partId, o.op, processId, o.machine || '', o.ct || '', i);
      });

      imported++;
    }

    db.exec('COMMIT');
    ok(res, { imported, skipped }, 201);
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch(_) {}
    console.error('Bulk import error:', e);
    err(res, `Bulk import failed: ${e.message}`, 500);
  }
});

app.post('/api/parts', (req, res) => {
  const b = req.body;
  if (!b.pn) return err(res, 'pn required');
  // Auto-generate a UID if the caller didn't provide one (e.g. API/seed scripts)
  let uid = b.uid;
  if (!uid) {
    const y = new Date().getFullYear();
    const lastUid = db.prepare("SELECT uid FROM parts WHERE uid LIKE 'NPD-' || ? || '-%' ORDER BY uid DESC LIMIT 1").get(String(y));
    let nextSeq = 1;
    if (lastUid) {
      const m = lastUid.uid.match(/NPD-\d{4}-(\d+)$/);
      if (m) nextSeq = parseInt(m[1]) + 1;
    }
    uid = `NPD-${y}-${String(nextSeq).padStart(3,'0')}`;
  }
  // Check if part with this UID already exists — if so, update instead
  const existing = db.prepare('SELECT id FROM parts WHERE uid=?').get(uid);
  if (existing) {
    // Part exists — redirect to update
    return res.redirect(307, `/api/parts/${existing.id}`);
  }
  const r = db.prepare(`
    INSERT INTO parts (uid,pn,name,rev,customer_id,program,engineer,ppap_level,
      part_type,part_status,sop,material_id,psw_date,notes,drawing_file,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    uid, b.pn, b.name, b.rev || 'Rev A',
    b.customer_id || b.customerId || null,
    b.program || null, b.engineer || null,
    b.ppap_level || b.ppapLevel || 3,
    b.part_type || b.partType || null, b.part_status || b.partStatus || 'Active',
    b.sop || null, b.material_id || b.materialId || null,
    b.psw_date || b.pswDate || null, b.notes || null,
    b.drawing_file || b.drawingFile || null, b.status || 'on-track'
  );
  const partId = r.lastInsertRowid;
  _saveOps(partId, b.ops || []);
  _saveApqp(partId, b.apqp);
  _savePpap(partId, b.ppap);
  ok(res, fetchPart(partId), 201);
});

app.put('/api/parts/:id', (req, res) => {
  const b   = req.body;
  const pid = +req.params.id;
  db.prepare(`
    UPDATE parts SET pn=?,name=?,rev=?,customer_id=?,program=?,engineer=?,
      ppap_level=?,part_type=?,part_status=?,sop=?,material_id=?,
      psw_date=?,notes=?,drawing_file=?,status=?,updated_at=? WHERE id=?
  `).run(
    b.pn, b.name, b.rev || 'Rev A',
    b.customer_id || b.customerId || null,
    b.program, b.engineer,
    b.ppap_level || b.ppapLevel || 3,
    b.part_type || b.partType, b.part_status || b.partStatus || 'Active',
    b.sop || null, b.material_id || b.materialId || null,
    b.psw_date || b.pswDate || null, b.notes || null,
    b.drawing_file || b.drawingFile || null,
    b.status || 'on-track', updatedAt(), pid
  );
  db.prepare('DELETE FROM part_ops WHERE part_id=?').run(pid);
  _saveOps(pid, b.ops || []);
  _saveApqp(pid, b.apqp);
  _savePpap(pid, b.ppap);
  ok(res, fetchPart(pid));
});

app.delete('/api/parts/:id', (req, res) => {
  db.prepare('DELETE FROM parts WHERE id=?').run(req.params.id);
  ok(res, null);
});

function _saveOps(partId, ops) {
  const ins = db.prepare(
    'INSERT INTO part_ops (part_id,op,process_id,machine,ct,sort_order) VALUES (?,?,?,?,?,?)'
  );
  (ops || []).forEach((o, i) => ins.run(partId, o.op, o.processId || o.process_id, o.machine, o.ct, i));
}

function _saveApqp(partId, apqp) {
  if (!Array.isArray(apqp)) return;
  const upsert = db.prepare(`
    INSERT INTO apqp_items (part_id,phase_idx,item_idx,done,plan_date,compl_date)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(part_id,phase_idx,item_idx) DO UPDATE SET
      done=excluded.done, plan_date=excluded.plan_date, compl_date=excluded.compl_date
  `);
  apqp.forEach((phase, pi) =>
    (phase || []).forEach((item, ii) =>
      upsert.run(partId, pi, ii, item.done ? 1 : 0, item.planDate || null, item.complDate || null)
    )
  );
}

function _savePpap(partId, ppap) {
  if (!ppap) return;
  const checks = JSON.stringify(ppap.checks || []);
  db.prepare(`
    INSERT INTO ppap (part_id,checks,psw_status,psw_date) VALUES (?,?,?,?)
    ON CONFLICT(part_id) DO UPDATE SET
      checks=excluded.checks, psw_status=excluded.psw_status, psw_date=excluded.psw_date
  `).run(partId, checks, ppap.pswStatus || ppap.psw_status || null, ppap.pswDate || ppap.psw_date || null);
}

// ── APQP patch (single item) ──────────────────────────────────────
app.patch('/api/parts/:id/apqp', (req, res) => {
  const { phase_idx, item_idx, done, plan_date, compl_date } = req.body;
  db.prepare(`
    INSERT INTO apqp_items (part_id,phase_idx,item_idx,done,plan_date,compl_date)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(part_id,phase_idx,item_idx) DO UPDATE SET
      done=excluded.done, plan_date=excluded.plan_date, compl_date=excluded.compl_date
  `).run(+req.params.id, phase_idx, item_idx, done ? 1 : 0, plan_date || null, compl_date || null);
  ok(res, null);
});

// ── PPAP patch ────────────────────────────────────────────────────
app.patch('/api/parts/:id/ppap', (req, res) => {
  const { checks, psw_status, psw_date } = req.body;
  db.prepare(`
    INSERT INTO ppap (part_id,checks,psw_status,psw_date) VALUES (?,?,?,?)
    ON CONFLICT(part_id) DO UPDATE SET
      checks=COALESCE(excluded.checks, checks),
      psw_status=COALESCE(excluded.psw_status, psw_status),
      psw_date=COALESCE(excluded.psw_date, psw_date)
  `).run(
    +req.params.id,
    checks !== undefined ? JSON.stringify(checks) : null,
    psw_status !== undefined ? psw_status : null,
    psw_date   !== undefined ? psw_date   : null
  );
  ok(res, null);
});

// ══════════════════════════════════════════════════════════════════
//  SAMPLE BUILDS
// ══════════════════════════════════════════════════════════════════
function fetchBuild(id) {
  const b = db.prepare('SELECT * FROM sample_builds WHERE id=?').get(id);
  if (!b) return null;
  b.procs = db.prepare('SELECT * FROM sample_procs WHERE build_id=? ORDER BY sort_order, id').all(id);
  b.etds = db.prepare('SELECT etd_date as date, qty FROM sample_etds WHERE build_id=? ORDER BY sort_order, id').all(id);
  return b;
}

function _saveEtds(buildId, etds) {
  db.prepare('DELETE FROM sample_etds WHERE build_id=?').run(buildId);
  const ins = db.prepare('INSERT INTO sample_etds (build_id, etd_date, qty, sort_order) VALUES (?,?,?,?)');
  (etds || []).forEach((e, i) => ins.run(buildId, e.date, e.qty || 0, i));
}

app.get('/api/samples', (_, res) => {
  const ids = db.prepare('SELECT id FROM sample_builds ORDER BY id').all();
  ok(res, ids.map(r => fetchBuild(r.id)));
});

app.get('/api/samples/:id', (req, res) => {
  const b = fetchBuild(req.params.id);
  if (!b) return err(res, 'Not found', 404);
  ok(res, b);
});

app.post('/api/samples', (req, res) => {
  const b = req.body;
  // Check if sample build ID already exists
  const existingSb = b.id ? db.prepare('SELECT id FROM sample_builds WHERE build_id=?').get(b.id) : null;
  if (existingSb) return res.redirect(307, `/api/samples/${existingSb.id}`);
  const r = db.prepare(`
    INSERT INTO sample_builds
      (build_id,customer,pn,plan_qty,actual_qty,ship_qty,po_num,
       start_date,etd_date,shipped_date,unit_price_usd,selling_price_usd,
       cost_pc,cost_unit,nw,gw,material_id,material_weight_kg,material_bar_pcs)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    b.id || b.build_id, b.customer, b.pn,
    b.planQty || b.plan_qty || 0,
    b.actualQty !== undefined ? b.actualQty : (b.actual_qty !== undefined ? b.actual_qty : null),
    b.shipQty || b.ship_qty || 0,
    b.poNum || b.po_num || null,
    b.startDate || b.start_date || null,
    b.etdDate || b.etd_date || null,
    b.shippedDate || b.shipped_date || null,
    b.unitPriceUSD || b.unit_price_usd || 0,
    b.sellingPriceUSD || b.selling_price_usd || 0,
    b.costPc || b.cost_pc || 0,
    b.costUnit || b.cost_unit || 'USD',
    b.nw !== undefined ? b.nw : null,
    b.gw !== undefined ? b.gw : null,
    b.materialId || b.material_id || null,
    b.materialWeightKg || b.material_weight_kg || 0,
    b.materialBarPcs || b.material_bar_pcs || 0
  );
  const bid = r.lastInsertRowid;
  _saveProcs(bid, b.procs || []);
  _saveEtds(bid, b.etds || []);
  ok(res, fetchBuild(bid), 201);
});

app.put('/api/samples/:id', (req, res) => {
  const b = req.body; const sid = +req.params.id;
  // Fetch current row first — fields not provided in this PUT keep their existing DB value
  // (protects against partial-update callers like inline date edits wiping unrelated fields)
  const current = db.prepare('SELECT * FROM sample_builds WHERE id=?').get(sid) || {};

  const v_customer   = b.customer !== undefined ? b.customer : current.customer;
  const v_pn         = b.pn !== undefined ? b.pn : current.pn;
  const v_planQty    = (b.planQty !== undefined || b.plan_qty !== undefined) ? (b.planQty || b.plan_qty || 0) : current.plan_qty;
  const v_actualQty  = b.actualQty !== undefined ? b.actualQty : (b.actual_qty !== undefined ? b.actual_qty : current.actual_qty);
  const v_shipQty    = (b.shipQty !== undefined || b.ship_qty !== undefined) ? (b.shipQty || b.ship_qty || 0) : current.ship_qty;
  const v_poNum      = (b.poNum !== undefined || b.po_num !== undefined) ? (b.poNum || b.po_num || null) : current.po_num;
  const v_startDate  = (b.startDate !== undefined || b.start_date !== undefined) ? (b.startDate || b.start_date || null) : current.start_date;
  const v_etdDate    = (b.etdDate !== undefined || b.etd_date !== undefined) ? (b.etdDate || b.etd_date || null) : current.etd_date;
  const v_shippedDate= (b.shippedDate !== undefined || b.shipped_date !== undefined) ? (b.shippedDate || b.shipped_date || null) : current.shipped_date;
  const v_unitPrice  = (b.unitPriceUSD !== undefined || b.unit_price_usd !== undefined) ? (b.unitPriceUSD || b.unit_price_usd || 0) : current.unit_price_usd;
  const v_sellPrice  = (b.sellingPriceUSD !== undefined || b.selling_price_usd !== undefined) ? (b.sellingPriceUSD || b.selling_price_usd || 0) : current.selling_price_usd;
  const v_costPc     = (b.costPc !== undefined || b.cost_pc !== undefined) ? (b.costPc || b.cost_pc || 0) : current.cost_pc;
  const v_costUnit   = (b.costUnit !== undefined || b.cost_unit !== undefined) ? (b.costUnit || b.cost_unit || 'USD') : current.cost_unit;
  const v_nw         = b.nw !== undefined ? b.nw : current.nw;
  const v_gw         = b.gw !== undefined ? b.gw : current.gw;
  const v_materialId = (b.materialId !== undefined || b.material_id !== undefined) ? (b.materialId || b.material_id || null) : current.material_id;
  const v_matWeight  = (b.materialWeightKg !== undefined || b.material_weight_kg !== undefined) ? (b.materialWeightKg || b.material_weight_kg || 0) : current.material_weight_kg;
  const v_matBar     = (b.materialBarPcs !== undefined || b.material_bar_pcs !== undefined) ? (b.materialBarPcs || b.material_bar_pcs || 0) : current.material_bar_pcs;

  db.prepare(`
    UPDATE sample_builds SET
      customer=?,pn=?,plan_qty=?,actual_qty=?,ship_qty=?,po_num=?,
      start_date=?,etd_date=?,shipped_date=?,unit_price_usd=?,selling_price_usd=?,
      cost_pc=?,cost_unit=?,nw=?,gw=?,material_id=?,material_weight_kg=?,material_bar_pcs=?,updated_at=? WHERE id=?
  `).run(
    v_customer, v_pn, v_planQty, v_actualQty, v_shipQty, v_poNum,
    v_startDate, v_etdDate, v_shippedDate, v_unitPrice, v_sellPrice,
    v_costPc, v_costUnit, v_nw, v_gw, v_materialId, v_matWeight, v_matBar,
    updatedAt(), sid
  );
  if (b.procs !== undefined) { db.prepare('DELETE FROM sample_procs WHERE build_id=?').run(sid); _saveProcs(sid, b.procs || []); }
  if (b.etds !== undefined) { _saveEtds(sid, b.etds || []); }
  ok(res, fetchBuild(sid));
});

app.delete('/api/samples/:id', (req, res) => {
  db.prepare('DELETE FROM sample_builds WHERE id=?').run(req.params.id);
  ok(res, null);
});

function _saveProcs(buildId, procs) {
  const ins = db.prepare(
    'INSERT INTO sample_procs (build_id,name,start_plan,start_actual,end_plan,end_actual,sort_order) VALUES (?,?,?,?,?,?,?)'
  );
  (procs || []).forEach((p, i) =>
    ins.run(buildId, p.name, p.startPlan || p.start_plan, p.startActual || p.start_actual,
            p.endPlan || p.end_plan, p.endActual || p.end_actual, i)
  );
}

// ══════════════════════════════════════════════════════════════════
//  ISSUES
// ══════════════════════════════════════════════════════════════════
app.get('/api/issues', (_, res) => {
  ok(res, db.prepare('SELECT * FROM issues ORDER BY id').all());
});

app.post('/api/issues', (req, res) => {
  const b = req.body;
  const existingIss = (b.id||b.issue_id) ? db.prepare('SELECT id FROM issues WHERE issue_id=?').get(b.id||b.issue_id) : null;
  if (existingIss) return res.redirect(307, `/api/issues/${existingIss.id}`);
  const r = db.prepare(`
    INSERT INTO issues (issue_id,part_uid,title,severity,status,owner,date,notes)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(b.id || b.issue_id, b.partUid || b.part_uid, b.title,
         b.severity || 'medium', b.status || 'open',
         b.owner || null, b.date || null, b.notes || null);
  ok(res, db.prepare('SELECT * FROM issues WHERE id=?').get(r.lastInsertRowid), 201);
});

app.put('/api/issues/:id', (req, res) => {
  const b = req.body;
  db.prepare(`
    UPDATE issues SET issue_id=?,part_uid=?,title=?,severity=?,status=?,
      owner=?,date=?,notes=?,updated_at=? WHERE id=?
  `).run(b.id || b.issue_id, b.partUid || b.part_uid, b.title,
         b.severity, b.status, b.owner, b.date, b.notes, updatedAt(), req.params.id);
  ok(res, db.prepare('SELECT * FROM issues WHERE id=?').get(+req.params.id));
});

app.patch('/api/issues/:id/toggle', (req, res) => {
  const iss = db.prepare('SELECT status FROM issues WHERE id=?').get(req.params.id);
  if (!iss) return err(res, 'Not found', 404);
  const next = iss.status === 'open' ? 'closed' : 'open';
  db.prepare('UPDATE issues SET status=?, updated_at=? WHERE id=?').run(next, updatedAt(), req.params.id);
  ok(res, { status: next });
});

app.delete('/api/issues/:id', (req, res) => {
  db.prepare('DELETE FROM issues WHERE id=?').run(req.params.id);
  ok(res, null);
});

// ══════════════════════════════════════════════════════════════════
//  RFQs
// ══════════════════════════════════════════════════════════════════
app.get('/api/rfqs', (_, res) => {
  ok(res, db.prepare('SELECT * FROM rfqs ORDER BY id').all());
});

app.post('/api/rfqs', (req, res) => {
  const b = req.body;
  const r = db.prepare(`
    INSERT INTO rfqs (rfq_id,part_number,part_name,customer,rfq_date,progress,status)
    VALUES (?,?,?,?,?,?,?)
  `).run(b.id || b.rfq_id, b.partNumber || b.part_number,
         b.partName || b.part_name, b.customer,
         b.rfqDate || b.rfq_date, b.progress || 'Open', b.status || 'Active');
  ok(res, db.prepare('SELECT * FROM rfqs WHERE id=?').get(r.lastInsertRowid), 201);
});

app.put('/api/rfqs/:id', (req, res) => {
  const b = req.body;
  db.prepare(`
    UPDATE rfqs SET rfq_id=?,part_number=?,part_name=?,customer=?,
      rfq_date=?,progress=?,status=? WHERE id=?
  `).run(b.id || b.rfq_id, b.partNumber || b.part_number,
         b.partName || b.part_name, b.customer,
         b.rfqDate || b.rfq_date, b.progress, b.status, req.params.id);
  ok(res, db.prepare('SELECT * FROM rfqs WHERE id=?').get(+req.params.id));
});

app.delete('/api/rfqs/:id', (req, res) => {
  db.prepare('DELETE FROM rfqs WHERE id=?').run(req.params.id);
  ok(res, null);
});

// ══════════════════════════════════════════════════════════════════
//  BULK IMPORT  (for migrating existing JSON save file)
// ══════════════════════════════════════════════════════════════════
app.post('/api/import', (req, res) => {
  const payload = req.body;

  try {
    // Manual transaction using BEGIN/COMMIT (node:sqlite compatible)
    db.exec('BEGIN');

    // Clear existing data
    db.exec(`
      DELETE FROM sample_procs;   DELETE FROM sample_builds;
      DELETE FROM apqp_items;     DELETE FROM ppap;
      DELETE FROM part_ops;       DELETE FROM parts;
      DELETE FROM process_machines; DELETE FROM processes;
      DELETE FROM materials;      DELETE FROM customers;
      DELETE FROM issues;         DELETE FROM rfqs;
    `);

    const reg = payload.reg || {};

    // Customers
    const insCust = db.prepare('INSERT INTO customers (name) VALUES (?)');
    const custIdMap = {}; // old id → new id
    (reg.customers || []).forEach(c => {
      const r = insCust.run(c.name);
      custIdMap[c.id] = r.lastInsertRowid;
    });

    // Processes
    const insProc = db.prepare('INSERT INTO processes (name) VALUES (?)');
    const insMach = db.prepare('INSERT INTO process_machines (process_id, machine) VALUES (?,?)');
    const procIdMap = {};
    (reg.processes || []).forEach(p => {
      const r = insProc.run(p.name);
      procIdMap[p.id] = r.lastInsertRowid;
      (p.machines || []).forEach(m => insMach.run(r.lastInsertRowid, m));
    });

    // Materials
    const insMat = db.prepare('INSERT INTO materials (type,size,length) VALUES (?,?,?)');
    const matIdMap = {};
    (reg.materials || []).forEach(m => {
      const r = insMat.run(m.type, m.size || '', m.length || '');
      matIdMap[m.id] = r.lastInsertRowid;
    });

    // Parts
    const insPart = db.prepare(`
      INSERT INTO parts (uid,pn,name,rev,customer_id,program,engineer,ppap_level,
        part_type,part_status,sop,material_id,psw_date,notes,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insOp   = db.prepare('INSERT INTO part_ops (part_id,op,process_id,machine,ct,sort_order) VALUES (?,?,?,?,?,?)');
    const insApqp = db.prepare(`
      INSERT INTO apqp_items (part_id,phase_idx,item_idx,done,plan_date,compl_date)
      VALUES (?,?,?,?,?,?)`);
    const insPpap = db.prepare(`
      INSERT INTO ppap (part_id,checks,psw_status,psw_date) VALUES (?,?,?,?)`);

    (payload.parts || []).forEach(p => {
      const custId = custIdMap[p.customerId] || null;
      const matId  = matIdMap[p.materialId]  || null;
      const pr = insPart.run(
        p.uid, p.pn, p.name, p.rev || 'Rev A',
        custId, p.program, p.engineer,
        p.ppapLevel || 3, p.partType, p.partStatus || 'Active',
        p.sop || null, matId, p.pswDate || null, p.notes || null, p.status || 'on-track'
      );
      const pid = pr.lastInsertRowid;

      (p.ops || []).forEach((o, i) => {
        insOp.run(pid, o.op, procIdMap[o.processId] || null, o.machine, o.ct, i);
      });

      if (Array.isArray(p.apqp)) {
        p.apqp.forEach((phase, pi) =>
          (phase || []).forEach((item, ii) =>
            insApqp.run(pid, pi, ii, item.done ? 1 : 0, item.planDate || null, item.complDate || null)
          )
        );
      }

      if (p.ppap) {
        insPpap.run(pid, JSON.stringify(p.ppap.checks || []),
                    p.ppap.pswStatus || null, p.pswDate || null);
      }
    });

    // Sample Builds
    const insBuild = db.prepare(`
      INSERT INTO sample_builds
        (build_id,customer,pn,plan_qty,actual_qty,ship_qty,po_num,
         start_date,etd_date,shipped_date,unit_price_usd,selling_price_usd,cost_pc,cost_unit,nw,gw)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insProc2 = db.prepare(
      'INSERT INTO sample_procs (build_id,name,start_plan,start_actual,end_plan,end_actual,sort_order) VALUES (?,?,?,?,?,?,?)'
    );
    const insEtd = db.prepare(
      'INSERT INTO sample_etds (build_id,etd_date,qty,sort_order) VALUES (?,?,?,?)'
    );

    (payload.samples || []).forEach(s => {
      const br = insBuild.run(
        s.id, s.customer, s.pn, s.planQty || 0,
        s.actualQty !== undefined ? s.actualQty : null,
        s.shipQty || 0, s.poNum || null,
        s.startDate || null, s.etdDate || null, s.shippedDate || null,
        s.unitPriceUSD || 0, s.sellingPriceUSD || 0,
        s.costPc || 0, s.costUnit || 'USD',
        s.nw !== undefined ? s.nw : null,
        s.gw !== undefined ? s.gw : null
      );
      (s.procs || []).forEach((p, i) =>
        insProc2.run(br.lastInsertRowid, p.name, p.startPlan, p.startActual, p.endPlan, p.endActual, i)
      );
      const etdList = (s.etds && s.etds.length) ? s.etds : (s.etdDate ? [{date:s.etdDate, qty:s.shipQty||0}] : []);
      etdList.forEach((e, i) => insEtd.run(br.lastInsertRowid, e.date, e.qty || 0, i));
    });

    // Issues
    const insIss = db.prepare(
      'INSERT INTO issues (issue_id,part_uid,title,severity,status,owner,date,notes) VALUES (?,?,?,?,?,?,?,?)'
    );
    (payload.issues || []).forEach(iss =>
      insIss.run(iss.id, iss.partUid, iss.title, iss.severity, iss.status, iss.owner, iss.date, iss.notes)
    );

    // RFQs
    const insRfq = db.prepare(
      'INSERT INTO rfqs (rfq_id,part_number,part_name,customer,rfq_date,progress,status) VALUES (?,?,?,?,?,?,?)'
    );
    (payload.rfqs || []).forEach(r =>
      insRfq.run(r.id, r.partNumber, r.partName, r.customer, r.rfqDate, r.progress || 'Open', r.status || 'Active')
    );
    db.exec('COMMIT');
    ok(res, { message: 'Import successful' });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch(_) {}
    console.error('Import error:', e);
    err(res, `Import failed: ${e.message}`, 500);
  }
});

// ══════════════════════════════════════════════════════════════════
//  BULK EXPORT  (returns full DB snapshot matching frontend DB shape)
// ══════════════════════════════════════════════════════════════════
app.get('/api/export', (_, res) => {
  const customers = db.prepare('SELECT * FROM customers ORDER BY id').all();
  const procs     = db.prepare('SELECT * FROM processes ORDER BY id').all();
  const machines  = db.prepare('SELECT * FROM process_machines ORDER BY process_id, id').all();
  const materials = db.prepare('SELECT * FROM materials ORDER BY id').all();
  const parts     = db.prepare('SELECT id FROM parts ORDER BY id').all().map(r => fetchPart(r.id));
  const samples   = db.prepare('SELECT id FROM sample_builds ORDER BY id').all().map(r => fetchBuild(r.id));
  const issues    = db.prepare('SELECT * FROM issues ORDER BY id').all();
  const rfqs      = db.prepare('SELECT * FROM rfqs ORDER BY id').all();

  const machinesByProc = {};
  machines.forEach(m => (machinesByProc[m.process_id] = machinesByProc[m.process_id] || []).push(m.machine));

  ok(res, {
    reg: {
      customers: customers.map(c => ({ id: c.id, name: c.name })),
      processes: procs.map(p => ({ id: p.id, name: p.name, machines: machinesByProc[p.id] || [] })),
      materials: materials.map(m => ({ id: m.id, type: m.type, size: m.size, length: m.length })),
    },
    parts,
    samples,
    issues,
    rfqs,
  });
});


// ══════════════════════════════════════════════════════════════════
//  APQP FILE UPLOADS
// ══════════════════════════════════════════════════════════════════

// Add APQP files table
db.exec(`
  CREATE TABLE IF NOT EXISTS apqp_files (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    part_uid  TEXT NOT NULL,
    phase_idx INTEGER NOT NULL,
    item_idx  INTEGER NOT NULL,
    filename  TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Multer — memory storage so req.body fields are available when we save
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// GET  /api/apqp-files — return all files grouped by key
app.get('/api/apqp-files', (_, res) => {
  const rows = db.prepare('SELECT * FROM apqp_files ORDER BY id').all();
  const grouped = {};
  rows.forEach(r => {
    const key = `${r.part_uid}_ph${r.phase_idx}_it${r.item_idx}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r.filename);
  });
  ok(res, grouped);
});

// GET /api/check-folders/:partPn — check if folder structure exists
app.get('/api/check-folders/:partPn', (req, res) => {
  const folderPath = path.join(__dirname, 'Project', safeName(req.params.partPn));
  const exists = fs.existsSync(folderPath);
  ok(res, { exists, path: folderPath });
});

// POST /api/apqp-upload — upload a file (memoryStorage so req.body is available)
app.post('/api/apqp-upload', (req, res) => {
  upload.single('file')(req, res, (uploadErr) => {
    if (uploadErr) return err(res, uploadErr.message || 'Upload failed', 500);
    if (!req.file) return err(res, 'No file uploaded', 400);

    const { partUid, partPn, phIdx, itIdx, phName, itemName } = req.body;
    if (!partPn) return err(res, 'partPn is required', 400);

    // Build path with safeName to match folder creation
    const dir = path.join(
      __dirname, 'Project',
      safeName(partPn),
      'APQP',
      safeName(phName || ''),
      safeName(itemName || '')
    );

    console.log('Saving upload to:', dir);

    if (!fs.existsSync(dir)) {
      return err(res, `Please create the folder structure for ${partPn} first.`, 400);
    }

    // Write buffer to disk
    const safeFilename = `${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9._\-]/g, '_')}`;
    try {
      fs.writeFileSync(path.join(dir, safeFilename), req.file.buffer);
    } catch(e) {
      return err(res, `Failed to save file: ${e.message}`, 500);
    }

    db.prepare(
      'INSERT INTO apqp_files (part_uid, phase_idx, item_idx, filename) VALUES (?,?,?,?)'
    ).run(partUid, parseInt(phIdx), parseInt(itIdx), safeFilename);

    ok(res, { filename: safeFilename, partUid, partPn, phIdx, itIdx }, 201);
  });
});

// DELETE /api/apqp-files/:partUid/:phIdx/:itIdx/:filename
app.delete('/api/apqp-files/:partUid/:phIdx/:itIdx/:filename', (req, res) => {
  const { partUid, phIdx, itIdx, filename } = req.params;
  // Remove from DB
  db.prepare(
    'DELETE FROM apqp_files WHERE part_uid=? AND phase_idx=? AND item_idx=? AND filename=?'
  ).run(partUid, parseInt(phIdx), parseInt(itIdx), filename);
  // Look up partPn from parts table to build correct path
  const partRow = db.prepare('SELECT pn FROM parts WHERE uid=?').get(partUid);
  // Try to find file by scanning the APQP folder tree
  const apqpRoot = path.join(__dirname, 'Project', safeName(partRow?.pn || partUid), 'APQP');
  let filePath = null;
  try {
    // Walk the APQP folder to find the file
    const walkDir = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walkDir(path.join(dir, entry.name));
        else if (entry.name === filename) filePath = path.join(dir, entry.name);
      }
    };
    walkDir(apqpRoot);
  } catch(e) {}
  if (filePath) {
    try { fs.unlinkSync(filePath); } catch(e) { console.warn('File not found on disk:', filePath); }
  } else { console.warn('File not found in Project folder:', filename); }
  ok(res, null);
});

// Serve uploaded files statically
app.use('/Project', express.static(path.join(__dirname, 'Project')));
app.use('/templates', express.static(path.join(__dirname, 'templates')));



// ── Drawing file upload ───────────────────────────────────────────
app.post('/api/drawing-upload', (req, res) => {
  upload.single('file')(req, res, (uploadErr) => {
    if (uploadErr) return err(res, uploadErr.message || 'Upload failed', 500);
    if (!req.file) return err(res, 'No file uploaded', 400);

    const { partUid, partPn } = req.body;
    if (!partPn) return err(res, 'partPn required', 400);

    // Save to Project/{partPn}/Drawings/
    const dir = path.join(__dirname, 'Project', safeName(partPn), 'Drawings');
    fs.mkdirSync(dir, { recursive: true }); // auto-create Drawings folder

    const safeFilename = `${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9._\-]/g, '_')}`;
    try {
      fs.writeFileSync(path.join(dir, safeFilename), req.file.buffer);
    } catch(e) {
      return err(res, `Failed to save drawing: ${e.message}`, 500);
    }

    // Update parts table with drawing filename
    if (partUid) {
      db.prepare('UPDATE parts SET drawing_file=? WHERE uid=?').run(safeFilename, partUid);
    }

    ok(res, { filename: safeFilename, partPn, partUid }, 201);
  });
});




// ── Open folder in Windows Explorer ──────────────────────────────
app.post('/api/open-folder', (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath) return err(res, 'folderPath required', 400);

  const projectRoot = path.join(__dirname, 'Project');
  const resolved = path.resolve(path.join(__dirname, folderPath));
  if (!resolved.startsWith(projectRoot)) return err(res, 'Access denied', 403);

  // Create folder if doesn't exist yet
  fs.mkdirSync(resolved, { recursive: true });

  exec(`explorer "${resolved}"`, (error) => {
    if (error) console.warn('Explorer open warning:', error.message);
    ok(res, { opened: true, path: resolved });
  });
});

// ── Open file locally on server PC using default program ─────────
// Only works when browser is on the SAME machine as the server
// For other PCs on LAN, falls back to download
app.post('/api/open-file', (req, res) => {
  const { filePath } = req.body;
  if (!filePath) return err(res, 'filePath required', 400);

  // Security: only allow files inside our Project folder
  const projectRoot = path.join(__dirname, 'Project');
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(projectRoot)) {
    return err(res, 'Access denied', 403);
  }

  if (!fs.existsSync(resolved)) {
    return err(res, 'File not found', 404);
  }

  // Open file with Windows default program
  exec(`start "" "${resolved}"`, (error) => {
    if (error) {
      console.error('Failed to open file:', error);
      return err(res, 'Failed to open file', 500);
    }
    ok(res, { opened: true, path: resolved });
  });
});

// ── Resolve APQP file URL (walk folder tree to find file) ────────
app.get('/api/apqp-file-url/:partUid/:phIdx/:itIdx/:filename', (req, res) => {
  const { partUid, phIdx, itIdx, filename } = req.params;
  const partRow = db.prepare('SELECT pn FROM parts WHERE uid=?').get(partUid);
  if (!partRow) return err(res, 'Part not found', 404);

  const apqpRoot = path.join(__dirname, 'Project', safeName(partRow.pn), 'APQP');
  let foundRelPath = null;

  // Walk all subdirectories to find the file
  function walk(dir, relDir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), relDir + '/' + entry.name);
      } else if (entry.name === filename) {
        foundRelPath = relDir + '/' + entry.name;
      }
    }
  }

  walk(apqpRoot, '');

  if (!foundRelPath) return err(res, 'File not found', 404);

  const url = `/Project/${encodeURIComponent(partRow.pn)}/APQP${foundRelPath}`;
  ok(res, { url });
});

// ── Create APQP folder structure on server ────────────────────────
app.post('/api/create-folders', (req, res) => {
  const { partUid, pn, name, phases } = req.body;
  if (!partUid) return err(res, 'partUid required');

  function safe(str) {
    return String(str || '').replace(/[\/:*?"<>|]/g, '_').trim() || '_';
  }

  let count = 0;
  try {
    // Root: Project/{partPn}/
    const root = path.join(__dirname, 'Project', safeName(pn));

    // Create APQP phase → item folders
    (phases || []).forEach((ph) => {
      const phDir = path.join(root, 'APQP', safeName(ph.name));
      fs.mkdirSync(phDir, { recursive: true });
      count++;
      (ph.items || []).forEach(item => {
        const itemDir = path.join(phDir, safeName(item));
        fs.mkdirSync(itemDir, { recursive: true });
        count++;
      });
    });

    // Create other standard folders
    ['PPAP', 'Drawings', 'SampleBuilds', 'CustomerDocs'].forEach(folder => {
      fs.mkdirSync(path.join(root, folder), { recursive: true });
      count++;
    });

    ok(res, { count, rootPath: root });
  } catch (e) {
    console.error('Folder creation error:', e);
    err(res, `Folder creation failed: ${e.message}`, 500);
  }
});


// ── Generate next safe UID based on existing parts ───────────────
app.get('/api/next-uid', (_, res) => {
  const y = new Date().getFullYear();
  const rows = db.prepare("SELECT uid FROM parts WHERE uid LIKE 'NPD-' || ? || '-%' ORDER BY uid DESC LIMIT 1").all(String(y));
  let nextSeq = 1;
  if (rows.length > 0) {
    const m = rows[0].uid.match(/NPD-\d{4}-(\d+)$/);
    if (m) nextSeq = parseInt(m[1]) + 1;
  }
  const uid = `NPD-${y}-${String(nextSeq).padStart(3,'0')}`;
  ok(res, { uid });
});

// ── Health check ──────────────────────────────────────────────────
app.get('/api/health', (_, res) => ok(res, { status: 'ok', db: DB_PATH, ts: new Date().toISOString() }));

// ── 404 catch-all ─────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/') || req.path === '/api') {
    return err(res, 'API route not found', 404);
  }
  if (fs.existsSync(FRONTEND)) return res.sendFile(FRONTEND);
  err(res, 'Not found', 404);
});

// ── Start ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  NPD Backend running → http://localhost:${PORT}`);
  console.log(`    Database: ${DB_PATH}`);
});
