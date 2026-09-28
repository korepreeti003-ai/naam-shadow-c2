const mongoose = require('mongoose');

const FirebaseSlotSchema = new mongoose.Schema({
  name: { type: String, required: true },
  projectId: { type: String, required: true },
  serviceAccountJson: { type: Object, required: true },
  deviceCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  maxDevices: { type: Number, default: 10000 },
  notes: String
}, { timestamps: true });

module.exports = mongoose.model('FirebaseSlot', FirebaseSlotSchema);
