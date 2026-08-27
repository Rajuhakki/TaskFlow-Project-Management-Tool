const mongoose = require('mongoose');

const discussionSchema = new mongoose.Schema(
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
    message: {
      type: String,
      required: [true, 'Message text is required'],
      trim: true
    }
  },
  {
    timestamps: true
  }
);

const Discussion = mongoose.model('Discussion', discussionSchema);

module.exports = Discussion;
