const express = require('express');
const router = express.Router();
const {
  sendMessage,
  getProjectMessages
} = require('../controllers/discussionController');
const { protect } = require('../middleware/authMiddleware');

// Protect all discussion endpoints
router.use(protect);

// POST /api/discussions/:projectId & GET /api/discussions/:projectId
router.route('/:projectId')
  .post(sendMessage)
  .get(getProjectMessages);

module.exports = router;
