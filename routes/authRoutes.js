const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Register API: POST /api/auth/register
router.post('/register', registerUser);

// Login API: POST /api/auth/login
router.post('/login', loginUser);

// Protected API: GET /api/auth/me
router.get('/me', protect, getMe);

module.exports = router;
