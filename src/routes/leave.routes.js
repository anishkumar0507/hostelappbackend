import express from 'express';
import {
  createLeaveRequest,
  getAllLeaveRequests,
  getMyLeaveRequests,
  updateLeaveStatus,
  cancelMyLeaveRequest,
  parentApproveOrReject,
} from '../controllers/leave.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Student routes (specific routes before generic ones)
router.post('/', authorize('student'), createLeaveRequest);
router.get('/my', authorize('student'), getMyLeaveRequests);
router.put('/:id/cancel', authorize('student'), cancelMyLeaveRequest);

// Parent routes
router.put('/:id/parent-approval', authorize('parent'), parentApproveOrReject);

// Warden routes
router.get('/', authorize('warden'), getAllLeaveRequests);
router.put('/:id/status', authorize('warden'), updateLeaveStatus);

export default router;