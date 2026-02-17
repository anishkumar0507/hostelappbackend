import express from 'express';
import {
	getPaymentSummary,
	payMyFees,
	createRazorpayOrder,
	verifyRazorpayPayment,
	getReceiptPdf,
} from '../controllers/payment.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const router = express.Router();

/**
 * @route   GET /api/payments
 * @desc    Get payment summary for all students
 * @access  Private (Warden only)
 */
router.get('/', protect, authorize('warden'), getPaymentSummary);

/**
 * @route   POST /api/payments/create-order
 * @desc    Create Razorpay order for student/parent/warden
 * @access  Private (Student, Parent, Warden)
 */
router.post('/create-order', protect, authorize('student', 'parent', 'warden'), createRazorpayOrder);

/**
 * @route   POST /api/payments/verify
 * @desc    Verify Razorpay payment and mark fees paid
 * @access  Private (Student, Parent, Warden)
 */
router.post('/verify', protect, authorize('student', 'parent', 'warden'), verifyRazorpayPayment);

/**
 * @route   POST /api/payments/pay
 * @desc    Record payment against student's pending fees (student or parent)
 * @access  Private (Student or Parent only)
 */
router.post('/pay', protect, authorize('student', 'parent'), payMyFees);

/**
 * @route   GET /api/payments/receipt/:receiptNumber
 * @desc    Download receipt PDF
 * @access  Private (Student, Parent, Warden)
 */
router.get('/receipt/:receiptNumber', protect, authorize('student', 'parent', 'warden'), getReceiptPdf);

export default router;
