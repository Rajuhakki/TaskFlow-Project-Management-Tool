const express = require('express');
const router = express.Router();
const {
  createProject,
  getUserProjects,
  getProjectById,
  addMember,
  removeMember,
  updateMemberRole,
  deleteProject
} = require('../controllers/projectController');
const { protect } = require('../middleware/authMiddleware');
const { authorizeAdmin } = require('../middleware/roleMiddleware');

// Apply JWT protection middleware to all project endpoints
router.use(protect);

// POST /api/projects & GET /api/projects
router.route('/')
  .post(createProject)
  .get(getUserProjects);

// GET /api/projects/:id & DELETE /api/projects/:id
router.route('/:id')
  .get(getProjectById)
  .delete(authorizeAdmin, deleteProject);

// PUT /api/projects/:id/add-member (Admin only)
router.put('/:id/add-member', authorizeAdmin, addMember);

// DELETE /api/projects/:id/members/:userId & PUT /api/projects/:id/remove-member (Admin only)
router.delete('/:id/members/:userId', authorizeAdmin, removeMember);
router.put('/:id/remove-member', authorizeAdmin, removeMember);

// PUT /api/projects/:id/members/:userId/role (Admin only)
router.put('/:id/members/:userId/role', authorizeAdmin, updateMemberRole);

module.exports = router;
