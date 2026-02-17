import express from 'express';
import {
  createComplaint,
  getAllComplaints,
  getMyComplaints,
  updateComplaintStatus,
} from '../controllers/complaint.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Student routes (specific routes before generic ones)
router.post('/', authorize('student'), createComplaint);
router.get('/my', authorize('student'), getMyComplaints);

// Warden routes
router.get('/', authorize('warden'), getAllComplaints);
router.put('/:id/status', authorize('warden'), updateComplaintStatus);

export default router;