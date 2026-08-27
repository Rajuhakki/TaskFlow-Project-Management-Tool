const Message = require('../models/Message');
const Project = require('../models/Project');
const mongoose = require('mongoose');
const { isProjectMember } = require('../middleware/roleMiddleware');

// @desc    Send a chat message (text, file attachment, or audio voice note)
// @route   POST /api/chat/:projectId
// @access  Private
const sendChatMessage = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { text } = req.body;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ message: 'Invalid project ID format' });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Security Check: Only project members can send chat messages
    if (!isProjectMember(project, req.user._id)) {
      return res.status(403).json({ message: 'Access denied. Only project members can send chat messages' });
    }

    let fileUrl = '';
    let audioUrl = '';

    // Handle Multer uploaded files (file or audio)
    if (req.files) {
      if (req.files['file'] && req.files['file'][0]) {
        fileUrl = `/uploads/${req.files['file'][0].filename}`;
      }
      if (req.files['audio'] && req.files['audio'][0]) {
        audioUrl = `/uploads/${req.files['audio'][0].filename}`;
      }
    } else if (req.file) {
      // Fallback single file upload handling
      fileUrl = `/uploads/${req.file.filename}`;
    }

    // Also support JSON body file/audio URLs if provided directly
    if (!fileUrl && req.body.file) fileUrl = req.body.file;
    if (!audioUrl && req.body.audio) audioUrl = req.body.audio;

    const trimmedText = text ? text.trim() : '';

    if (!trimmedText && !fileUrl && !audioUrl) {
      return res.status(400).json({ message: 'Please provide message text, file attachment, or voice note' });
    }

    const messageDoc = await Message.create({
      project: projectId,
      user: req.user._id,
      text: trimmedText,
      file: fileUrl,
      audio: audioUrl
    });

    const populatedMessage = await Message.findById(messageDoc._id)
      .populate('user', 'name email');

    // Real-Time Socket Emission
    const io = req.app.get('io');
    if (io) {
      io.to(`project:${projectId}`).emit('receive_message', {
        message: populatedMessage,
        projectId
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      chatMessage: populatedMessage
    });
  } catch (error) {
    console.error('Send chat message error:', error);
    return res.status(500).json({ message: 'Server error sending message', error: error.message });
  }
};

// @desc    Get all chat messages for a project
// @route   GET /api/chat/:projectId
// @access  Private
const getChatMessages = async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ message: 'Invalid project ID format' });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Security Check: Only project members can view chat history
    if (!isProjectMember(project, req.user._id)) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this project' });
    }

    const messages = await Message.find({ project: projectId })
      .populate('user', 'name email')
      .sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      count: messages.length,
      messages
    });
  } catch (error) {
    console.error('Get chat messages error:', error);
    return res.status(500).json({ message: 'Server error fetching chat messages', error: error.message });
  }
};

module.exports = {
  sendChatMessage,
  getChatMessages
};
