const mongoose = require('mongoose');

const DeviceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true, index: true },
  name: String,
  phoneNumber: String,
  model: String,
  manufacturer: String,
  androidVersion: String,
  imei: String,
  simOperator: String,
  batteryLevel: Number,
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now },
  fcmToken: String,
  firebaseSlotId: { type: mongoose.Schema.Types.ObjectId, ref: 'FirebaseSlot' },
  serverUrl: String,
  tag: String,
  notes: String,
  registeredAt: { type: Date, default: Date.now }
}, { timestamps: true });

DeviceSchema.index({ isOnline: 1 });
DeviceSchema.index({ lastSeen: -1 });
DeviceSchema.index({ tag: 1 });

module.exports = mongoose.model('Device', DeviceSchema);
