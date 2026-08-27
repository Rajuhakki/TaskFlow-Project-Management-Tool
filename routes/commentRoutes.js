const express = require('express');
const router = express.Router();
const {
  addComment,
  getTaskComments,
  deleteComment
} = require('../controllers/commentController');
const { protect } = require('../middleware/authMiddleware');

// Protect all comment routes with JWT middleware
router.use(protect);

// POST & GET /api/comments/:taskId
router.route('/:taskId')
  .post(addComment)
  .get(getTaskComments);

// DELETE /api/comments/:id
router.delete('/delete/:id', deleteComment);
router.delete('/:id', deleteComment);

module.exports = router;
