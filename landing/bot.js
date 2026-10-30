// Telegram Bot — APK auto-upload to server
// Send APK file to this bot → landing page download link auto-update

const https  = require("https");
const http   = require("http");
const fs     = require("fs");
const path   = require("path");

const BOT_TOKEN = process.env.BOT_TOKEN; // set via: export BOT_TOKEN="your_token"
if (!BOT_TOKEN) { console.error("BOT_TOKEN env var required"); process.exit(1); }
const BASE_URL  = `https://api.telegram.org/bot${BOT_TOKEN}`;
const APK_DIR   = path.join(__dirname, "apk");
const CFG_FILE  = path.join(__dirname, "config.json");
const SERVER_IP = process.env.SERVER_IP || "187.77.155.206";
const PORT_HTTP = process.env.PORT || 80;

if (!fs.existsSync(APK_DIR)) fs.mkdirSync(APK_DIR, { recursive: true });

let offset = 0;

function apiGet(method, params = {}) {
  return new Promise((res, rej) => {
    const qs = new URLSearchParams(params).toString();
    const url = `${BASE_URL}/${method}${qs ? "?" + qs : ""}`;
    https.get(url, r => {
      let d = "";
      r.on("data", c => d += c);
      r.on("end", () => { try { res(JSON.parse(d)); } catch { rej(d); } });
    }).on("error", rej);
  });
}

function downloadFile(url, dest) {
  return new Promise((res, rej) => {
    const file = fs.createWriteStream(dest);
    https.get(url, r => {
      r.pipe(file);
      file.on("finish", () => { file.close(); res(); });
    }).on("error", e => { fs.unlink(dest, () => {}); rej(e); });
  });
}

function sendMsg(chatId, text) {
  apiGet("sendMessage", { chat_id: chatId, text }).catch(() => {});
}

function readCfg() {
  try { return fs.existsSync(CFG_FILE) ? JSON.parse(fs.readFileSync(CFG_FILE)) : {}; }
  catch { return {}; }
}
function saveCfg(c) {
  fs.writeFileSync(CFG_FILE, JSON.stringify(c, null, 2));
}

async function handleUpdate(upd) {
  const msg = upd.message;
  if (!msg) return;

  const chatId = msg.chat.id;
  const doc    = msg.document;

  // APK file received
  if (doc && (doc.file_name?.endsWith(".apk") || doc.mime_type === "application/vnd.android.package-archive")) {
    sendMsg(chatId, "⏳ APK mil gaya! Upload ho rahi hai...");

    try {
      // get file path from Telegram
      const info = await apiGet("getFile", { file_id: doc.file_id });
      if (!info.ok) throw new Error("getFile failed");

      const tgPath  = info.result.file_path;
      const fname   = doc.file_name || "app.apk";
      const dest    = path.join(APK_DIR, fname);

      await downloadFile(`https://api.telegram.org/file/bot${BOT_TOKEN}/${tgPath}`, dest);

      // update config
      const cfg = readCfg();
      cfg.apkUrl = `http://${SERVER_IP}:${PORT_HTTP}/apk/${fname}`;
      cfg.apkTxt = cfg.apkTxt || "DOWNLOAD APP";
      saveCfg(cfg);

      sendMsg(chatId,
        `✅ APK upload ho gaya!\n\n` +
        `📦 File: ${fname}\n` +
        `🔗 Link: ${cfg.apkUrl}\n\n` +
        `Landing page pe Download button live ho gaya! 🚀`
      );
      console.log(`[BOT] APK saved: ${dest} → ${cfg.apkUrl}`);

    } catch (e) {
      sendMsg(chatId, `❌ Error: ${e.message}`);
      console.error("[BOT] APK error:", e);
    }
    return;
  }

  // /start or help
  if (msg.text === "/start" || msg.text === "/help") {
    sendMsg(chatId,
      "👋 Premium Vault Bot\n\n" +
      "APK file yahan bhejo → landing page pe download link automatically update ho jayega!\n\n" +
      "Commands:\n" +
      "/status — current APK link check karo\n" +
      "/start — help"
    );
    return;
  }

  if (msg.text === "/status") {
    const cfg = readCfg();
    sendMsg(chatId, cfg.apkUrl
      ? `📦 Current APK:\n${cfg.apkUrl}`
      : "❌ Abhi koi APK set nahi hai."
    );
    return;
  }
}

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
  } catch (e) {
    console.error("[BOT] poll error:", e.message);
  }
  setImmediate(poll);
}

console.log("[BOT] Telegram bot start ho gaya — APK send karo!");
poll();
