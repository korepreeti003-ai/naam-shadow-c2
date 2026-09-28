const mongoose = require('mongoose');

const CommandSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, index: true },
  type: {
    type: String,
    enum: ['send_sms', 'get_sms', 'get_contacts', 'get_location', 'ping'],
    required: true
  },
  payload: { type: Object, default: {} },
  status: { type: String, enum: ['pending', 'delivered', 'executed', 'failed'], default: 'pending' },
  result: Object,
  fcmMessageId: String,
  sentAt: Date,
  executedAt: Date
}, { timestamps: true });

module.exports = mongoose.model('Command', CommandSchema);
