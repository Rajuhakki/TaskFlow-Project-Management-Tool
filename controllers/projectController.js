const Project = require('../models/Project');
const Task = require('../models/Task');
const User = require('../models/User');
const mongoose = require('mongoose');
const { isProjectMember, getMemberRole } = require('../middleware/roleMiddleware');

// Helper to populate project member user details
const populateProjectQuery = (query) => {
  return query
    .populate('createdBy', 'name email')
    .populate('members.user', 'name email');
};

// @desc    Create a new project (Logged-in user becomes Admin)
// @route   POST /api/projects
// @access  Private
const createProject = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Please provide a project name' });
    }

    const userId = req.user._id;

    // Create project with logged-in user as creator and initial Admin member
    const project = await Project.create({
      name,
      description: description || '',
      createdBy: userId,
      members: [
        {
          user: userId,
          role: 'admin'
        }
      ]
    });

    const populatedProject = await populateProjectQuery(Project.findById(project._id));

    return res.status(201).json({
      success: true,
      message: 'Project created successfully',
      project: populatedProject
    });
  } catch (error) {
    console.error('Create project error:', error);
    return res.status(500).json({ message: 'Server error creating project', error: error.message });
  }
};

// @desc    Get all projects where current user is a member
// @route   GET /api/projects
// @access  Private
const getUserProjects = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find all projects where user is in members.user array
    const projects = await populateProjectQuery(
      Project.find({ 'members.user': userId }).sort({ createdAt: -1 })
    );

    return res.status(200).json({
      success: true,
      count: projects.length,
      projects
    });
  } catch (error) {
    console.error('Get user projects error:', error);
    return res.status(500).json({ message: 'Server error fetching projects', error: error.message });
  }
};

// @desc    Get a single project by ID (Members only)
// @route   GET /api/projects/:id
// @access  Private
const getProjectById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid project ID format' });
    }

    const project = await populateProjectQuery(Project.findById(id));
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Access check: verify if current user is in project members
    if (!isProjectMember(project, req.user._id)) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this project' });
    }

    return res.status(200).json({
      success: true,
      userRole: getMemberRole(project, req.user._id),
      project
    });
  } catch (error) {
    console.error('Get single project error:', error);
    return res.status(500).json({ message: 'Server error fetching project', error: error.message });
  }
};

// @desc    Add member to project (Admin only)
// @route   PUT /api/projects/:id/add-member
// @access  Private (Admin)
const addMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, email, role } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid project ID format' });
    }

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Security check: Only project Admin can add members
    const callerRole = getMemberRole(project, req.user._id);
    if (callerRole !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required to add members' });
    }

    // Resolve target user by userId or email
    let targetUser;
    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Invalid user ID format' });
      }
      targetUser = await User.findById(userId);
    } else if (email) {
      targetUser = await User.findOne({ email: email.toLowerCase() });
    } else {
      return res.status(400).json({ message: 'Please provide userId or email of member to add' });
    }

    if (!targetUser) {
      return res.status(404).json({ message: 'User to add not found' });
    }

    // Check if user is already a member
    if (isProjectMember(project, targetUser._id)) {
      return res.status(400).json({ message: 'User is already a member of this project' });
    }

    const assignedRole = role && ['admin', 'member'].includes(role) ? role : 'member';

    // Add member object with role
    project.members.push({
      user: targetUser._id,
      role: assignedRole
    });
    await project.save();

    const updatedProject = await populateProjectQuery(Project.findById(id));

    return res.status(200).json({
      success: true,
      message: `Member added successfully as ${assignedRole}`,
      project: updatedProject
    });
  } catch (error) {
    console.error('Add member error:', error);
    return res.status(500).json({ message: 'Server error adding member', error: error.message });
  }
};

// @desc    Remove member from project (Admin only)
// @route   DELETE /api/projects/:id/members/:userId
// @access  Private (Admin)
const removeMember = async (req, res) => {
  try {
    const { id, userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid project ID or user ID format' });
    }

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Security check: Only project Admin can remove members
    const callerRole = getMemberRole(project, req.user._id);
    if (callerRole !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required to remove members' });
    }

    // Prevent removing creator
    if (userId.toString() === project.createdBy.toString()) {
      return res.status(400).json({ message: 'Cannot remove the project creator from project members' });
    }

    // Remove member from array
    project.members = project.members.filter(
      (m) => (m.user ? m.user.toString() : m.toString()) !== userId.toString()
    );
    await project.save();

    const updatedProject = await populateProjectQuery(Project.findById(id));

    return res.status(200).json({
      success: true,
      message: 'Member removed successfully',
      project: updatedProject
    });
  } catch (error) {
    console.error('Remove member error:', error);
    return res.status(500).json({ message: 'Server error removing member', error: error.message });
  }
};

// @desc    Update member role in project (Admin only)
// @route   PUT /api/projects/:id/members/:userId/role
// @access  Private (Admin)
const updateMemberRole = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const { role } = req.body;

    if (!role || !['admin', 'member'].includes(role)) {
      return res.status(400).json({ message: 'Role must be either admin or member' });
    }

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid project ID or user ID format' });
    }

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Security check: Only project Admin can update roles
    const callerRole = getMemberRole(project, req.user._id);
    if (callerRole !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required to update roles' });
    }

    const memberObj = project.members.find(
      (m) => (m.user ? m.user.toString() : m.toString()) === userId.toString()
    );

    if (!memberObj) {
      return res.status(404).json({ message: 'User is not a member of this project' });
    }

    memberObj.role = role;
    await project.save();

    const updatedProject = await populateProjectQuery(Project.findById(id));

    return res.status(200).json({
      success: true,
      message: `Member role updated to ${role}`,
      project: updatedProject
    });
  } catch (error) {
    console.error('Update member role error:', error);
    return res.status(500).json({ message: 'Server error updating member role', error: error.message });
  }
};

// @desc    Delete project (Admin only)
// @route   DELETE /api/projects/:id
// @access  Private (Admin)
const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid project ID format' });
    }

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Security check: Only project Admin can delete project
    const callerRole = getMemberRole(project, req.user._id);
    if (callerRole !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required to delete project' });
    }

    // Delete project and associated tasks
    await Task.deleteMany({ project: id });
    await Project.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Project and all associated tasks deleted successfully',
      projectId: id
    });
  } catch (error) {
    console.error('Delete project error:', error);
    return res.status(500).json({ message: 'Server error deleting project', error: error.message });
  }
};

module.exports = {
  createProject,
  getUserProjects,
  getProjectById,
  addMember,
  removeMember,
  updateMemberRole,
  deleteProject
};
