import express from 'express';
import { login, wardenSignup, changePassword } from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * @route   POST /api/auth/warden-signup
 * @desc    Register warden account (warden only)
 * @access  Public
 */
router.post('/warden-signup', wardenSignup);

/**
 * @route   POST /api/auth/login
 * @desc    Login user (student or warden)
 * @access  Public
 */
router.post('/login', login);

/**
 * @route   PUT /api/auth/change-password
 * @desc    Change password (for temporary password users)
 * @access  Private
 */
router.put('/change-password', protect, changePassword);

export default router;
