const Discussion = require('../models/Discussion');
const Project = require('../models/Project');
const mongoose = require('mongoose');
const { isProjectMember } = require('../middleware/roleMiddleware');

// @desc    Send a message in project discussion chat
// @route   POST /api/discussions/:projectId
// @access  Private
const sendMessage = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { message } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({ message: 'Please provide message text' });
    }

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ message: 'Invalid project ID format' });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Security check: Only project members can send messages
    if (!isProjectMember(project, req.user._id)) {
      return res.status(403).json({ message: 'Access denied. Only project members can participate in discussions' });
    }

    const discussionMessage = await Discussion.create({
      project: projectId,
      user: req.user._id,
      message: message.trim()
    });

    const populatedMessage = await Discussion.findById(discussionMessage._id)
      .populate('user', 'name email');

    // Real-Time Socket Emission
    const io = req.app.get('io');
    if (io) {
      io.to(`project:${projectId}`).emit('new_message', {
        message: populatedMessage,
        projectId
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      discussionMessage: populatedMessage
    });
  } catch (error) {
    console.error('Send discussion message error:', error);
    return res.status(500).json({ message: 'Server error sending message', error: error.message });
  }
};

// @desc    Get all discussion messages for a project
// @route   GET /api/discussions/:projectId
// @access  Private
const getProjectMessages = async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ message: 'Invalid project ID format' });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Security check: Only project members can view discussion history
    if (!isProjectMember(project, req.user._id)) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this project' });
    }

    const messages = await Discussion.find({ project: projectId })
      .populate('user', 'name email')
      .sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      count: messages.length,
      messages
    });
  } catch (error) {
    console.error('Get project messages error:', error);
    return res.status(500).json({ message: 'Server error fetching discussion messages', error: error.message });
  }
};

module.exports = {
  sendMessage,
  getProjectMessages
};
