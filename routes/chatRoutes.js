const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { sendChatMessage, getChatMessages } = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    let ext = path.extname(file.originalname);
    if (!ext) {
      if (file.mimetype.includes('audio')) ext = '.webm';
      else if (file.mimetype.includes('image')) ext = '.png';
      else ext = '.bin';
    }
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max file upload size
});

const uploadFields = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'audio', maxCount: 1 }
]);

// Apply JWT Protection
router.use(protect);

// POST /api/chat/:projectId & GET /api/chat/:projectId
router.post('/:projectId', uploadFields, sendChatMessage);
router.get('/:projectId', getChatMessages);

module.exports = router;
