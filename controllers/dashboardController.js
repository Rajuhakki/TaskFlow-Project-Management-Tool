const Project = require('../models/Project');
const Task = require('../models/Task');
const mongoose = require('mongoose');
const { isProjectMember } = require('../middleware/roleMiddleware');

// Helper function to check project membership
const checkProjectMembership = (project, userId) => {
  return isProjectMember(project, userId);
};

// @desc    Get dashboard summary data for logged-in user
// @route   GET /api/dashboard
// @access  Private
const getDashboardData = async (req, res) => {
  try {
    const userId = req.user._id;

    // 1. Get all projects where user is in members.user array
    const userProjects = await Project.find({ 'members.user': userId }).select('_id name');
    const projectIds = userProjects.map((p) => p._id);
    const totalProjects = userProjects.length;

    if (projectIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          totalProjects: 0,
          totalTasks: 0,
          completedTasks: 0,
          pendingTasks: 0,
          myTasksCount: 0,
          completionPercentage: 0,
          statusBreakdown: {
            todo: 0,
            inProgress: 0,
            done: 0
          }
        }
      });
    }

    // 2. MongoDB Aggregation Pipeline on Task Collection
    const aggregationResult = await Task.aggregate([
      {
        $match: {
          project: { $in: projectIds }
        }
      },
      {
        $facet: {
          totalTasksCount: [
            { $count: 'count' }
          ],
          statusCounts: [
            {
              $group: {
                _id: '$status',
                count: { $sum: 1 }
              }
            }
          ],
          myTasksCount: [
            {
              $match: {
                assignedTo: new mongoose.Types.ObjectId(userId)
              }
            },
            { $count: 'count' }
          ]
        }
      }
    ]);

    const facet = aggregationResult[0] || {};

    const totalTasks = facet.totalTasksCount && facet.totalTasksCount[0] ? facet.totalTasksCount[0].count : 0;
    const myTasksCount = facet.myTasksCount && facet.myTasksCount[0] ? facet.myTasksCount[0].count : 0;

    const statusCounts = facet.statusCounts || [];
    const todoCount = (statusCounts.find((s) => s._id === 'todo') || {}).count || 0;
    const inProgressCount = (statusCounts.find((s) => s._id === 'in-progress') || {}).count || 0;
    const doneCount = (statusCounts.find((s) => s._id === 'done') || {}).count || 0;

    const completedTasks = doneCount;
    const pendingTasks = todoCount + inProgressCount;
    const completionPercentage = totalTasks > 0 ? parseFloat(((doneCount / totalTasks) * 100).toFixed(1)) : 0;

    return res.status(200).json({
      success: true,
      data: {
        totalProjects,
        totalTasks,
        completedTasks,
        pendingTasks,
        myTasksCount,
        completionPercentage,
        statusBreakdown: {
          todo: todoCount,
          inProgress: inProgressCount,
          done: doneCount
        }
      }
    });
  } catch (error) {
    console.error('Get dashboard data error:', error);
    return res.status(500).json({ message: 'Server error fetching dashboard analytics', error: error.message });
  }
};

// @desc    Get project-wise analytics stats
// @route   GET /api/dashboard/project/:id
// @access  Private
const getProjectStats = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid project ID format' });
    }

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Security check: Only project members can view project analytics
    if (!checkProjectMembership(project, req.user._id)) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this project' });
    }

    const projectObjectId = new mongoose.Types.ObjectId(id);

    // MongoDB Aggregation for single project stats
    const aggregationResult = await Task.aggregate([
      {
        $match: {
          project: projectObjectId
        }
      },
      {
        $facet: {
          totalTasksCount: [
            { $count: 'count' }
          ],
          statusCounts: [
            {
              $group: {
                _id: '$status',
                count: { $sum: 1 }
              }
            }
          ],
          myTasksCount: [
            {
              $match: {
                assignedTo: new mongoose.Types.ObjectId(req.user._id)
              }
            },
            { $count: 'count' }
          ]
        }
      }
    ]);

    const facet = aggregationResult[0] || {};

    const totalTasks = facet.totalTasksCount && facet.totalTasksCount[0] ? facet.totalTasksCount[0].count : 0;
    const myTasksCount = facet.myTasksCount && facet.myTasksCount[0] ? facet.myTasksCount[0].count : 0;

    const statusCounts = facet.statusCounts || [];
    const todoCount = (statusCounts.find((s) => s._id === 'todo') || {}).count || 0;
    const inProgressCount = (statusCounts.find((s) => s._id === 'in-progress') || {}).count || 0;
    const doneCount = (statusCounts.find((s) => s._id === 'done') || {}).count || 0;

    const completedTasks = doneCount;
    const pendingTasks = todoCount + inProgressCount;
    const completionPercentage = totalTasks > 0 ? parseFloat(((doneCount / totalTasks) * 100).toFixed(1)) : 0;

    return res.status(200).json({
      success: true,
      project: {
        _id: project._id,
        name: project.name,
        membersCount: project.members.length
      },
      stats: {
        totalTasks,
        completedTasks,
        pendingTasks,
        myTasksCount,
        completionPercentage,
        statusBreakdown: {
          todo: todoCount,
          inProgress: inProgressCount,
          done: doneCount
        }
      }
    });
  } catch (error) {
    console.error('Get project stats error:', error);
    return res.status(500).json({ message: 'Server error fetching project stats', error: error.message });
  }
};

module.exports = {
  getDashboardData,
  getProjectStats
};
