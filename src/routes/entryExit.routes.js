import express from 'express';
import {
  markEntry,
  markExit,
  getAllLogs,
  getMyLogs,
} from '../controllers/entryExit.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const router = express.Router();

/**
 * @route   POST /api/entry-exit/entry
 * @desc    Mark entry
 * @access  Private
 */
router.post('/entry', protect, markEntry);

/**
 * @route   POST /api/entry-exit/exit
 * @desc    Mark exit
 * @access  Private
 */
router.post('/exit', protect, markExit);

/**
 * @route   GET /api/entry-exit/logs
 * @desc    Get all entry-exit logs
 * @access  Private (Warden only)
 */
router.get('/logs', protect, authorize('warden'), getAllLogs);

/**
 * @route   GET /api/entry-exit/my-logs
 * @desc    Get student's own entry-exit logs
 * @access  Private (Student only)
 */
router.get('/my-logs', protect, authorize('student'), getMyLogs);

export default router;
