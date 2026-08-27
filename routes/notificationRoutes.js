const express = require('express');
const router = express.Router();
const {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification
} = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

// Protect all notification endpoints
router.use(protect);

// GET /api/notifications
router.get('/', getUserNotifications);

// PUT /api/notifications/read-all
router.put('/read-all', markAllAsRead);

// PUT /api/notifications/:id/read
router.put('/:id/read', markAsRead);

// DELETE /api/notifications/:id
router.delete('/:id', deleteNotification);

module.exports = router;
