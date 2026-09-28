const router = require('express').Router();
const FirebaseSlot = require('../models/FirebaseSlot');
const Device = require('../models/Device');
const { removeSlotFromCache } = require('../config/firebase');

router.get('/', async (req, res) => {
  try {
    const slots = await FirebaseSlot.find().lean();
    for (const s of slots) {
      s.deviceCount = await Device.countDocuments({ firebaseSlotId: s._id });
    }
    res.json(slots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, projectId, serviceAccountJson, maxDevices, notes } = req.body;
    if (!name || !projectId || !serviceAccountJson) {
      return res.status(400).json({ error: 'name, projectId, serviceAccountJson required' });
    }
    const slot = await FirebaseSlot.create({
      name, projectId, serviceAccountJson, maxDevices: maxDevices || 10000, notes
    });
    res.status(201).json(slot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { name, isActive, maxDevices, notes } = req.body;
    const slot = await FirebaseSlot.findByIdAndUpdate(
      req.params.id, { $set: { name, isActive, maxDevices, notes } }, { new: true }
    );
    removeSlotFromCache(req.params.id);
    res.json(slot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const count = await Device.countDocuments({ firebaseSlotId: req.params.id });
    if (count > 0) {
      return res.status(400).json({ error: `Cannot delete: ${count} devices still assigned` });
    }
    await FirebaseSlot.findByIdAndDelete(req.params.id);
    removeSlotFromCache(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
