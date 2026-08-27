const Notification = require('../models/Notification');
const mongoose = require('mongoose');

// @desc    Get all notifications for logged-in user
// @route   GET /api/notifications
// @access  Private
const getUserNotifications = async (req, res) => {
  try {
    const userId = req.user._id;

    const notifications = await Notification.find({ user: userId })
      .populate('sender', 'name email')
      .sort({ createdAt: -1 });

    const unreadCount = await Notification.countDocuments({ user: userId, isRead: false });

    return res.status(200).json({
      success: true,
      count: notifications.length,
      unreadCount,
      notifications
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    return res.status(500).json({ message: 'Server error fetching notifications', error: error.message });
  }
};

// @desc    Mark a notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid notification ID format' });
    }

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    // Ownership check
    if (notification.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    notification.isRead = true;
    await notification.save();

    const updatedNotification = await Notification.findById(id).populate('sender', 'name email');

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      notification: updatedNotification
    });
  } catch (error) {
    console.error('Mark notification error:', error);
    return res.status(500).json({ message: 'Server error updating notification', error: error.message });
  }
};

// @desc    Mark all notifications as read for logged-in user
// @route   PUT /api/notifications/read-all
// @access  Private
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    await Notification.updateMany({ user: userId, isRead: false }, { $set: { isRead: true } });

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Mark all as read error:', error);
    return res.status(500).json({ message: 'Server error updating notifications', error: error.message });
  }
};

// @desc    Delete a notification
// @route   DELETE /api/notifications/:id
// @access  Private
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid notification ID format' });
    }

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    // Ownership check
    if (notification.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await Notification.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Notification deleted successfully',
      notificationId: id
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    return res.status(500).json({ message: 'Server error deleting notification', error: error.message });
  }
};

module.exports = {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification
};
