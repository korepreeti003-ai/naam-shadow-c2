require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

const BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_KEY   = process.env.ADMIN_API_KEY || 'DEMO_ADMIN_KEY';
const BACKEND_URL = process.env.BACKEND_URL   || 'http://localhost:3000';
const ALLOWED_IDS = (process.env.ALLOWED_CHAT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

if (!BOT_TOKEN) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN is not set');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

function isAllowed(chatId) {
  if (!ALLOWED_IDS.length) return true;
  return ALLOWED_IDS.includes(String(chatId));
}

function requireAuth(msg, cb) {
  if (!isAllowed(msg.chat.id)) {
    bot.sendMessage(msg.chat.id, '⛔ Not authorised.');
    return;
  }
  cb();
}

async function adminGet(path) {
  const r = await fetch(`${BACKEND_URL}${path}`, {
    headers: { 'x-admin-key': ADMIN_KEY }
  });
  return r.json();
}

async function adminPost(path, body = {}) {
  const r = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'x-admin-key': ADMIN_KEY, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

bot.onText(/\/start/, (msg) => {
  const menu = `
*BOOM PANEL Bot* 🚀

Commands:
/stats        — verification statistics
/devices      — list recent device verifications
/device <id>  — lookup a device
/revoke <order> — revoke an activation
/audit        — recent audit log entries
/help         — show this menu
`.trim();
  bot.sendMessage(msg.chat.id, menu, { parse_mode: 'Markdown' });
});

bot.onText(/\/help/, (msg) => bot.emit('message', { ...msg, text: '/start' }));

bot.onText(/\/stats/, (msg) => {
  requireAuth(msg, async () => {
    try {
      const d = await adminGet('/api/admin/stats');
      const text = `
📊 *Verification Stats*

Total sessions:  \`${d.total}\`
Paid:            \`${d.paid}\`
Activated:       \`${d.activated}\`
QR used:         \`${d.qr_used}\`
Revoked:         \`${d.revoked}\`
`.trim();
      bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    } catch (e) {
      bot.sendMessage(msg.chat.id, `❌ Error: ${e.message}`);
    }
  });
});

bot.onText(/\/devices/, (msg) => {
  requireAuth(msg, async () => {
    try {
      const d = await adminGet('/api/admin/devices?limit=10&offset=0');
      if (!d.rows.length) { bot.sendMessage(msg.chat.id, 'No devices yet.'); return; }

      const lines = d.rows.map(r => {
        const icon = r.activation_status === 'activated' ? '✅'
                   : r.activation_status === 'revoked'   ? '❌' : '⏳';
        return `${icon} \`${r.device_id.slice(0,12)}\` | ${r.tenant_id} | ${r.activation_status}`;
      });

      bot.sendMessage(msg.chat.id,
        `*Recent Devices* (${d.total} total)\n\n${lines.join('\n')}`,
        { parse_mode: 'Markdown' });
    } catch (e) {
      bot.sendMessage(msg.chat.id, `❌ Error: ${e.message}`);
    }
  });
});

bot.onText(/\/device (.+)/, (msg, match) => {
  requireAuth(msg, async () => {
    try {
      const deviceId = match[1].trim();
      const rows = await adminGet(`/api/admin/devices/${encodeURIComponent(deviceId)}`);
      if (!Array.isArray(rows) || !rows.length) {
        bot.sendMessage(msg.chat.id, `Device \`${deviceId}\` not found.`, { parse_mode: 'Markdown' });
        return;
      }
      const r = rows[0];
      const text = `
*Device:* \`${r.device_id}\`
*Tenant:*  \`${r.tenant_id}\`
*Order:*   \`${r.order_id || '—'}\`
*Payment:*    ${r.payment_status}
*Activation:* ${r.activation_status}
*QR Used:*    ${r.qr_used ? 'Yes' : 'No'}
*Verified:*   ${r.verified_at ? new Date(r.verified_at).toLocaleString() : '—'}
`.trim();
      bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    } catch (e) {
      bot.sendMessage(msg.chat.id, `❌ Error: ${e.message}`);
    }
  });
});

bot.onText(/\/revoke (.+)/, (msg, match) => {
  requireAuth(msg, async () => {
    try {
      const orderId = match[1].trim();
      const resp = await adminPost(`/api/admin/revoke/${encodeURIComponent(orderId)}`);
      if (resp.success) {
        bot.sendMessage(msg.chat.id, `✅ Activation revoked for order \`${orderId}\``, { parse_mode: 'Markdown' });
      } else {
        bot.sendMessage(msg.chat.id, `❌ ${resp.error || 'Revoke failed'}`);
      }
    } catch (e) {
      bot.sendMessage(msg.chat.id, `❌ Error: ${e.message}`);
    }
  });
});

bot.onText(/\/audit/, (msg) => {
  requireAuth(msg, async () => {
    try {
      const d = await adminGet('/api/admin/audit-log?limit=10&offset=0');
      if (!d.rows.length) { bot.sendMessage(msg.chat.id, 'Audit log empty.'); return; }

      const lines = d.rows.map(r =>
        `\`${new Date(r.created_at).toLocaleTimeString()}\` *${r.event}* ${r.device_id ? `| ${r.device_id.slice(0,10)}` : ''}`
      );
      bot.sendMessage(msg.chat.id,
        `*Audit Log* (last 10)\n\n${lines.join('\n')}`,
        { parse_mode: 'Markdown' });
    } catch (e) {
      bot.sendMessage(msg.chat.id, `❌ Error: ${e.message}`);
    }
  });
});

const http = require('http');
const NOTIFY_PORT = process.env.NOTIFY_PORT || 3001;

const notifyServer = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/notify') {
    res.writeHead(404); res.end(); return;
  }
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const { chat_id, message } = JSON.parse(body);
      const target = chat_id || (ALLOWED_IDS[0] || null);
      if (target) bot.sendMessage(target, message, { parse_mode: 'Markdown' });
      res.writeHead(200); res.end('ok');
    } catch {
      res.writeHead(400); res.end('bad request');
    }
  });
});

notifyServer.listen(NOTIFY_PORT, () => {
  console.log(`BOOM PANEL Telegram bot running. Notify listener on :${NOTIFY_PORT}`);
});

bot.on('polling_error', err => console.error('Polling error:', err.message));
