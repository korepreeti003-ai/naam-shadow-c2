const express = require("express");
const path    = require("path");
const fs      = require("fs");
const app     = express();
const PORT    = process.env.PORT || 80;
const CFG     = path.join(__dirname, "config.json");

app.use(express.json({ limit: "10mb" }));
app.use(express.static(__dirname));

app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));

app.get("/api/config", (_, res) => {
  try {
    const c = fs.existsSync(CFG) ? JSON.parse(fs.readFileSync(CFG)) : {};
    res.json({ ok: true, config: c });
  } catch { res.json({ ok: false }); }
});

app.post("/api/update", (req, res) => {
  const { password, config } = req.body || {};
  if (password !== (process.env.ADMIN_PASS || "admin123"))
    return res.status(401).json({ ok: false });
  try {
    fs.writeFileSync(CFG, JSON.stringify(config, null, 2));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false }); }
});

app.listen(PORT, () => console.log("Live on :" + PORT));
