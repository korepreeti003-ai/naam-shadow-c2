// server.js — Premium Channel Landing Page
const express = require("express");
const path    = require("path");
const fs      = require("fs");
const app     = express();
const PORT    = process.env.PORT || 80;
const CFG     = path.join(__dirname, "config.json");
const APK_DIR = path.join(__dirname, "apk");

if (!fs.existsSync(APK_DIR)) fs.mkdirSync(APK_DIR);

const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";

// load bot for notifications (if running together)
let bot;
try { bot = require("./bot"); } catch { bot = null; }

app.use(express.json({ limit: "50mb" }));
app.use(express.static(__dirname));
app.use("/apk", express.static(APK_DIR));

app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));

// config API
app.get("/api/config", (_, res) => {
  try { res.json({ ok: true, config: fs.existsSync(CFG) ? JSON.parse(fs.readFileSync(CFG)) : {} }); }
  catch { res.json({ ok: false }); }
});

app.post("/api/update", (req, res) => {
  const { password, config } = req.body || {};
  if (password !== ADMIN_PASS) return res.status(401).json({ ok: false });
  try { fs.writeFileSync(CFG, JSON.stringify(config, null, 2)); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false }); }
});

// geo lookup via ip-api.com (free, no key needed)
function geoLookup(ip) {
  return new Promise(resolve => {
    const cleanIp = ip.replace("::ffff:", "").split(",")[0].trim();
    // skip private IPs
    if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$)/.test(cleanIp)) {
      return resolve({ country: "Local", city: "Local", isp: "Local" });
    }
    const http2 = require("http");
    http2.get(`http://ip-api.com/json/${cleanIp}?fields=country,city,regionName,isp,org,mobile,proxy`, r => {
      let d = "";
      r.on("data", c => d += c);
      r.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
    }).on("error", () => resolve({}));
  });
}

// format IST time
function istTime() {
  return new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: true
  });
}

// visitor tracking — called from page JS
app.post("/api/visit", async (req, res) => {
  res.json({ ok: true });

  const rawIp  = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?";
  const ip     = rawIp.replace("::ffff:", "").split(",")[0].trim();
  const type   = req.body?.type || "visit";
  const ua     = req.body?.ua     || req.headers["user-agent"] || "?";
  const ref    = req.body?.ref    || req.headers["referer"]    || "Direct";
  const screen = req.body?.screen || "?";
  const lang   = req.body?.lang   || "?";

  // increment counter
  try {
    const c = fs.existsSync(CFG) ? JSON.parse(fs.readFileSync(CFG)) : {};
    if (type === "visit")    c.visit_count = (c.visit_count || 0) + 1;
    if (type === "join")     c.join_count  = (c.join_count  || 0) + 1;
    if (type === "download") c.dl_count    = (c.dl_count    || 0) + 1;
    fs.writeFileSync(CFG, JSON.stringify(c, null, 2));
  } catch {}

  // geo lookup + notify
  const geo = await geoLookup(ip);

  // parse device type from UA
  const isMobile  = /mobile|android|iphone|ipad/i.test(ua);
  const isTablet  = /tablet|ipad/i.test(ua);
  const deviceStr = isTablet ? "📟 Tablet" : isMobile ? "📱 Mobile" : "💻 Desktop";

  // browser
  let browser = "Unknown";
  if (/chrome/i.test(ua) && !/edg/i.test(ua)) browser = "Chrome";
  else if (/firefox/i.test(ua))               browser = "Firefox";
  else if (/safari/i.test(ua))                browser = "Safari";
  else if (/edg/i.test(ua))                   browser = "Edge";
  else if (/opera|opr/i.test(ua))             browser = "Opera";

  // OS
  let os = "Unknown";
  if (/windows/i.test(ua))      os = "Windows";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone/i.test(ua))  os = "iPhone";
  else if (/ipad/i.test(ua))    os = "iPad";
  else if (/mac/i.test(ua))     os = "Mac";
  else if (/linux/i.test(ua))   os = "Linux";

  let emoji, title;
  if (type === "join")     { emoji = "🔥"; title = "JOIN TELEGRAM CLICK"; }
  else if (type === "download") { emoji = "⬇️"; title = "APK DOWNLOAD CLICK"; }
  else                     { emoji = "👀"; title = "NEW VISITOR"; }

  const msg =
    `${emoji} <b>${title}</b>\n` +
    `━━━━━━━━━━━━━━━\n` +
    `🕐 <b>Time:</b> ${istTime()}\n` +
    `🌐 <b>IP:</b> <code>${ip}</code>\n` +
    `📍 <b>Location:</b> ${geo.city || "?"}, ${geo.regionName || ""}, ${geo.country || "?"}\n` +
    `🏢 <b>ISP:</b> ${geo.isp || geo.org || "?"}\n` +
    (geo.mobile ? `📶 <b>Network:</b> Mobile Data\n` : "") +
    (geo.proxy  ? `🔒 <b>VPN/Proxy:</b> Yes\n`       : "") +
    `━━━━━━━━━━━━━━━\n` +
    `${deviceStr}\n` +
    `🌐 <b>Browser:</b> ${browser}\n` +
    `💿 <b>OS:</b> ${os}\n` +
    `📐 <b>Screen:</b> ${screen}\n` +
    `🗣 <b>Language:</b> ${lang}\n` +
    `🔗 <b>Referrer:</b> ${ref || "Direct"}`;

  if (bot?.notifyVisit) {
    bot.notifyVisit("raw", { msg });
  }
});

app.listen(PORT, () => console.log(`[SERVER] Live on :${PORT}`));
