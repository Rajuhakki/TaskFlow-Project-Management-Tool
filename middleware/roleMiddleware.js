const Project = require('../models/Project');
const Task = require('../models/Task');
const mongoose = require('mongoose');

// Helper function to check if a user is a member of a project
const isProjectMember = (project, userId) => {
  if (!project || !project.members || !userId) return false;
  return project.members.some((m) => {
    if (!m) return false;
    const memberId = m.user ? (m.user._id || m.user) : (m._id || m);
    return memberId.toString() === userId.toString();
  });
};

// Helper function to get member role in a project
const getMemberRole = (project, userId) => {
  if (!project || !userId) return null;

  // Project creator is always an admin
  const creatorId = project.createdBy ? (project.createdBy._id || project.createdBy) : null;
  if (creatorId && creatorId.toString() === userId.toString()) {
    return 'admin';
  }

  if (!project.members) return null;

  const memberObj = project.members.find((m) => {
    if (!m) return false;
    const memberId = m.user ? (m.user._id || m.user) : (m._id || m);
    return memberId.toString() === userId.toString();
  });

  if (!memberObj) return null;
  return typeof memberObj === 'object' && memberObj.role ? memberObj.role : 'member';
};

// Helper function to check if a user can edit/update a specific task
const canUserEditTask = (task, project, userId) => {
  if (!task || !project || !userId) return false;

  // Must be a project member
  if (!isProjectMember(project, userId)) return false;

  // Admin has full access to edit any task
  const role = getMemberRole(project, userId);
  if (role === 'admin') return true;

  // Member can ONLY edit task if assigned to them
  if (task.assignedTo && (task.assignedTo._id || task.assignedTo).toString() === userId.toString()) {
    return true;
  }

  return false;
};

// Middleware to authorize Admin role for project actions
const authorizeAdmin = async (req, res, next) => {
  try {
    let projectId = req.params.id || req.params.projectId || req.body.projectId || req.body.project;

    // Handle case where param is taskId (e.g. PUT /api/tasks/:id/assign)
    if (!projectId && req.params.id && mongoose.Types.ObjectId.isValid(req.params.id)) {
      const task = await Task.findById(req.params.id);
      if (task) {
        projectId = task.project;
      }
    }

    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ message: 'Valid project ID is required for role authorization' });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Security Check: Verify user is a project member
    if (!isProjectMember(project, req.user._id)) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this project' });
    }

    // Role Check: Verify user has Admin role in project
    const role = getMemberRole(project, req.user._id);
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Only project Admins can perform this action' });
    }

    req.project = project;
    next();
  } catch (error) {
    console.error('Role authorization error:', error);
    return res.status(500).json({ message: 'Server error authorizing role', error: error.message });
  }
};

module.exports = {
  isProjectMember,
  getMemberRole,
  canUserEditTask,
  authorizeAdmin
};
