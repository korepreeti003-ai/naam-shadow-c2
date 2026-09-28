const mongoose = require('mongoose');

const SmsSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, index: true },
  direction: { type: String, enum: ['incoming', 'outgoing'], required: true },
  address: { type: String, required: true },
  body: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  status: { type: String, enum: ['received', 'sent', 'failed', 'pending'], default: 'received' },
  threadId: String,
  commandId: String
}, { timestamps: true });

SmsSchema.index({ deviceId: 1, timestamp: -1 });
SmsSchema.index({ address: 1 });

module.exports = mongoose.model('Sms', SmsSchema);
