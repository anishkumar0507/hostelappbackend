import express from 'express';
import {
  getAllParents,
  updateParent,
  deleteParent,
  registerParent,
  getMyChild,
  getChildRoom,
  getChildFees,
  getChildEntryExit,
  getChildLeaves,
  getChildStatus,
  getChildLocation,
} from '../controllers/parent.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const router = express.Router();

router.use(protect);

/**
 * Warden: Register parent for a student
 */
router.get('/', authorize('warden'), getAllParents);
router.put('/:parentId', authorize('warden'), updateParent);
router.delete('/:parentId', authorize('warden'), deleteParent);
router.post('/register', authorize('warden'), registerParent);

/**
 * Parent: Get linked child info and various child data
 */
router.get('/child', authorize('parent'), getMyChild);
router.get('/child/room', authorize('parent'), getChildRoom);
router.get('/child/fees', authorize('parent'), getChildFees);
router.get('/child/entry-exit', authorize('parent'), getChildEntryExit);
router.get('/child/leaves', authorize('parent'), getChildLeaves);
router.get('/child/status', authorize('parent'), getChildStatus);
router.get('/child/location', authorize('parent'), getChildLocation);

export default router;
