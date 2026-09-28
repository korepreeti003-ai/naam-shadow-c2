const router = require('express').Router();
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const { sendTelegram } = require('../utils/telegram');

const SECRET = process.env.JWT_SECRET || 'boom_secret_change_me';

Admin.findOne({ username: 'admin' }).then(async (existing) => {
  if (!existing) {
    const a = new Admin({ username: 'admin', password: 'boom@2025', role: 'superadmin' });
    await a.save();
    console.log('Default admin created: admin / boom@2025');
    sendTelegram('<b>BOOM Panel</b> started\nLogin: admin / boom@2025\nServer: http://187.77.155.206:3000');
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin || !(await admin.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: admin._id, role: admin.role }, SECRET, { expiresIn: '24h' });
    res.json({ token, role: admin.role, username: admin.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/change-password', require('../middleware/auth'), async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const admin = await Admin.findById(req.admin.id);
    if (!(await admin.comparePassword(oldPassword))) {
      return res.status(401).json({ error: 'Wrong current password' });
    }
    admin.password = newPassword;
    await admin.save();
    sendTelegram(`Password changed for user: ${admin.username}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
