const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'boompanel.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS verifications (
    id          TEXT PRIMARY KEY,
    device_id   TEXT NOT NULL,
    tenant_id   TEXT NOT NULL,
    order_id    TEXT UNIQUE,
    payment_status  TEXT NOT NULL DEFAULT 'pending',
    payment_amount  INTEGER DEFAULT 100,
    qr_token        TEXT,
    qr_expires_at   INTEGER,
    qr_used         INTEGER NOT NULL DEFAULT 0,
    activation_status TEXT NOT NULL DEFAULT 'pending',
    created_at  INTEGER NOT NULL,
    verified_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_verifications_device_id   ON verifications(device_id);
  CREATE INDEX IF NOT EXISTS idx_verifications_order_id    ON verifications(order_id);
  CREATE INDEX IF NOT EXISTS idx_verifications_tenant_id   ON verifications(tenant_id);

  CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    event      TEXT NOT NULL,
    device_id  TEXT,
    tenant_id  TEXT,
    order_id   TEXT,
    detail     TEXT,
    created_at INTEGER NOT NULL
  );
`);

module.exports = db;
