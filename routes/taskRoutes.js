const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/taskController');
const { generateTaskSummary } = require('../controllers/aiController');
const { protect } = require('../middleware/authMiddleware');

// Protect all task endpoints with JWT middleware
router.use(protect);

// POST /api/tasks
router.post('/', createTask);

// GET /api/tasks/my-tasks (Must be defined before /:projectId)
router.get('/my-tasks', getMyTasks);

// GET /api/tasks/single/:id
router.get('/single/:id', getTaskById);

// POST /api/tasks/:id/summary (AI Task Summary)
router.post('/:id/summary', generateTaskSummary);

// PUT /api/tasks/:id/status
router.put('/:id/status', updateTaskStatus);

// PUT /api/tasks/:id/assign
router.put('/:id/assign', assignTask);

// GET /api/tasks/:projectId/counts
router.get('/:projectId/counts', getTaskCounts);

// GET /api/tasks/:projectId/status/:status
router.get('/:projectId/status/:status', getTasksByStatus);

// GET /api/tasks/:projectId
router.get('/:projectId', getTasksByProject);

// PUT /api/tasks/:id & DELETE /api/tasks/:id
router.route('/:id')
  .put(updateTask)
  .delete(deleteTask);

module.exports = router;
