/**
 * In-memory demo dataset for the Vercel read-only demo.
 *
 * This is a serverless-friendly port of backend/seed-demo-data.js. The original
 * seeder POSTed rows into a SQLite database; Vercel has no persistent disk, so
 * instead we build the exact same object graph the original /api/export endpoint
 * produced and serve it directly. No database, no filesystem.
 *
 * The shape here must match what the frontend's loadFromDB() expects:
 *   { reg:{customers,processes,materials}, parts:[...], samples:[...], issues:[...], rfqs:[...] }
 *
 * All data is entirely fictional — no real customer or business information.
 */

'use strict';

// APQP phase item counts (from server.js fetchPart) — used to build the 2D array.
const PHASE_COUNTS = [9, 1, 14, 10, 4];
const PPAP_CHECK_COUNT = 15;

function blankApqp() {
  return PHASE_COUNTS.map((cnt) =>
    Array.from({ length: cnt }, () => ({ done: false, planDate: '', complDate: '' }))
  );
}

// ── Registry: customers, processes, materials (stable ids) ──────────
const customers = [
  { id: 1, name: 'Acme Automotive' },
  { id: 2, name: 'Northwind Motors' },
  { id: 3, name: 'Contoso Components' },
  { id: 4, name: 'Globex Drivetrain' },
];

const processes = [
  { id: 1, name: 'Turning', machines: ['CNC Lathe A1', 'CNC Lathe B2'] },
  { id: 2, name: 'Milling', machines: ['VMC-300', 'VMC-500'] },
  { id: 3, name: 'Stamping', machines: ['Press 150T'] },
  { id: 4, name: 'Welding', machines: [] },
  { id: 5, name: 'Inspection', machines: [] },
  { id: 6, name: 'Assembly', machines: [] },
];

const materials = [
  { id: 1, type: 'SPCC', size: '2.0', length: '3000' },
  { id: 2, type: 'S45C', size: '60', length: '3000' },
  { id: 3, type: 'ADC12', size: '', length: '' },
  { id: 4, type: 'PA66-GF30', size: '', length: '' },
];

// ── Parts ───────────────────────────────────────────────────────────
// Each part mirrors a partDef from the seeder. ops use process_id/machine/ct.
// apqp starts blank (matches a freshly-seeded part), ppap carries PSW status/date.
function makePart(o) {
  return {
    id: o.id,
    uid: o.uid,
    pn: o.pn,
    name: o.name,
    rev: o.rev,
    customer_id: o.customer_id,
    program: o.program || '',
    engineer: o.engineer || '',
    ppap_level: o.ppap_level,
    part_type: o.part_type,
    part_status: o.part_status,
    sop: o.sop || '',
    material_id: o.material_id,
    psw_date: o.psw_date || '',
    notes: o.notes || '',
    drawing_file: '',
    status: o.status || 'on-track',
    ops: (o.ops || []).map((op) => ({
      op: op.op,
      process_id: op.process_id,
      machine: op.machine || '',
      ct: op.ct || '',
    })),
    apqp: blankApqp(),
    ppap: {
      checks: Array(PPAP_CHECK_COUNT).fill(false),
      pswStatus: o.pswStatus || '',
      pswDate: o.psw_date || '',
    },
  };
}

const parts = [
  makePart({
    id: 1, uid: 'NPD-2026-001',
    pn: 'DEMO-PN-1001', name: 'Bracket Assembly — Front Suspension', rev: 'Rev C',
    customer_id: 1, program: 'Model Alpha 2026', engineer: 'J. Tan',
    ppap_level: 3, part_type: 'Prototype (Sample)', part_status: 'Active',
    sop: '01-Sep-26', material_id: 2, notes: 'Demo part — fictional data',
    psw_date: '15-Mar-26', pswStatus: 'Accept',
    ops: [
      { op: 'OP10', process_id: 3, machine: 'Press 150T', ct: '12' },
      { op: 'OP20', process_id: 1, machine: 'CNC Lathe A1', ct: '45' },
      { op: 'OP30', process_id: 5, machine: '', ct: '' },
    ],
  }),
  makePart({
    id: 2, uid: 'NPD-2026-002',
    pn: 'DEMO-PN-1002', name: 'Housing — Transmission Control', rev: 'Rev A',
    customer_id: 2, program: 'EV Platform 2026', engineer: 'S. Wei',
    ppap_level: 2, part_type: 'Prototype (Test)', part_status: 'Active',
    material_id: 3, notes: 'Demo part — tooling under review',
    pswStatus: 'In Progress',
    ops: [
      { op: 'OP10', process_id: 2, machine: 'VMC-500', ct: '120' },
      { op: 'OP20', process_id: 5, machine: '', ct: '' },
    ],
  }),
  makePart({
    id: 3, uid: 'NPD-2026-003',
    pn: 'DEMO-PN-1003', name: 'Cover — Engine Timing Belt', rev: 'Rev D',
    customer_id: 1, program: 'Model Alpha 2026', engineer: 'A. Rahman',
    ppap_level: 3, part_type: 'Pre Launch (Pre Launch)', part_status: 'Active',
    sop: '15-Oct-26', material_id: 4, notes: 'Demo part',
    psw_date: '02-May-25', pswStatus: 'Accept',
    ops: [
      { op: 'OP10', process_id: 2, machine: 'VMC-300', ct: '90' },
      { op: 'OP20', process_id: 5, machine: '', ct: '' },
    ],
  }),
  makePart({
    id: 4, uid: 'NPD-2025-001',
    pn: 'DEMO-PN-1004', name: 'Bracket — Seat Rail LH/RH', rev: 'Rev B',
    customer_id: 3, program: 'Sedan Refresh 2025', engineer: 'M. Ong',
    ppap_level: 2, part_type: 'Safe Launch (Safe Launch)', part_status: 'Active',
    sop: '20-Jan-25', material_id: 1, notes: 'Demo part',
    psw_date: '10-Dec-24', pswStatus: 'Accept',
    ops: [
      { op: 'OP10', process_id: 3, machine: 'Press 150T', ct: '15' },
      { op: 'OP20', process_id: 6, machine: '', ct: '' },
    ],
  }),
  makePart({
    id: 5, uid: 'NPD-2025-002',
    pn: 'DEMO-PN-1005', name: 'Panel — Instrument Cluster Surround', rev: 'Rev F',
    customer_id: 4, program: 'Hatchback LE 2025', engineer: 'K. Devi',
    ppap_level: 2, part_type: 'Production Run (Production)', part_status: 'Mass Run',
    sop: '01-Jun-25', material_id: 4, notes: 'Demo part — PSW approved, in mass production',
    psw_date: '15-May-25', pswStatus: 'Accept',
    ops: [
      { op: 'OP10', process_id: 6, machine: '', ct: '' },
      { op: 'OP20', process_id: 5, machine: '', ct: '' },
    ],
  }),
  makePart({
    id: 6, uid: 'NPD-2025-003',
    pn: 'DEMO-PN-1006', name: 'Clip — Bumper Retainer Set', rev: 'Rev B',
    customer_id: 2, program: 'Hatchback LE 2025', engineer: 'S. Wei',
    ppap_level: 1, part_type: 'Prototype (Test)', part_status: 'Not-Active',
    material_id: 4, notes: 'Demo part — on hold, supplier audit pending',
    pswStatus: '',
    ops: [
      { op: 'OP10', process_id: 3, machine: '', ct: '' },
    ],
  }),
];

// ── Issues ──────────────────────────────────────────────────────────
const issues = [
  {
    id: 1, issue_id: 'ISS-DEMO-001', part_uid: 'NPD-2026-001',
    title: 'Weld distortion observed on bracket flange', severity: 'high',
    status: 'open', owner: 'J. Tan', date: '10-Jun-26', notes: 'Demo issue',
  },
  {
    id: 2, issue_id: 'ISS-DEMO-002', part_uid: 'NPD-2026-002',
    title: 'Tooling shrinkage non-conformance', severity: 'medium',
    status: 'open', owner: 'S. Wei', date: '08-Jun-26', notes: 'Demo issue',
  },
  {
    id: 3, issue_id: 'ISS-DEMO-003', part_uid: 'NPD-2025-001',
    title: 'Dimensional OOT on rail mounting hole', severity: 'low',
    status: 'closed', owner: 'M. Ong', date: '02-Nov-24', notes: 'Resolved — re-worked fixture',
  },
];

// ── RFQs (seeder created none) ──────────────────────────────────────
const rfqs = [];

// ── Sample builds ───────────────────────────────────────────────────
function makeSample(o) {
  return {
    id: o.dbId,
    build_id: o.id,
    customer: o.customer,
    pn: o.pn,
    plan_qty: o.plan_qty || 0,
    actual_qty: o.actual_qty != null ? o.actual_qty : null,
    ship_qty: o.ship_qty || 0,
    po_num: o.po_num || '',
    start_date: o.start_date || '',
    etd_date: o.etd_date || '',
    shipped_date: o.shipped_date || '',
    unit_price_usd: o.unit_price_usd || 0,
    selling_price_usd: o.selling_price_usd || 0,
    cost_pc: o.cost_pc || 0,
    cost_unit: o.cost_unit || 'USD',
    nw: o.nw != null ? o.nw : null,
    gw: o.gw != null ? o.gw : null,
    material_id: o.material_id || null,
    material_weight_kg: o.material_weight_kg || 0,
    material_bar_pcs: o.material_bar_pcs || 0,
    procs: (o.procs || []).map((p) => ({
      name: p.name,
      start_plan: p.start_plan || '',
      start_actual: p.start_actual || '',
      end_plan: p.end_plan || '',
      end_actual: p.end_actual || '',
    })),
    etds: (o.etds || []).map((e) => ({ date: e.date, qty: e.qty || 0 })),
  };
}

const samples = [
  makeSample({
    dbId: 1, id: 'SB-DEMO-001', customer: 'Contoso Components', pn: 'DEMO-PN-1004',
    plan_qty: 20, ship_qty: 20, po_num: 'PO-DEMO-101',
    start_date: '05-Jan-25', etd_date: '20-Jan-25', shipped_date: '20-Jan-25',
    unit_price_usd: 8.5, selling_price_usd: 170,
    material_id: 1, material_weight_kg: 22.0, material_bar_pcs: 6,
    etds: [{ date: '20-Jan-25', qty: 20 }],
    procs: [
      { name: 'Material', start_plan: '05-Jan-25', end_plan: '07-Jan-25', start_actual: '05-Jan-25', end_actual: '07-Jan-25' },
      { name: 'Stamping', start_plan: '07-Jan-25', end_plan: '12-Jan-25', start_actual: '07-Jan-25', end_actual: '12-Jan-25' },
      { name: 'Assembly', start_plan: '12-Jan-25', end_plan: '20-Jan-25', start_actual: '12-Jan-25', end_actual: '20-Jan-25' },
    ],
  }),
  makeSample({
    dbId: 2, id: 'SB-DEMO-002', customer: 'Contoso Components', pn: 'DEMO-PN-1004',
    plan_qty: 35, ship_qty: 35, po_num: 'PO-DEMO-102',
    start_date: '10-Mar-25', etd_date: '28-Mar-25', shipped_date: '28-Mar-25',
    unit_price_usd: 8.2, selling_price_usd: 287,
    material_id: 1, material_weight_kg: 38.5, material_bar_pcs: 10,
    etds: [{ date: '28-Mar-25', qty: 35 }],
    procs: [
      { name: 'Material', start_plan: '10-Mar-25', end_plan: '12-Mar-25', start_actual: '10-Mar-25', end_actual: '12-Mar-25' },
      { name: 'Stamping', start_plan: '12-Mar-25', end_plan: '18-Mar-25', start_actual: '12-Mar-25', end_actual: '18-Mar-25' },
      { name: 'Assembly', start_plan: '18-Mar-25', end_plan: '28-Mar-25', start_actual: '18-Mar-25', end_actual: '28-Mar-25' },
    ],
  }),
  makeSample({
    dbId: 3, id: 'SB-DEMO-003', customer: 'Globex Drivetrain', pn: 'DEMO-PN-1005',
    plan_qty: 150, ship_qty: 150, po_num: 'PO-DEMO-201',
    start_date: '01-Jun-25', etd_date: '15-Jun-25', shipped_date: '15-Jun-25',
    unit_price_usd: 3.6, selling_price_usd: 540,
    material_id: 4, material_weight_kg: 45.0, material_bar_pcs: 0,
    etds: [{ date: '15-Jun-25', qty: 150 }],
    procs: [
      { name: 'Material', start_plan: '01-Jun-25', end_plan: '02-Jun-25', start_actual: '01-Jun-25', end_actual: '02-Jun-25' },
      { name: 'Assembly', start_plan: '02-Jun-25', end_plan: '10-Jun-25', start_actual: '02-Jun-25', end_actual: '10-Jun-25' },
      { name: 'Inspection', start_plan: '10-Jun-25', end_plan: '15-Jun-25', start_actual: '10-Jun-25', end_actual: '15-Jun-25' },
    ],
  }),
  makeSample({
    dbId: 4, id: 'SB-DEMO-004', customer: 'Globex Drivetrain', pn: 'DEMO-PN-1005',
    plan_qty: 220, ship_qty: 220, po_num: 'PO-DEMO-202',
    start_date: '02-Sep-25', etd_date: '18-Sep-25', shipped_date: '18-Sep-25',
    unit_price_usd: 3.4, selling_price_usd: 748,
    material_id: 4, material_weight_kg: 66.0, material_bar_pcs: 0,
    etds: [{ date: '18-Sep-25', qty: 220 }],
    procs: [
      { name: 'Material', start_plan: '02-Sep-25', end_plan: '03-Sep-25', start_actual: '02-Sep-25', end_actual: '03-Sep-25' },
      { name: 'Assembly', start_plan: '03-Sep-25', end_plan: '12-Sep-25', start_actual: '03-Sep-25', end_actual: '12-Sep-25' },
      { name: 'Inspection', start_plan: '12-Sep-25', end_plan: '18-Sep-25', start_actual: '12-Sep-25', end_actual: '18-Sep-25' },
    ],
  }),
  makeSample({
    dbId: 5, id: 'SB-DEMO-005', customer: 'Globex Drivetrain', pn: 'DEMO-PN-1005',
    plan_qty: 180, ship_qty: 180, po_num: 'PO-DEMO-203',
    start_date: '05-Nov-25', etd_date: '20-Nov-25', shipped_date: '20-Nov-25',
    unit_price_usd: 3.5, selling_price_usd: 630,
    material_id: 4, material_weight_kg: 54.0, material_bar_pcs: 0,
    etds: [{ date: '20-Nov-25', qty: 180 }],
    procs: [
      { name: 'Material', start_plan: '05-Nov-25', end_plan: '06-Nov-25', start_actual: '05-Nov-25', end_actual: '06-Nov-25' },
      { name: 'Assembly', start_plan: '06-Nov-25', end_plan: '14-Nov-25', start_actual: '06-Nov-25', end_actual: '14-Nov-25' },
      { name: 'Inspection', start_plan: '14-Nov-25', end_plan: '20-Nov-25', start_actual: '14-Nov-25', end_actual: '20-Nov-25' },
    ],
  }),
  makeSample({
    dbId: 6, id: 'SB-DEMO-006', customer: 'Acme Automotive', pn: 'DEMO-PN-1001',
    plan_qty: 10, ship_qty: 10, po_num: 'PO-DEMO-301',
    start_date: '01-Feb-26', etd_date: '18-Feb-26', shipped_date: '18-Feb-26',
    unit_price_usd: 14.0, selling_price_usd: 140,
    material_id: 2, material_weight_kg: 12.5, material_bar_pcs: 3,
    etds: [{ date: '18-Feb-26', qty: 10 }],
    procs: [
      { name: 'Material', start_plan: '01-Feb-26', end_plan: '03-Feb-26', start_actual: '01-Feb-26', end_actual: '03-Feb-26' },
      { name: 'Stamping', start_plan: '03-Feb-26', end_plan: '06-Feb-26', start_actual: '03-Feb-26', end_actual: '06-Feb-26' },
      { name: 'Turning', start_plan: '06-Feb-26', end_plan: '10-Feb-26', start_actual: '06-Feb-26', end_actual: '10-Feb-26' },
      { name: 'Inspection', start_plan: '10-Feb-26', end_plan: '18-Feb-26', start_actual: '10-Feb-26', end_actual: '18-Feb-26' },
    ],
  }),
  makeSample({
    dbId: 7, id: 'SB-DEMO-007', customer: 'Acme Automotive', pn: 'DEMO-PN-1003',
    plan_qty: 12, ship_qty: 12, po_num: 'PO-DEMO-302',
    start_date: '10-Apr-26', etd_date: '25-Apr-26', shipped_date: '25-Apr-26',
    unit_price_usd: 11.0, selling_price_usd: 132,
    material_id: 4, material_weight_kg: 9.0, material_bar_pcs: 0,
    etds: [{ date: '25-Apr-26', qty: 12 }],
    procs: [
      { name: 'Material', start_plan: '10-Apr-26', end_plan: '12-Apr-26', start_actual: '10-Apr-26', end_actual: '12-Apr-26' },
      { name: 'Milling', start_plan: '12-Apr-26', end_plan: '20-Apr-26', start_actual: '12-Apr-26', end_actual: '20-Apr-26' },
      { name: 'Inspection', start_plan: '20-Apr-26', end_plan: '25-Apr-26', start_actual: '20-Apr-26', end_actual: '25-Apr-26' },
    ],
  }),
  makeSample({
    dbId: 8, id: 'SB-DEMO-008', customer: 'Acme Automotive', pn: 'DEMO-PN-1001',
    plan_qty: 10, ship_qty: 0, po_num: 'PO-DEMO-401',
    start_date: '01-Jun-26', etd_date: '20-Jun-26',
    material_id: 2, material_weight_kg: 12.5, material_bar_pcs: 3,
    etds: [{ date: '20-Jun-26', qty: 10 }],
    procs: [
      { name: 'Material', start_plan: '01-Jun-26', end_plan: '03-Jun-26', start_actual: '01-Jun-26', end_actual: '03-Jun-26' },
      { name: 'Stamping', start_plan: '03-Jun-26', end_plan: '06-Jun-26', start_actual: '03-Jun-26', end_actual: '' },
      { name: 'Turning', start_plan: '06-Jun-26', end_plan: '10-Jun-26', start_actual: '', end_actual: '' },
      { name: 'Inspection', start_plan: '10-Jun-26', end_plan: '20-Jun-26', start_actual: '', end_actual: '' },
    ],
  }),
];

// ── Build the /api/export snapshot (matches original server.js) ─────
function buildExport() {
  return {
    reg: {
      customers: customers.map((c) => ({ id: c.id, name: c.name })),
      processes: processes.map((p) => ({ id: p.id, name: p.name, machines: p.machines || [] })),
      materials: materials.map((m) => ({ id: m.id, type: m.type, size: m.size, length: m.length })),
    },
    parts,
    samples,
    issues,
    rfqs,
  };
}

module.exports = { buildExport, customers, processes, materials, parts, samples, issues, rfqs };
