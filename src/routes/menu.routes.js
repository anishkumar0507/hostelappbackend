import express from 'express';
import {
  createMenu,
  getMenus,
  getMenuById,
  updateMenu,
  deleteMenu,
  voteOnMenu,
  getMenuStats,
  getMyVote,
  getTodayMenu,
  addReview,
  getReviews,
  publishMenu,
} from '../controllers/menu.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(protect);

// Get today's menu
router.get('/today', getTodayMenu);

// Warden - Create new menu
router.post('/', createMenu);

// Get all menus (with filters)
router.get('/', getMenus);

// Get single menu with stats
router.get('/:id', getMenuById);

// Get menu statistics for a specific meal
router.get('/:id/stats', getMenuStats);

// Student - Get their own vote for a meal
router.get('/:id/my-vote', getMyVote);

// Student - Vote on menu meal
router.post('/:id/vote', voteOnMenu);

// Student - Add review for a meal
router.post('/:id/review', addReview);

// Get reviews for a menu meal
router.get('/:id/reviews', getReviews);

// Warden - Publish menu
router.post('/:id/publish', publishMenu);

// Warden - Update menu
router.put('/:id', updateMenu);

// Warden - Delete menu
router.delete('/:id', deleteMenu);

export default router;
