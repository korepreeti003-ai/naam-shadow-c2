const router = require('express').Router();
const Device = require('../models/Device');
const Command = require('../models/Command');
const { sendFcm } = require('../config/firebase');

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, search, tag, online } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { deviceId: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } }
      ];
    }
    if (tag) query.tag = tag;
    if (online !== undefined) query.isOnline = online === 'true';

    const [devices, total] = await Promise.all([
      Device.find(query).sort({ lastSeen: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean(),
      Device.countDocuments(query)
    ]);

    res.json({ devices, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const [total, online, offline] = await Promise.all([
      Device.countDocuments(),
      Device.countDocuments({ isOnline: true }),
      Device.countDocuments({ isOnline: false })
    ]);
    res.json({ total, online, offline });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:deviceId', async (req, res) => {
  try {
    const device = await Device.findOne({ deviceId: req.params.deviceId }).lean();
    if (!device) return res.status(404).json({ error: 'Not found' });
    res.json(device);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:deviceId/command', async (req, res) => {
  try {
    const { type, payload } = req.body;
    const device = await Device.findOne({ deviceId: req.params.deviceId });
    if (!device) return res.status(404).json({ error: 'Device not found' });
    if (!device.fcmToken) return res.status(400).json({ error: 'No FCM token for device' });
    if (!device.firebaseSlotId) return res.status(400).json({ error: 'Device has no Firebase slot' });

    const cmd = await Command.create({
      deviceId: device.deviceId, type, payload: payload || {}, sentAt: new Date()
    });

    const fcmData = { commandId: cmd._id.toString(), type, ...payload };
    const msgId = await sendFcm(device.firebaseSlotId, device.fcmToken, fcmData);

    cmd.fcmMessageId = msgId;
    cmd.status = 'delivered';
    await cmd.save();

    res.json({ ok: true, commandId: cmd._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:deviceId', async (req, res) => {
  try {
    const { tag, notes } = req.body;
    const device = await Device.findOneAndUpdate(
      { deviceId: req.params.deviceId }, { $set: { tag, notes } }, { new: true }
    );
    res.json(device);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:deviceId', async (req, res) => {
  try {
    await Device.findOneAndDelete({ deviceId: req.params.deviceId });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/mark-offline', async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
    const result = await Device.updateMany(
      { lastSeen: { $lt: cutoff }, isOnline: true }, { $set: { isOnline: false } }
    );
    res.json({ updated: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
