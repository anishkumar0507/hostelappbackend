import express from 'express';
import {
  getFees,
  getFeeById,
  createFee,
  updateFee,
  markFeePaid,
  deleteFee,
} from '../controllers/fee.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const router = express.Router();

/**
 * @route   GET /api/fees
 * @desc    Get all fees (warden) or own fees (student)
 * @access  Private
 */
router.get('/', protect, getFees);

/**
 * @route   POST /api/fees
 * @desc    Create fee record
 * @access  Private (Warden only)
 */
router.post('/', protect, authorize('warden'), createFee);

/**
 * @route   PUT /api/fees/:id/mark-paid
 * @desc    Mark fee as paid
 * @access  Private (Warden only)
 */
router.put('/:id/mark-paid', protect, authorize('warden'), markFeePaid);

/**
 * @route   GET /api/fees/:id
 * @desc    Get fee by ID
 * @access  Private
 */
router.get('/:id', protect, getFeeById);

/**
 * @route   PUT /api/fees/:id
 * @desc    Update fee record
 * @access  Private (Warden only)
 */
router.put('/:id', protect, authorize('warden'), updateFee);

/**
 * @route   DELETE /api/fees/:id
 * @desc    Delete fee record
 * @access  Private (Warden only)
 */
router.delete('/:id', protect, authorize('warden'), deleteFee);

export default router;
