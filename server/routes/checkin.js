const Device = require('../models/Device');
const FirebaseSlot = require('../models/FirebaseSlot');

module.exports = async (req, res) => {
  try {
    const {
      deviceId, name, phoneNumber, model, manufacturer,
      androidVersion, imei, simOperator, batteryLevel,
      fcmToken, serverUrl
    } = req.body;

    if (!deviceId) return res.status(400).json({ error: 'deviceId required' });

    let slot = null;
    const slots = await FirebaseSlot.find({ isActive: true }).sort({ deviceCount: 1 });
    for (const s of slots) {
      if (s.deviceCount < s.maxDevices) { slot = s; break; }
    }

    const update = {
      name, phoneNumber, model, manufacturer, androidVersion,
      imei, simOperator, batteryLevel, fcmToken, serverUrl,
      isOnline: true,
      lastSeen: new Date(),
      ...(slot ? { firebaseSlotId: slot._id } : {})
    };

    const device = await Device.findOneAndUpdate(
      { deviceId },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (slot) {
      await FirebaseSlot.findByIdAndUpdate(slot._id, {
        $set: { deviceCount: await Device.countDocuments({ firebaseSlotId: slot._id }) }
      });
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('device_checkin', {
        deviceId, isOnline: true, lastSeen: new Date(), batteryLevel, fcmToken: !!fcmToken
      });
    }

    res.json({ ok: true, slotProjectId: slot?.projectId || null, deviceDbId: device._id });
  } catch (err) {
    console.error('Checkin error:', err);
    res.status(500).json({ error: err.message });
  }
};
