const express = require('express');
const router = express.Router();
const {
  getDashboardData,
  getProjectStats
} = require('../controllers/dashboardController');
const { protect } = require('../middleware/authMiddleware');

// Protect all dashboard routes with JWT middleware
router.use(protect);

// GET /api/dashboard
router.get('/', getDashboardData);

// GET /api/dashboard/project/:id
router.get('/project/:id', getProjectStats);

module.exports = router;
