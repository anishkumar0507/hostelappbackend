import express from 'express';
import {
  createPoll,
  getPolls,
  getPollDetails,
  votePoll,
  getVotingHistory,
  closePoll,
  deletePoll,
} from '../controllers/poll.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Voting history (for any authenticated user)
router.get('/menu/:id/voting-history', getVotingHistory);

// Public poll routes
router.get('/', getPolls);

// Warden only - create polls
router.post('/', authorize('warden'), createPoll);

// Warden only - get detailed voting results
router.get('/:id/details', getPollDetails);

// Student and warden - vote on poll
router.post('/:id/vote', votePoll);

// Warden only - close poll
router.put('/:id/close', authorize('warden'), closePoll);

// Warden only - delete poll
router.delete('/:id', authorize('warden'), deletePoll);

export default router;
