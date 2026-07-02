/**
 * Demo data seeder for the NPD Project Management System.
 *
 * Populates the database with realistic but entirely FICTIONAL
 * manufacturing data, so the app can be explored without exposing
 * any real customer or business information.
 *
 * This version includes shipped sample builds spread across two years
 * with varied revenue/quantity, plus PSW approvals — enough data for
 * the Dashboard charts and Report tab (Sales Report, Sales Report 2,
 * PSW Report) to render meaningfully instead of showing "No data".
 *
 * Usage:
 *   node seed-demo-data.js
 *
 * To wipe and reseed, just delete backend/data/npd.db and restart
 * the server first (a fresh DB is created automatically), then run
 * this script again.
 */

'use strict';

const BASE_URL = process.env.SEED_BASE_URL || 'http://localhost:3001/api';

async function post(path, body) {
  const r = await fetch(BASE_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await r.json();
  if (!json.ok) throw new Error(`POST ${path} failed: ${json.error}`);
  return json.data;
}

async function patch(path, body) {
  const r = await fetch(BASE_URL + path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await r.json();
  if (!json.ok) throw new Error(`PATCH ${path} failed: ${json.error}`);
  return json.data;
}

async function main() {
  console.log('🌱 Seeding demo data into', BASE_URL);

  // ── Customers (fictional) ──────────────────────────────
  const customerNames = ['Acme Automotive', 'Northwind Motors', 'Contoso Components', 'Globex Drivetrain'];
  const customers = await Promise.all(customerNames.map(name => post('/customers', { name })));
  console.log(`  ✓ ${customers.length} customers`);

  // ── Processes ───────────────────────────────────────────
  const processes = await Promise.all([
    post('/processes', { name: 'Turning', machines: ['CNC Lathe A1', 'CNC Lathe B2'] }),
    post('/processes', { name: 'Milling', machines: ['VMC-300', 'VMC-500'] }),
    post('/processes', { name: 'Stamping', machines: ['Press 150T'] }),
    post('/processes', { name: 'Welding', machines: [] }),
    post('/processes', { name: 'Inspection', machines: [] }),
    post('/processes', { name: 'Assembly', machines: [] }),
  ]);
  console.log(`  ✓ ${processes.length} processes`);

  // ── Materials ────────────────────────────────────────────
  const materials = await Promise.all([
    post('/materials', { type: 'SPCC', size: '2.0', length: '3000' }),
    post('/materials', { type: 'S45C', size: '60', length: '3000' }),
    post('/materials', { type: 'ADC12', size: '', length: '' }),
    post('/materials', { type: 'PA66-GF30', size: '', length: '' }),
  ]);
  console.log(`  ✓ ${materials.length} materials`);

  // ── Parts — spread across types, customers, and PPAP status ──
  const partDefs = [
    {
      pn: 'DEMO-PN-1001', name: 'Bracket Assembly — Front Suspension', rev: 'Rev C',
      customer_id: customers[0].id, program: 'Model Alpha 2026', engineer: 'J. Tan',
      ppap_level: 3, part_type: 'Prototype (Sample)', part_status: 'Active',
      sop: '01-Sep-26', material_id: materials[1].id, notes: 'Demo part — fictional data',
      psw_date: '15-Mar-26', pswStatus: 'Accept',
      ops: [
        { op: 'OP10', process_id: processes[2].id, machine: 'Press 150T', ct: '12' },
        { op: 'OP20', process_id: processes[0].id, machine: 'CNC Lathe A1', ct: '45' },
        { op: 'OP30', process_id: processes[4].id, machine: '', ct: '' },
      ],
    },
    {
      pn: 'DEMO-PN-1002', name: 'Housing — Transmission Control', rev: 'Rev A',
      customer_id: customers[1].id, program: 'EV Platform 2026', engineer: 'S. Wei',
      ppap_level: 2, part_type: 'Prototype (Test)', part_status: 'Active',
      material_id: materials[2].id, notes: 'Demo part — tooling under review',
      pswStatus: 'In Progress',
      ops: [
        { op: 'OP10', process_id: processes[1].id, machine: 'VMC-500', ct: '120' },
        { op: 'OP20', process_id: processes[4].id, machine: '', ct: '' },
      ],
    },
    {
      pn: 'DEMO-PN-1003', name: 'Cover — Engine Timing Belt', rev: 'Rev D',
      customer_id: customers[0].id, program: 'Model Alpha 2026', engineer: 'A. Rahman',
      ppap_level: 3, part_type: 'Pre Launch (Pre Launch)', part_status: 'Active',
      sop: '15-Oct-26', material_id: materials[3].id, notes: 'Demo part',
      psw_date: '02-May-25', pswStatus: 'Accept',
      ops: [
        { op: 'OP10', process_id: processes[1].id, machine: 'VMC-300', ct: '90' },
        { op: 'OP20', process_id: processes[4].id, machine: '', ct: '' },
      ],
    },
    {
      pn: 'DEMO-PN-1004', name: 'Bracket — Seat Rail LH/RH', rev: 'Rev B',
      customer_id: customers[2].id, program: 'Sedan Refresh 2025', engineer: 'M. Ong',
      ppap_level: 2, part_type: 'Safe Launch (Safe Launch)', part_status: 'Active',
      sop: '20-Jan-25', material_id: materials[0].id, notes: 'Demo part',
      psw_date: '10-Dec-24', pswStatus: 'Accept',
      ops: [
        { op: 'OP10', process_id: processes[2].id, machine: 'Press 150T', ct: '15' },
        { op: 'OP20', process_id: processes[5].id, machine: '', ct: '' },
      ],
    },
    {
      pn: 'DEMO-PN-1005', name: 'Panel — Instrument Cluster Surround', rev: 'Rev F',
      customer_id: customers[3].id, program: 'Hatchback LE 2025', engineer: 'K. Devi',
      ppap_level: 2, part_type: 'Production Run (Production)', part_status: 'Mass Run',
      sop: '01-Jun-25', material_id: materials[3].id, notes: 'Demo part — PSW approved, in mass production',
      psw_date: '15-May-25', pswStatus: 'Accept',
      ops: [
        { op: 'OP10', process_id: processes[5].id, machine: '', ct: '' },
        { op: 'OP20', process_id: processes[4].id, machine: '', ct: '' },
      ],
    },
    {
      pn: 'DEMO-PN-1006', name: 'Clip — Bumper Retainer Set', rev: 'Rev B',
      customer_id: customers[1].id, program: 'Hatchback LE 2025', engineer: 'S. Wei',
      ppap_level: 1, part_type: 'Prototype (Test)', part_status: 'Not-Active',
      material_id: materials[3].id, notes: 'Demo part — on hold, supplier audit pending',
      pswStatus: '',
      ops: [
        { op: 'OP10', process_id: processes[2].id, machine: '', ct: '' },
      ],
    },
  ];

  const createdParts = await Promise.all(partDefs.map(p => post('/parts', p)));
  console.log(`  ✓ ${createdParts.length} parts`);

  // Explicitly set PSW status/date via the PPAP patch route too, so the
  // Dashboard "PSW Approve" KPI and Report > PSW Report both pick it up
  // consistently regardless of which code path reads it.
  for (const p of partDefs) {
    if (!p.pswStatus) continue;
    const created = createdParts.find(c => c.pn === p.pn);
    if (!created) continue;
    await patch(`/parts/${created.id}/ppap`, {
      psw_status: p.pswStatus,
      psw_date: p.psw_date || null,
    });
  }
  console.log('  ✓ PSW statuses set');

  // ── Issues ───────────────────────────────────────────────
  await Promise.all([
    post('/issues', {
      issue_id: 'ISS-DEMO-001', part_uid: createdParts[0].uid,
      title: 'Weld distortion observed on bracket flange', severity: 'high',
      status: 'open', owner: 'J. Tan', date: '10-Jun-26', notes: 'Demo issue',
    }),
    post('/issues', {
      issue_id: 'ISS-DEMO-002', part_uid: createdParts[1].uid,
      title: 'Tooling shrinkage non-conformance', severity: 'medium',
      status: 'open', owner: 'S. Wei', date: '08-Jun-26', notes: 'Demo issue',
    }),
    post('/issues', {
      issue_id: 'ISS-DEMO-003', part_uid: createdParts[3].uid,
      title: 'Dimensional OOT on rail mounting hole', severity: 'low',
      status: 'closed', owner: 'M. Ong', date: '02-Nov-24', notes: 'Resolved — re-worked fixture',
    }),
  ]);
  console.log('  ✓ 3 issues');

  // ── Sample Builds — mix of shipped (with revenue) and in-progress ──
  const sampleDefs = [
    {
      id: 'SB-DEMO-001', customer: customers[2].name, pn: 'DEMO-PN-1004',
      plan_qty: 20, ship_qty: 20, po_num: 'PO-DEMO-101',
      start_date: '05-Jan-25', etd_date: '20-Jan-25', shipped_date: '20-Jan-25',
      unit_price_usd: 8.5, selling_price_usd: 170,
      material_id: materials[0].id, material_weight_kg: 22.0, material_bar_pcs: 6,
      etds: [{ date: '20-Jan-25', qty: 20 }],
      procs: [
        { name: 'Material', start_plan: '05-Jan-25', end_plan: '07-Jan-25', start_actual: '05-Jan-25', end_actual: '07-Jan-25' },
        { name: 'Stamping', start_plan: '07-Jan-25', end_plan: '12-Jan-25', start_actual: '07-Jan-25', end_actual: '12-Jan-25' },
        { name: 'Assembly', start_plan: '12-Jan-25', end_plan: '20-Jan-25', start_actual: '12-Jan-25', end_actual: '20-Jan-25' },
      ],
    },
    {
      id: 'SB-DEMO-002', customer: customers[2].name, pn: 'DEMO-PN-1004',
      plan_qty: 35, ship_qty: 35, po_num: 'PO-DEMO-102',
      start_date: '10-Mar-25', etd_date: '28-Mar-25', shipped_date: '28-Mar-25',
      unit_price_usd: 8.2, selling_price_usd: 287,
      material_id: materials[0].id, material_weight_kg: 38.5, material_bar_pcs: 10,
      etds: [{ date: '28-Mar-25', qty: 35 }],
      procs: [
        { name: 'Material', start_plan: '10-Mar-25', end_plan: '12-Mar-25', start_actual: '10-Mar-25', end_actual: '12-Mar-25' },
        { name: 'Stamping', start_plan: '12-Mar-25', end_plan: '18-Mar-25', start_actual: '12-Mar-25', end_actual: '18-Mar-25' },
        { name: 'Assembly', start_plan: '18-Mar-25', end_plan: '28-Mar-25', start_actual: '18-Mar-25', end_actual: '28-Mar-25' },
      ],
    },
    {
      id: 'SB-DEMO-003', customer: customers[3].name, pn: 'DEMO-PN-1005',
      plan_qty: 150, ship_qty: 150, po_num: 'PO-DEMO-201',
      start_date: '01-Jun-25', etd_date: '15-Jun-25', shipped_date: '15-Jun-25',
      unit_price_usd: 3.6, selling_price_usd: 540,
      material_id: materials[3].id, material_weight_kg: 45.0, material_bar_pcs: 0,
      etds: [{ date: '15-Jun-25', qty: 150 }],
      procs: [
        { name: 'Material', start_plan: '01-Jun-25', end_plan: '02-Jun-25', start_actual: '01-Jun-25', end_actual: '02-Jun-25' },
        { name: 'Assembly', start_plan: '02-Jun-25', end_plan: '10-Jun-25', start_actual: '02-Jun-25', end_actual: '10-Jun-25' },
        { name: 'Inspection', start_plan: '10-Jun-25', end_plan: '15-Jun-25', start_actual: '10-Jun-25', end_actual: '15-Jun-25' },
      ],
    },
    {
      id: 'SB-DEMO-004', customer: customers[3].name, pn: 'DEMO-PN-1005',
      plan_qty: 220, ship_qty: 220, po_num: 'PO-DEMO-202',
      start_date: '02-Sep-25', etd_date: '18-Sep-25', shipped_date: '18-Sep-25',
      unit_price_usd: 3.4, selling_price_usd: 748,
      material_id: materials[3].id, material_weight_kg: 66.0, material_bar_pcs: 0,
      etds: [{ date: '18-Sep-25', qty: 220 }],
      procs: [
        { name: 'Material', start_plan: '02-Sep-25', end_plan: '03-Sep-25', start_actual: '02-Sep-25', end_actual: '03-Sep-25' },
        { name: 'Assembly', start_plan: '03-Sep-25', end_plan: '12-Sep-25', start_actual: '03-Sep-25', end_actual: '12-Sep-25' },
        { name: 'Inspection', start_plan: '12-Sep-25', end_plan: '18-Sep-25', start_actual: '12-Sep-25', end_actual: '18-Sep-25' },
      ],
    },
    {
      id: 'SB-DEMO-005', customer: customers[3].name, pn: 'DEMO-PN-1005',
      plan_qty: 180, ship_qty: 180, po_num: 'PO-DEMO-203',
      start_date: '05-Nov-25', etd_date: '20-Nov-25', shipped_date: '20-Nov-25',
      unit_price_usd: 3.5, selling_price_usd: 630,
      material_id: materials[3].id, material_weight_kg: 54.0, material_bar_pcs: 0,
      etds: [{ date: '20-Nov-25', qty: 180 }],
      procs: [
        { name: 'Material', start_plan: '05-Nov-25', end_plan: '06-Nov-25', start_actual: '05-Nov-25', end_actual: '06-Nov-25' },
        { name: 'Assembly', start_plan: '06-Nov-25', end_plan: '14-Nov-25', start_actual: '06-Nov-25', end_actual: '14-Nov-25' },
        { name: 'Inspection', start_plan: '14-Nov-25', end_plan: '20-Nov-25', start_actual: '14-Nov-25', end_actual: '20-Nov-25' },
      ],
    },
    {
      id: 'SB-DEMO-006', customer: customers[0].name, pn: 'DEMO-PN-1001',
      plan_qty: 10, ship_qty: 10, po_num: 'PO-DEMO-301',
      start_date: '01-Feb-26', etd_date: '18-Feb-26', shipped_date: '18-Feb-26',
      unit_price_usd: 14.0, selling_price_usd: 140,
      material_id: materials[1].id, material_weight_kg: 12.5, material_bar_pcs: 3,
      etds: [{ date: '18-Feb-26', qty: 10 }],
      procs: [
        { name: 'Material', start_plan: '01-Feb-26', end_plan: '03-Feb-26', start_actual: '01-Feb-26', end_actual: '03-Feb-26' },
        { name: 'Stamping', start_plan: '03-Feb-26', end_plan: '06-Feb-26', start_actual: '03-Feb-26', end_actual: '06-Feb-26' },
        { name: 'Turning', start_plan: '06-Feb-26', end_plan: '10-Feb-26', start_actual: '06-Feb-26', end_actual: '10-Feb-26' },
        { name: 'Inspection', start_plan: '10-Feb-26', end_plan: '18-Feb-26', start_actual: '10-Feb-26', end_actual: '18-Feb-26' },
      ],
    },
    {
      id: 'SB-DEMO-007', customer: customers[0].name, pn: 'DEMO-PN-1003',
      plan_qty: 12, ship_qty: 12, po_num: 'PO-DEMO-302',
      start_date: '10-Apr-26', etd_date: '25-Apr-26', shipped_date: '25-Apr-26',
      unit_price_usd: 11.0, selling_price_usd: 132,
      material_id: materials[3].id, material_weight_kg: 9.0, material_bar_pcs: 0,
      etds: [{ date: '25-Apr-26', qty: 12 }],
      procs: [
        { name: 'Material', start_plan: '10-Apr-26', end_plan: '12-Apr-26', start_actual: '10-Apr-26', end_actual: '12-Apr-26' },
        { name: 'Milling', start_plan: '12-Apr-26', end_plan: '20-Apr-26', start_actual: '12-Apr-26', end_actual: '20-Apr-26' },
        { name: 'Inspection', start_plan: '20-Apr-26', end_plan: '25-Apr-26', start_actual: '20-Apr-26', end_actual: '25-Apr-26' },
      ],
    },
    {
      id: 'SB-DEMO-008', customer: customers[0].name, pn: 'DEMO-PN-1001',
      plan_qty: 10, ship_qty: 0, po_num: 'PO-DEMO-401',
      start_date: '01-Jun-26', etd_date: '20-Jun-26',
      material_id: materials[1].id, material_weight_kg: 12.5, material_bar_pcs: 3,
      etds: [{ date: '20-Jun-26', qty: 10 }],
      procs: [
        { name: 'Material', start_plan: '01-Jun-26', end_plan: '03-Jun-26', start_actual: '01-Jun-26', end_actual: '03-Jun-26' },
        { name: 'Stamping', start_plan: '03-Jun-26', end_plan: '06-Jun-26', start_actual: '03-Jun-26', end_actual: '' },
        { name: 'Turning', start_plan: '06-Jun-26', end_plan: '10-Jun-26', start_actual: '', end_actual: '' },
        { name: 'Inspection', start_plan: '10-Jun-26', end_plan: '20-Jun-26', start_actual: '', end_actual: '' },
      ],
    },
  ];

  await Promise.all(sampleDefs.map(s => post('/samples', s)));
  console.log(`  ✓ ${sampleDefs.length} sample builds (7 shipped across 2025–2026, 1 in progress)`);

  console.log('\n✅ Demo data seeded successfully!');
  console.log(`   Visit ${BASE_URL.replace('/api', '')} to explore the app.`);
  console.log('   Check the Dashboard, Sample Plan (Gantt), and Report tabs — all should now show populated charts.');
}

main().catch(e => {
  console.error('❌ Seeding failed:', e.message);
  process.exit(1);
});
