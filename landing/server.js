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

// visitor tracking — called from page JS
app.post("/api/visit", (req, res) => {
  res.json({ ok: true });
  const ip   = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?";
  const type = req.body?.type || "visit";

  // increment counter
  try {
    const c = fs.existsSync(CFG) ? JSON.parse(fs.readFileSync(CFG)) : {};
    if (type === "visit")    c.visit_count = (c.visit_count || 0) + 1;
    if (type === "join")     c.join_count  = (c.join_count  || 0) + 1;
    if (type === "download") c.dl_count    = (c.dl_count    || 0) + 1;
    fs.writeFileSync(CFG, JSON.stringify(c, null, 2));
  } catch {}

  // telegram notification
  if (bot?.notifyVisit) {
    const tmap = { visit: "visit", join: "join_click", download: "download_click" };
    bot.notifyVisit(tmap[type] || "visit", { ip });
  }
});

app.listen(PORT, () => console.log(`[SERVER] Live on :${PORT}`));
