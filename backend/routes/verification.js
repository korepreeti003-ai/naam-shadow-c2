const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'DEMO_SECRET_CHANGE_IN_PROD';
const QR_TTL_SECONDS = 300; // 5 minutes, one-time use
const IS_DEMO = process.env.NODE_ENV !== 'production';

function log(event, fields = {}) {
  db.prepare(`
    INSERT INTO audit_log (event, device_id, tenant_id, order_id, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    event,
    fields.device_id || null,
    fields.tenant_id || null,
    fields.order_id  || null,
    fields.detail    || null,
    Date.now()
  );
}

// POST /api/verification/initiate
// Body: { device_id, tenant_id }
router.post('/initiate', (req, res) => {
  const { device_id, tenant_id } = req.body;

  if (!device_id || !tenant_id) {
    return res.status(400).json({ error: 'device_id and tenant_id are required' });
  }

  // If already fully activated, return current status
  const existing = db.prepare(`
    SELECT * FROM verifications
    WHERE device_id = ? AND activation_status = 'activated'
    ORDER BY created_at DESC LIMIT 1
  `).get(device_id);

  if (existing) {
    return res.json({
      already_activated: true,
      order_id: existing.order_id,
      activation_status: existing.activation_status,
    });
  }

  const id       = uuidv4();
  const order_id = IS_DEMO
    ? `DEMO-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
    : uuidv4();

  db.prepare(`
    INSERT INTO verifications (id, device_id, tenant_id, order_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, device_id, tenant_id, order_id, Date.now());

  log('VERIFICATION_INITIATED', { device_id, tenant_id, order_id });

  res.json({
    session_id: id,
    order_id,
    amount: 100,        // paise — ₹1.00
    currency: 'INR',
    is_demo: IS_DEMO,
  });
});

// POST /api/verification/mock-payment
// Body: { order_id, payment_method }
// DEMO ONLY: simulates a successful payment without a real gateway
router.post('/mock-payment', (req, res) => {
  if (!IS_DEMO) {
    return res.status(403).json({ error: 'Mock payment not available in production' });
  }

  const { order_id, payment_method } = req.body;
  if (!order_id) {
    return res.status(400).json({ error: 'order_id is required' });
  }

  const row = db.prepare('SELECT * FROM verifications WHERE order_id = ?').get(order_id);
  if (!row) {
    return res.status(404).json({ error: 'Order not found' });
  }
  if (row.payment_status === 'paid') {
    return res.status(409).json({ error: 'Order already paid' });
  }

  const mock_txn_id = `MOCK-TXN-${Date.now()}`;

  db.prepare(`
    UPDATE verifications
    SET payment_status = 'paid', order_id = order_id
    WHERE order_id = ?
  `).run(order_id);

  log('MOCK_PAYMENT_SUCCESS', {
    device_id:  row.device_id,
    tenant_id:  row.tenant_id,
    order_id,
    detail: JSON.stringify({ method: payment_method || 'DEMO', txn: mock_txn_id }),
  });

  res.json({
    success: true,
    is_demo: true,
    order_id,
    txn_id: mock_txn_id,
    payment_method: payment_method || 'DEMO',
  });
});

// POST /api/verification/activate
// Body: { order_id }
// Called by client after payment; backend confirms status before issuing QR
router.post('/activate', (req, res) => {
  const { order_id } = req.body;
  if (!order_id) {
    return res.status(400).json({ error: 'order_id is required' });
  }

  const row = db.prepare('SELECT * FROM verifications WHERE order_id = ?').get(order_id);
  if (!row) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Gate: only activate if payment is confirmed server-side
  if (row.payment_status !== 'paid') {
    return res.status(402).json({
      error: 'Payment not confirmed',
      payment_status: row.payment_status,
    });
  }

  if (row.activation_status === 'activated') {
    return res.json({ already_activated: true, order_id });
  }

  // Generate short-lived, one-time enrollment token
  const expiresAt = Math.floor(Date.now() / 1000) + QR_TTL_SECONDS;
  const payload = {
    type:      'enrollment',
    device_id: row.device_id,
    tenant_id: row.tenant_id,
    order_id,
    exp:       expiresAt,
    jti:       uuidv4(), // unique token ID, prevents reuse
  };
  const token = jwt.sign(payload, JWT_SECRET);

  db.prepare(`
    UPDATE verifications
    SET qr_token = ?, qr_expires_at = ?, activation_status = 'activated', verified_at = ?
    WHERE order_id = ?
  `).run(token, expiresAt * 1000, Date.now(), order_id);

  log('DEVICE_ACTIVATED', {
    device_id: row.device_id,
    tenant_id: row.tenant_id,
    order_id,
  });

  res.json({
    activated: true,
    order_id,
    token,
    expires_in: QR_TTL_SECONDS,
    is_demo: IS_DEMO,
  });
});

// GET /api/verification/qr/:order_id
// Returns a QR code image (base64 PNG) for the activation token
router.get('/qr/:order_id', async (req, res) => {
  const row = db.prepare('SELECT * FROM verifications WHERE order_id = ?').get(req.params.order_id);

  if (!row || !row.qr_token) {
    return res.status(404).json({ error: 'QR not available for this order' });
  }

  if (row.qr_used) {
    return res.status(410).json({ error: 'QR code already used' });
  }

  const now = Date.now();
  if (row.qr_expires_at && now > row.qr_expires_at) {
    return res.status(410).json({ error: 'QR code expired' });
  }

  try {
    const qrDataUrl = await QRCode.toDataURL(row.qr_token, {
      errorCorrectionLevel: 'H',
      width: 300,
      margin: 2,
    });
    res.json({ qr_data_url: qrDataUrl, expires_at: row.qr_expires_at, is_demo: IS_DEMO });
  } catch (err) {
    res.status(500).json({ error: 'QR generation failed' });
  }
});

// POST /api/verification/consume-qr
// Body: { token } — marks QR as used after successful enrollment scan
router.post('/consume-qr', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token required' });

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const row = db.prepare('SELECT * FROM verifications WHERE order_id = ?').get(payload.order_id);
  if (!row) return res.status(404).json({ error: 'Order not found' });
  if (row.qr_used) return res.status(410).json({ error: 'QR already consumed' });

  db.prepare('UPDATE verifications SET qr_used = 1 WHERE order_id = ?').run(payload.order_id);

  log('QR_CONSUMED', {
    device_id: payload.device_id,
    tenant_id: payload.tenant_id,
    order_id:  payload.order_id,
  });

  res.json({ success: true, device_id: payload.device_id, tenant_id: payload.tenant_id });
});

module.exports = router;
