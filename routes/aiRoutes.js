const express = require('express');
const router = express.Router();
const { generateTaskSummary } = require('../controllers/aiController');
const { protect } = require('../middleware/authMiddleware');

// Protect all AI endpoints
router.use(protect);

// POST /api/tasks/:id/summary & POST /api/ai/tasks/:id/summary
router.post('/tasks/:id/summary', generateTaskSummary);
router.post('/:id/summary', generateTaskSummary);

module.exports = router;
