const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  visitorId: {
    type: String,
    required: true,
    unique: true,
  },
  projectId: {
    type: String,
    default: 'default',
  },
  status: {
    type: String,
    enum: ['active', 'bot', 'closed'],
    default: 'bot',
  },
  assignedAgent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    default: null,
  },
  visitorInfo: {
    ip: String,
    userAgent: String,
    currentPage: String,
    title: String,
    referrer: String,
    location: String,
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
  },
  unreadCount: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

module.exports = mongoose.model('Session', sessionSchema);
