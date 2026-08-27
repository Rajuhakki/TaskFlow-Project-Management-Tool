const Comment = require('../models/Comment');
const Task = require('../models/Task');
const Project = require('../models/Project');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');
const { isProjectMember } = require('../middleware/roleMiddleware');

// Helper function to check project membership
const checkProjectMembership = (project, userId) => {
  return isProjectMember(project, userId);
};

// @desc    Add a comment to a task
// @route   POST /api/comments/:taskId
// @access  Private
const addComment = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { text } = req.body;

    if (!text || text.trim() === '') {
      return res.status(400).json({ message: 'Please provide comment text' });
    }

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ message: 'Invalid task ID format' });
    }

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const project = await Project.findById(task.project);
    if (!project || !checkProjectMembership(project, req.user._id)) {
      return res.status(403).json({ message: 'Access denied. Only project members can comment on tasks' });
    }

    const comment = await Comment.create({
      text: text.trim(),
      user: req.user._id,
      task: taskId
    });

    // Notification Trigger: Notify task assigned user or project owner
    let notifiedUsers = new Set();

    if (task.assignedTo && task.assignedTo.toString() !== req.user._id.toString()) {
      notifiedUsers.add(task.assignedTo.toString());
      await Notification.create({
        user: task.assignedTo,
        sender: req.user._id,
        type: 'comment_added',
        message: `New comment on your task: "${task.title}"`
      }).catch(err => console.error('Notification creation error:', err));
    }

    if (project.createdBy && project.createdBy.toString() !== req.user._id.toString() && !notifiedUsers.has(project.createdBy.toString())) {
      await Notification.create({
        user: project.createdBy,
        sender: req.user._id,
        type: 'comment_added',
        message: `New comment on task: "${task.title}"`
      }).catch(err => console.error('Notification creation error:', err));
    }

    const populatedComment = await Comment.findById(comment._id)
      .populate('user', 'name email');

    // Real-Time Socket Emission for New Comment
    const io = req.app.get('io');
    if (io) {
      io.to(`project:${task.project}`).emit('new_comment', {
        comment: populatedComment,
        taskId,
        projectId: task.project
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      comment: populatedComment
    });
  } catch (error) {
    console.error('Add comment error:', error);
    return res.status(500).json({ message: 'Server error adding comment', error: error.message });
  }
};

// @desc    Get all comments for a task (newest first)
// @route   GET /api/comments/:taskId
// @access  Private
const getTaskComments = async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ message: 'Invalid task ID format' });
    }

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const project = await Project.findById(task.project);
    if (!project || !checkProjectMembership(project, req.user._id)) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this project' });
    }

    const comments = await Comment.find({ task: taskId })
      .populate('user', 'name email')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: comments.length,
      comments
    });
  } catch (error) {
    console.error('Get comments error:', error);
    return res.status(500).json({ message: 'Server error fetching comments', error: error.message });
  }
};

// @desc    Delete a comment (Comment author only)
// @route   DELETE /api/comments/:id
// @access  Private
const deleteComment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid comment ID format' });
    }

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Security check: Only comment owner can delete
    if (comment.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Forbidden. Only the comment author can delete this comment' });
    }

    await Comment.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Comment deleted successfully',
      commentId: id
    });
  } catch (error) {
    console.error('Delete comment error:', error);
    return res.status(500).json({ message: 'Server error deleting comment', error: error.message });
  }
};

module.exports = {
  addComment,
  getTaskComments,
  deleteComment
};
