/**
 * Demo data seeder for the NPD Project Management System.
 *
 * Populates the database with realistic but entirely FICTIONAL
 * manufacturing data, so the app can be explored without exposing
 * any real customer or business information.
 *
 * Usage:
 *   node seed-demo-data.js
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
  if (!json.ok) throw new Error(`${path} failed: ${json.error}`);
  return json.data;
}

async function main() {
  console.log('🌱 Seeding demo data into', BASE_URL);

  // ── Customers (fictional) ──────────────────────────────
  const customers = await Promise.all(
    ['Acme Automotive', 'Northwind Motors', 'Contoso Components', 'Globex Drivetrain']
      .map(name => post('/customers', { name }))
  );
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

  // ── Parts ────────────────────────────────────────────────
  const parts = [
    {
      pn: 'DEMO-PN-1001', name: 'Bracket Assembly — Front Suspension', rev: 'Rev C',
      customer_id: customers[0].id, program: 'Model Alpha 2026', engineer: 'J. Tan',
      ppap_level: 3, part_type: 'Prototype (Sample)', part_status: 'Active',
      sop: '01-Sep-26', material_id: materials[1].id, notes: 'Demo part — fictional data',
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
      ops: [
        { op: 'OP10', process_id: processes[1].id, machine: 'VMC-300', ct: '90' },
        { op: 'OP20', process_id: processes[4].id, machine: '', ct: '' },
      ],
    },
  ];

  const createdParts = await Promise.all(parts.map(p => post('/parts', p)));
  console.log(`  ✓ ${createdParts.length} parts`);

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
  ]);
  console.log('  ✓ 2 issues');

  // ── Sample Build ─────────────────────────────────────────
  await post('/samples', {
    id: 'SB-DEMO-001', customer: customers[0].name, pn: createdParts[0].pn,
    plan_qty: 10, ship_qty: 0, po_num: 'PO-DEMO-001',
    start_date: '01-Jun-26', etd_date: '20-Jun-26',
    material_id: materials[1].id, material_weight_kg: 12.5, material_bar_pcs: 3,
    etds: [{ date: '20-Jun-26', qty: 10 }],
    procs: [
      { name: 'Material', start_plan: '01-Jun-26', end_plan: '03-Jun-26', start_actual: '01-Jun-26', end_actual: '03-Jun-26' },
      { name: 'Stamping', start_plan: '03-Jun-26', end_plan: '06-Jun-26', start_actual: '03-Jun-26', end_actual: '' },
      { name: 'Turning', start_plan: '06-Jun-26', end_plan: '10-Jun-26', start_actual: '', end_actual: '' },
      { name: 'Inspection', start_plan: '10-Jun-26', end_plan: '20-Jun-26', start_actual: '', end_actual: '' },
    ],
  });
  console.log('  ✓ 1 sample build');

  console.log('\n✅ Demo data seeded successfully!');
  console.log(`   Visit ${BASE_URL.replace('/api', '')} to explore the app.`);
}

main().catch(e => {
  console.error('❌ Seeding failed:', e.message);
  process.exit(1);
});
