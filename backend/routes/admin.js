const express = require('express');
const router = express.Router();
const db = require('../db');

function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.admin_key;
  const expected = process.env.ADMIN_API_KEY || 'DEMO_ADMIN_KEY';
  if (key !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.use(adminAuth);

// GET /api/admin/devices
router.get('/devices', (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit  || 50), 200);
  const offset = parseInt(req.query.offset || 0);

  const rows = db.prepare(`
    SELECT
      id, device_id, tenant_id, order_id,
      payment_status, payment_amount,
      activation_status,
      qr_used,
      qr_expires_at,
      created_at, verified_at
    FROM verifications
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  const total = db.prepare('SELECT COUNT(*) AS n FROM verifications').get().n;

  res.json({ total, limit, offset, rows });
});

// GET /api/admin/devices/:device_id
router.get('/devices/:device_id', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM verifications WHERE device_id = ? ORDER BY created_at DESC
  `).all(req.params.device_id);

  if (!rows.length) return res.status(404).json({ error: 'Device not found' });
  res.json(rows);
});

// POST /api/admin/revoke/:order_id
router.post('/revoke/:order_id', (req, res) => {
  const row = db.prepare('SELECT * FROM verifications WHERE order_id = ?').get(req.params.order_id);
  if (!row) return res.status(404).json({ error: 'Order not found' });

  db.prepare(`
    UPDATE verifications
    SET activation_status = 'revoked', qr_used = 1
    WHERE order_id = ?
  `).run(req.params.order_id);

  db.prepare(`
    INSERT INTO audit_log (event, device_id, tenant_id, order_id, detail, created_at)
    VALUES ('ACTIVATION_REVOKED', ?, ?, ?, 'Admin revoked', ?)
  `).run(row.device_id, row.tenant_id, req.params.order_id, Date.now());

  res.json({ success: true, order_id: req.params.order_id });
});

// GET /api/admin/audit-log
router.get('/audit-log', (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit  || 100), 500);
  const offset = parseInt(req.query.offset || 0);

  const rows = db.prepare(`
    SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);

  const total = db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;
  res.json({ total, limit, offset, rows });
});

// GET /api/admin/stats
router.get('/stats', (req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN payment_status    = 'paid'      THEN 1 ELSE 0 END) AS paid,
      SUM(CASE WHEN activation_status = 'activated' THEN 1 ELSE 0 END) AS activated,
      SUM(CASE WHEN activation_status = 'revoked'   THEN 1 ELSE 0 END) AS revoked,
      SUM(CASE WHEN qr_used = 1                     THEN 1 ELSE 0 END) AS qr_used
    FROM verifications
  `).get();
  res.json(stats);
});

module.exports = router;
