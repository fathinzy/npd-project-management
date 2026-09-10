/**
 * Catch-all serverless API for the read-only Vercel demo.
 *
 * The original backend was a stateful Express + SQLite server. Vercel runs
 * stateless serverless functions with no persistent disk, so this handler
 * serves the seed data directly and treats the demo as read-only:
 *   - GET  endpoints return data built from api/_data.js
 *   - write endpoints (POST/PUT/PATCH/DELETE) return ok:true without persisting
 *
 * This lets the existing frontend run unmodified — it loads everything from
 * GET /api/export, and its optimistic in-memory UI updates still work for the
 * duration of a page session (they just don't survive a refresh, which is the
 * expected behavior for a demo).
 */

'use strict';

const {
  buildExport,
  customers,
  processes,
  materials,
  parts,
  samples,
  issues,
  rfqs,
} = require('./_data');

const ok = (res, data, status = 200) => res.status(status).json({ ok: true, data });

// Strip the leading /api and any query string, return clean path segments.
function routeOf(req) {
  let p = req.url || '';
  const q = p.indexOf('?');
  if (q !== -1) p = p.slice(0, q);
  p = p.replace(/^\/+/, '');           // trim leading slashes
  if (p.startsWith('api/')) p = p.slice(4);
  else if (p === 'api') p = '';
  return p.replace(/\/+$/, '');        // trim trailing slash
}

module.exports = (req, res) => {
  const route = routeOf(req);
  const method = (req.method || 'GET').toUpperCase();

  // Any write in the demo is a no-op that reports success so the UI stays happy.
  if (method !== 'GET') {
    return ok(res, { demo: true, message: 'Read-only demo — changes are not saved.' });
  }

  // ── Read endpoints ────────────────────────────────────────────────
  switch (route) {
    case 'export':
      return ok(res, buildExport());

    case 'customers':
      return ok(res, customers.map((c) => ({ id: c.id, name: c.name })));

    case 'processes':
      return ok(res, processes.map((p) => ({ id: p.id, name: p.name, machines: p.machines || [] })));

    case 'materials':
      return ok(res, materials.map((m) => ({ id: m.id, type: m.type, size: m.size, length: m.length })));

    case 'parts':
      return ok(res, parts);

    case 'samples':
      return ok(res, samples);

    case 'issues':
      return ok(res, issues);

    case 'rfqs':
      return ok(res, rfqs);

    case 'apqp-files':
      // No uploaded files in the demo — return empty grouping.
      return ok(res, {});

    case 'health':
      return ok(res, { status: 'ok', mode: 'demo', ts: new Date().toISOString() });

    case 'next-uid': {
      const y = new Date().getFullYear();
      return ok(res, { uid: `NPD-${y}-001` });
    }

    default:
      break;
  }

  // Parameterized GETs: /parts/:id and /samples/:id
  const partMatch = route.match(/^parts\/(\d+)$/);
  if (partMatch) {
    const part = parts.find((p) => p.id === Number(partMatch[1]));
    return part ? ok(res, part) : res.status(404).json({ ok: false, error: 'Not found' });
  }
  const sampleMatch = route.match(/^samples\/(\d+)$/);
  if (sampleMatch) {
    const s = samples.find((x) => x.id === Number(sampleMatch[1]));
    return s ? ok(res, s) : res.status(404).json({ ok: false, error: 'Not found' });
  }

  // Anything else under /api that we don't model → empty success so the
  // frontend doesn't hard-error on an unexpected read.
  return ok(res, null);
};
