import express from 'express';
import {
  updateLocation,
  getMyLocationStatus,
  getStudentLocation,
  getStudentLocationHistory,
  setTrackingForStudent,
  reportPermission,
} from '../controllers/location.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const router = express.Router();

router.use(protect);

// Student: Toggle and update location
// Only warden can enable/disable tracking for a student
router.put('/:studentId/tracking', authorize('warden'), setTrackingForStudent);

// Student: update location and view own status
// Accept both PUT and POST /update for compatibility
router.put('/update', authorize('student'), updateLocation);
router.post('/update', authorize('student'), updateLocation);
router.get('/me', authorize('student'), getMyLocationStatus);
// Student: report permission (granted/denied)
router.post('/permission', authorize('student'), reportPermission);

// Warden or Parent: Get student location (if enabled)
// Provide convenient aliases: /latest/:studentId and /:studentId
router.get('/latest/:studentId', authorize('warden', 'parent'), getStudentLocation);
router.get('/:studentId', authorize('warden', 'parent'), getStudentLocation);
// Warden or Parent: Get student's location history (default last 30 days)
router.get('/history/:studentId', authorize('warden', 'parent'), getStudentLocationHistory);
router.get('/:studentId/history', authorize('warden', 'parent'), getStudentLocationHistory);

export default router;
