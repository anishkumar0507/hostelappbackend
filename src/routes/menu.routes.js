import express from 'express';
import {
  getPolls,
  getMenuFeedback,
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
  getVotingDetails,
  getMenuDetails,
} from '../controllers/menu.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';
import {
  createPoll,
  getPollDetails,
  votePoll,
  closePoll,
  deletePoll,
} from '../controllers/poll.controller.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(protect);

// Get today's menu
router.get('/today', getTodayMenu);

// Warden - Create new menu
router.post('/', createMenu);

// Get all menus (with filters)
router.get('/', getMenus);

// Poll routes (must be above '/:id' to avoid route conflicts)
router.get('/poll', getPolls);
router.post('/poll', authorize('warden'), createPoll);
router.get('/poll/:id/details', getPollDetails);
router.post('/poll/:id/vote', votePoll);
router.put('/poll/:id/close', authorize('warden'), closePoll);
router.delete('/poll/:id', authorize('warden'), deletePoll);

// Get menu feedback (likes/dislikes) - must be above '/:id'
router.get('/feedback/:id', getMenuFeedback);

// Get menu details with full stats (Warden only) - must be above '/:id'
router.get('/:id/details', authorize('warden'), getMenuDetails);

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

// Get voting details
router.get('/:id/voting-details', getVotingDetails);

// Get reviews for a menu meal
router.get('/:id/reviews', getReviews);

// Warden - Publish menu
router.post('/:id/publish', publishMenu);

// Warden - Update menu
router.put('/:id', updateMenu);

// Warden - Delete menu
router.delete('/:id', deleteMenu);

export default router;
