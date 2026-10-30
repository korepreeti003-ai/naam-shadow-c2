// Telegram Bot — APK upload + visitor notifications
// Send APK → auto-update download link
// Page visitor → instant Telegram alert

const https = require("https");
const fs    = require("fs");
const path  = require("path");

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) { console.error("BOT_TOKEN env var required. Run: export BOT_TOKEN=your_token"); process.exit(1); }

const BASE     = `https://api.telegram.org/bot${BOT_TOKEN}`;
const APK_DIR  = path.join(__dirname, "apk");
const CFG_FILE = path.join(__dirname, "config.json");
const IP       = process.env.SERVER_IP || "187.77.155.206";
const PORT     = process.env.PORT || 80;

if (!fs.existsSync(APK_DIR)) fs.mkdirSync(APK_DIR, { recursive: true });

let offset = 0;

// ── helpers ──
function apiGet(method, params = {}) {
  return new Promise((res, rej) => {
    const qs  = new URLSearchParams(params).toString();
    const url = `${BASE}/${method}${qs ? "?" + qs : ""}`;
    https.get(url, r => {
      let d = "";
      r.on("data", c => d += c);
      r.on("end", () => { try { res(JSON.parse(d)); } catch { rej(d); } });
    }).on("error", rej);
  });
}

function sendMsg(chatId, text, opts = {}) {
  return apiGet("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...opts }).catch(() => {});
}

function downloadFile(url, dest) {
  return new Promise((res, rej) => {
    const file = fs.createWriteStream(dest);
    https.get(url, r => { r.pipe(file); file.on("finish", () => { file.close(); res(); }); })
      .on("error", e => { fs.unlink(dest, () => {}); rej(e); });
  });
}

function readCfg()    { try { return fs.existsSync(CFG_FILE) ? JSON.parse(fs.readFileSync(CFG_FILE)) : {}; } catch { return {}; } }
function saveCfg(c)   { fs.writeFileSync(CFG_FILE, JSON.stringify(c, null, 2)); }

// ── admin chat ID (set on /start) ──
function getAdminId() { return readCfg().admin_chat_id || null; }
function setAdminId(id) { const c = readCfg(); c.admin_chat_id = id; saveCfg(c); }

// ── NOTIFY — called by server.js when page visited ──
function notifyVisit(type, extra = {}) {
  const adminId = getAdminId();
  if (!adminId) return;

  const now  = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  let text;

  if (type === "visit") {
    text = `👀 <b>Koi aaya!</b>\n🕐 ${now}\n🌐 IP: <code>${extra.ip || "?"}</code>`;
  } else if (type === "join_click") {
    text = `🔥 <b>JOIN CLICK!</b>\n🕐 ${now}\n🌐 IP: <code>${extra.ip || "?"}</code>\nKoi join karne wala hai Telegram pe!`;
  } else if (type === "download_click") {
    text = `⬇️ <b>APK Download Click!</b>\n🕐 ${now}\n🌐 IP: <code>${extra.ip || "?"}</code>`;
  }

  if (text) sendMsg(adminId, text);
}

// ── handle Telegram updates ──
async function handleUpdate(upd) {
  const msg = upd.message;
  if (!msg) return;
  const chatId = msg.chat.id;
  const doc    = msg.document;

  // /start → register admin + welcome
  if (msg.text === "/start") {
    setAdminId(chatId);
    sendMsg(chatId,
      `✅ <b>Admin registered!</b>\n\n` +
      `Ab jab bhi koi <b>187.77.155.206</b> pe aayega:\n` +
      `• 👀 Visit → notification\n` +
      `• 🔥 JOIN click → notification\n` +
      `• ⬇️ APK download → notification\n\n` +
      `APK bhejne ke liye: yahan .apk file forward karo\n` +
      `/status — current APK link\n` +
      `/stats — visitor count`
    );
    console.log(`[BOT] Admin set: ${chatId}`);
    return;
  }

  if (msg.text === "/status") {
    const c = readCfg();
    sendMsg(chatId, c.apkUrl ? `📦 APK: ${c.apkUrl}` : "❌ Koi APK set nahi");
    return;
  }

  if (msg.text === "/stats") {
    const c = readCfg();
    sendMsg(chatId,
      `📊 <b>Stats</b>\n` +
      `👀 Visitors: <b>${c.visit_count || 0}</b>\n` +
      `🔥 JOIN clicks: <b>${c.join_count || 0}</b>\n` +
      `⬇️ APK clicks: <b>${c.dl_count || 0}</b>`
    );
    return;
  }

  // APK file
  if (doc && (doc.file_name?.endsWith(".apk") || doc.mime_type === "application/vnd.android.package-archive")) {
    sendMsg(chatId, "⏳ APK mil gaya! Upload ho rahi hai...");
    try {
      const info  = await apiGet("getFile", { file_id: doc.file_id });
      if (!info.ok) throw new Error("getFile failed");
      const fname = doc.file_name || "app.apk";
      const dest  = path.join(APK_DIR, fname);
      await downloadFile(`https://api.telegram.org/file/bot${BOT_TOKEN}/${info.result.file_path}`, dest);
      const cfg   = readCfg();
      cfg.apkUrl  = `http://${IP}:${PORT}/apk/${fname}`;
      cfg.apkTxt  = cfg.apkTxt || "DOWNLOAD APP";
      saveCfg(cfg);
      sendMsg(chatId,
        `✅ <b>APK live ho gaya!</b>\n\n` +
        `📦 ${fname}\n` +
        `🔗 ${cfg.apkUrl}\n\n` +
        `Landing page pe Download button active hai! 🚀`
      );
    } catch (e) {
      sendMsg(chatId, `❌ Error: ${e.message}`);
    }
    return;
  }
}

// ── long-poll loop ──
async function poll() {
  try {
    const r = await apiGet("getUpdates", {
      offset,
      timeout: 30,
      allowed_updates: JSON.stringify(["message"]),
    });
    if (r.ok && r.result.length) {
      for (const upd of r.result) {
        offset = upd.update_id + 1;
        handleUpdate(upd).catch(console.error);
      }
    }
  } catch (e) { console.error("[BOT] poll:", e.message); }
  setImmediate(poll);
}

// ── export notify for server.js ──
module.exports = { notifyVisit };

console.log("[BOT] Running — send /start to register as admin");
poll();
