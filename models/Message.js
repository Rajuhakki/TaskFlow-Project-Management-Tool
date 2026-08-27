const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    text: {
      type: String,
      trim: true,
      default: ''
    },
    file: {
      type: String,
      default: ''
    },
    audio: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
