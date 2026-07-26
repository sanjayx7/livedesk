const mongoose = require('mongoose');

const kbItemSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  embedding: {
    type: [Number],
    required: true,
  },
  projectId: {
    type: String,
    default: 'default',
  },
}, { timestamps: true });

module.exports = mongoose.model('KBItem', kbItemSchema);
