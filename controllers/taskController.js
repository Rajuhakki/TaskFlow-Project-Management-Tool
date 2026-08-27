const Task = require('../models/Task');
const Project = require('../models/Project');
const User = require('../models/User');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');
const { isProjectMember, getMemberRole, canUserEditTask } = require('../middleware/roleMiddleware');

// Helper function to check if user is a member of project
const checkProjectMembership = (project, userId) => {
  return isProjectMember(project, userId);
};

// @desc    Create a new task
// @route   POST /api/tasks
// @access  Private
const createTask = async (req, res) => {
  try {
    const { title, description, projectId, project: projParam, assignedTo, status } = req.body;
    const targetProjectId = projectId || projParam;

    if (!title || title.trim() === '') {
      return res.status(400).json({ message: 'Please provide a task title' });
    }

    if (!targetProjectId || !mongoose.Types.ObjectId.isValid(targetProjectId)) {
      return res.status(400).json({ message: 'Please provide a valid project ID' });
    }

    // Verify project existence and membership
    const project = await Project.findById(targetProjectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (!checkProjectMembership(project, req.user._id)) {
      return res.status(403).json({ message: 'Access denied. Only project members can create tasks' });
    }

    // Validate assignedTo user if provided (Only Admin can assign during creation)
    let assignedUserId = null;
    if (assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)) {
      const callerRole = getMemberRole(project, req.user._id);
      if (callerRole !== 'admin') {
        return res.status(403).json({ message: 'Access denied. Only project Admins can assign tasks' });
      }
      assignedUserId = assignedTo;
    }

    const task = await Task.create({
      title,
      description: description || '',
      project: targetProjectId,
      assignedTo: assignedUserId,
      status: status || 'todo'
    });

    // Notification Trigger: Notify assigned user if different from creator
    if (assignedUserId && assignedUserId.toString() !== req.user._id.toString()) {
      await Notification.create({
        user: assignedUserId,
        sender: req.user._id,
        type: 'task_assigned',
        message: `You have been assigned a new task: "${task.title}"`
      }).catch(err => console.error('Notification creation error:', err));
    }

    const populatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email')
      .populate('project', 'name');

    // Real-Time Socket Emissions
    const io = req.app.get('io');
    if (io) {
      if (assignedUserId && assignedUserId.toString() !== req.user._id.toString()) {
        io.to(`user:${assignedUserId}`).emit('task_assigned', {
          task: populatedTask,
          message: `You have been assigned a new task: "${task.title}"`
        });
      }
      io.to(`project:${targetProjectId}`).emit('task_updated', {
        action: 'create',
        task: populatedTask,
        projectId: targetProjectId
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Task created successfully',
      task: populatedTask
    });
  } catch (error) {
    console.error('Create task error:', error);
    return res.status(500).json({ message: 'Server error creating task', error: error.message });
  }
};

// @desc    Get all tasks for a project
// @route   GET /api/tasks/:projectId
// @access  Private
const getTasksByProject = async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ message: 'Invalid project ID format' });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Membership check
    if (!checkProjectMembership(project, req.user._id)) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this project' });
    }

    const tasks = await Task.find({ project: projectId })
      .populate('assignedTo', 'name email')
      .populate('project', 'name')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: tasks.length,
      tasks
    });
  } catch (error) {
    console.error('Get tasks by project error:', error);
    return res.status(500).json({ message: 'Server error fetching tasks', error: error.message });
  }
};

// @desc    Get tasks assigned to current user
// @route   GET /api/tasks/my-tasks
// @access  Private
const getMyTasks = async (req, res) => {
  try {
    const userId = req.user._id;

    const tasks = await Task.find({ assignedTo: userId })
      .populate('assignedTo', 'name email')
      .populate('project', 'name')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: tasks.length,
      tasks
    });
  } catch (error) {
    console.error('Get my tasks error:', error);
    return res.status(500).json({ message: 'Server error fetching your tasks', error: error.message });
  }
};

// @desc    Get a single task by ID
// @route   GET /api/tasks/single/:id
// @access  Private
const getTaskById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid task ID format' });
    }

    const task = await Task.findById(id)
      .populate('assignedTo', 'name email')
      .populate('project', 'name');

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const project = await Project.findById(task.project);
    if (!project || !checkProjectMembership(project, req.user._id)) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this project' });
    }

    return res.status(200).json({
      success: true,
      task
    });
  } catch (error) {
    console.error('Get single task error:', error);
    return res.status(500).json({ message: 'Server error fetching task', error: error.message });
  }
};

// @desc    Assign / Reassign task to a project member (Admin only)
// @route   PUT /api/tasks/:id/assign
// @access  Private (Admin)
const assignTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, email, unassign } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid task ID format' });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const project = await Project.findById(task.project);
    if (!project) {
      return res.status(404).json({ message: 'Associated project not found' });
    }

    // Security check: Only project Admins can assign tasks
    const callerRole = getMemberRole(project, req.user._id);
    if (callerRole !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required to assign tasks' });
    }

    if (unassign) {
      task.assignedTo = null;
      await task.save();
      const updatedTask = await Task.findById(id)
        .populate('assignedTo', 'name email')
        .populate('project', 'name');
      return res.status(200).json({
        success: true,
        message: 'Task unassigned successfully',
        task: updatedTask
      });
    }

    let targetUser = null;
    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Invalid user ID format' });
      }
      targetUser = await User.findById(userId);
    } else if (email) {
      targetUser = await User.findOne({ email: email.toLowerCase() });
    } else {
      return res.status(400).json({ message: 'Please provide userId or email to assign task' });
    }

    if (!targetUser) {
      return res.status(404).json({ message: 'User to assign not found' });
    }

    // Validate that target user is a member of the project
    if (!checkProjectMembership(project, targetUser._id)) {
      return res.status(400).json({ message: 'Target user is not a member of this project' });
    }

    task.assignedTo = targetUser._id;
    await task.save();

    // Notification Trigger: Notify assigned user if different from assigner
    if (targetUser._id.toString() !== req.user._id.toString()) {
      await Notification.create({
        user: targetUser._id,
        sender: req.user._id,
        type: 'task_assigned',
        message: `You have been assigned a new task: "${task.title}"`
      }).catch(err => console.error('Notification creation error:', err));
    }

    const updatedTask = await Task.findById(id)
      .populate('assignedTo', 'name email')
      .populate('project', 'name');

    // Real-Time Socket Emissions
    const io = req.app.get('io');
    if (io) {
      if (targetUser && targetUser._id.toString() !== req.user._id.toString()) {
        io.to(`user:${targetUser._id}`).emit('task_assigned', {
          task: updatedTask,
          message: `You have been assigned a new task: "${task.title}"`
        });
      }
      io.to(`project:${task.project}`).emit('task_updated', {
        action: 'assign',
        task: updatedTask,
        projectId: task.project
      });
    }

    return res.status(200).json({
      success: true,
      message: `Task assigned successfully to ${targetUser.name}`,
      task: updatedTask
    });
  } catch (error) {
    console.error('Assign task error:', error);
    return res.status(500).json({ message: 'Server error assigning task', error: error.message });
  }
};

// @desc    Update task details (Admin OR assigned user)
// @route   PUT /api/tasks/:id
// @access  Private
const updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, assignedTo } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid task ID format' });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Verify project membership
    const project = await Project.findById(task.project);
    if (!project || !checkProjectMembership(project, req.user._id)) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this project' });
    }

    // Access Control Check: Admin OR Assigned User only
    if (!canUserEditTask(task, project, req.user._id)) {
      return res.status(403).json({ message: 'Access denied. You can only edit tasks assigned to you' });
    }

    // Only Admin can change task assignment via updateTask
    if (assignedTo !== undefined && assignedTo !== (task.assignedTo ? task.assignedTo.toString() : null)) {
      const callerRole = getMemberRole(project, req.user._id);
      if (callerRole !== 'admin') {
        return res.status(403).json({ message: 'Access denied. Only project Admins can assign or reassign tasks' });
      }
      task.assignedTo = assignedTo && mongoose.Types.ObjectId.isValid(assignedTo) ? assignedTo : null;
    }

    // Validate status if provided
    if (status && !['todo', 'in-progress', 'done'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value. Must be todo, in-progress, or done' });
    }

    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;
    if (status !== undefined) task.status = status;

    await task.save();

    const updatedTask = await Task.findById(id)
      .populate('assignedTo', 'name email')
      .populate('project', 'name');

    // Real-Time Socket Emission
    const io = req.app.get('io');
    if (io) {
      io.to(`project:${task.project}`).emit('task_updated', {
        action: 'update',
        task: updatedTask,
        projectId: task.project
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Task updated successfully',
      task: updatedTask
    });
  } catch (error) {
    console.error('Update task error:', error);
    return res.status(500).json({ message: 'Server error updating task', error: error.message });
  }
};

// @desc    Delete a task (Admin only)
// @route   DELETE /api/tasks/:id
// @access  Private (Admin)
const deleteTask = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid task ID format' });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Verify project membership
    const project = await Project.findById(task.project);
    if (!project || !checkProjectMembership(project, req.user._id)) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this project' });
    }

    // Security check: Only project Admins can delete tasks
    const callerRole = getMemberRole(project, req.user._id);
    if (callerRole !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Only project Admins can delete tasks' });
    }

    const targetProjectId = task.project;
    await Task.findByIdAndDelete(id);

    // Real-Time Socket Emission for Task Deletion
    const io = req.app.get('io');
    if (io) {
      io.to(`project:${targetProjectId}`).emit('task_updated', {
        action: 'delete',
        taskId: id,
        projectId: targetProjectId
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Task deleted successfully',
      taskId: id
    });
  } catch (error) {
    console.error('Delete task error:', error);
    return res.status(500).json({ message: 'Server error deleting task', error: error.message });
  }
};

// @desc    Update task status (Admin OR assigned user)
// @route   PUT /api/tasks/:id/status
// @access  Private
const updateTaskStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['todo', 'in-progress', 'done'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value. Must be todo, in-progress, or done' });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid task ID format' });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const project = await Project.findById(task.project);
    if (!project || !checkProjectMembership(project, req.user._id)) {
      return res.status(403).json({ message: 'Access denied. Only project members can update task status' });
    }

    // Access Control Check: Admin OR Assigned User only
    if (!canUserEditTask(task, project, req.user._id)) {
      return res.status(403).json({ message: 'Access denied. You can only update status of tasks assigned to you' });
    }

    task.status = status;
    await task.save();

    const updatedTask = await Task.findById(id)
      .populate('assignedTo', 'name email')
      .populate('project', 'name');

    // Real-Time Socket Emission for Task Status Update
    const io = req.app.get('io');
    if (io) {
      io.to(`project:${task.project}`).emit('task_updated', {
        action: 'status_update',
        task: updatedTask,
        projectId: task.project
      });
    }

    return res.status(200).json({
      success: true,
      message: `Task status updated to ${status}`,
      task: updatedTask
    });
  } catch (error) {
    console.error('Update status error:', error);
    return res.status(500).json({ message: 'Server error updating task status', error: error.message });
  }
};

// @desc    Get tasks for a project filtered by status
// @route   GET /api/tasks/:projectId/status/:status
// @access  Private
const getTasksByStatus = async (req, res) => {
  try {
    const { projectId, status } = req.params;

    if (!['todo', 'in-progress', 'done'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value. Must be todo, in-progress, or done' });
    }

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ message: 'Invalid project ID format' });
    }

    const project = await Project.findById(projectId);
    if (!project || !checkProjectMembership(project, req.user._id)) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this project' });
    }

    const tasks = await Task.find({ project: projectId, status })
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      status,
      count: tasks.length,
      tasks
    });
  } catch (error) {
    console.error('Get tasks by status error:', error);
    return res.status(500).json({ message: 'Server error fetching tasks by status', error: error.message });
  }
};

// @desc    Get task count summary for a project
// @route   GET /api/tasks/:projectId/counts
// @access  Private
const getTaskCounts = async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ message: 'Invalid project ID format' });
    }

    const project = await Project.findById(projectId);
    if (!project || !checkProjectMembership(project, req.user._id)) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this project' });
    }

    const totalTasks = await Task.countDocuments({ project: projectId });
    const todoCount = await Task.countDocuments({ project: projectId, status: 'todo' });
    const inProgressCount = await Task.countDocuments({ project: projectId, status: 'in-progress' });
    const doneCount = await Task.countDocuments({ project: projectId, status: 'done' });

    return res.status(200).json({
      success: true,
      counts: {
        total: totalTasks,
        todo: todoCount,
        inProgress: inProgressCount,
        done: doneCount
      }
    });
  } catch (error) {
    console.error('Get task counts error:', error);
    return res.status(500).json({ message: 'Server error fetching task counts', error: error.message });
  }
};

module.exports = {
  createTask,
  getTasksByProject,
  getMyTasks,
  getTaskById,
  assignTask,
  updateTask,
  deleteTask,
  updateTaskStatus,
  getTasksByStatus,
  getTaskCounts
};
