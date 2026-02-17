import express from 'express';
import Fee from '../models/Fee.model.js';
import Student from '../models/Student.model.js';
import { protect, authorize } from '../middleware/auth.middleware.js';

const router = express.Router();

// @route   GET /api/fees
// @desc    Get all fees (warden only) or own fees (student)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    if (req.user.role === 'warden') {
      // Warden can see all fees
      const { studentId, status, term } = req.query;
      const query = {};
      if (studentId) {
        const student = await Student.findOne({ studentId });
        if (student) {
          query.studentId = student._id;
        } else {
          return res.json([]);
        }
      }
      if (status) query.status = status;
      if (term) query.term = term;

      const fees = await Fee.find(query)
        .populate('studentId', 'studentId')
        .populate({
          path: 'studentId',
          populate: { path: 'userId', select: 'name email' },
        })
        .sort({ createdAt: -1 });

      res.json(fees);
    } else {
      // Student can only see own fees
      const student = await Student.findOne({ userId: req.user._id });
      if (!student) {
        return res.status(404).json({ message: 'Student profile not found' });
      }

      const fees = await Fee.find({ studentId: student._id })
        .sort({ createdAt: -1 });

      res.json(fees);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/fees/:id
// @desc    Get fee by ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const fee = await Fee.findById(req.params.id)
      .populate('studentId', 'studentId')
      .populate({
        path: 'studentId',
        populate: { path: 'userId', select: 'name email' },
      });

    if (!fee) {
      return res.status(404).json({ message: 'Fee record not found' });
    }

    // Check if student is accessing their own fee or if user is warden
    if (req.user.role === 'student') {
      const student = await Student.findOne({ userId: req.user._id });
      if (!student || fee.studentId._id.toString() !== student._id.toString()) {
        return res.status(403).json({ message: 'Not authorized to access this fee record' });
      }
    }

    res.json(fee);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/fees
// @desc    Create fee record (warden only)
// @access  Private (Warden only)
router.post('/', protect, authorize('warden'), async (req, res) => {
  try {
    const { studentId, amount, term, status = 'Pending' } = req.body;

    if (!studentId || !amount || !term) {
      return res.status(400).json({ message: 'Please provide studentId, amount, and term' });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const fee = await Fee.create({
      studentId,
      amount,
      term,
      status,
    });

    const populatedFee = await Fee.findById(fee._id)
      .populate('studentId', 'studentId')
      .populate({
        path: 'studentId',
        populate: { path: 'userId', select: 'name email' },
      });

    res.status(201).json({
      message: 'Fee record created successfully',
      fee: populatedFee,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/fees/:id
// @desc    Update fee record (warden only)
// @access  Private (Warden only)
router.put('/:id', protect, authorize('warden'), async (req, res) => {
  try {
    const { amount, status, term, receiptNumber } = req.body;

    const fee = await Fee.findById(req.params.id);
    if (!fee) {
      return res.status(404).json({ message: 'Fee record not found' });
    }

    if (amount !== undefined) fee.amount = amount;
    if (status !== undefined) {
      fee.status = status;
      if (status === 'Paid' && !fee.paidAt) {
        fee.paidAt = new Date();
      }
    }
    if (term !== undefined) fee.term = term;
    if (receiptNumber !== undefined) fee.receiptNumber = receiptNumber;

    await fee.save();

    const populatedFee = await Fee.findById(fee._id)
      .populate('studentId', 'studentId')
      .populate({
        path: 'studentId',
        populate: { path: 'userId', select: 'name email' },
      });

    res.json({
      message: 'Fee record updated successfully',
      fee: populatedFee,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/fees/:id/mark-paid
// @desc    Mark fee as paid (warden only)
// @access  Private (Warden only)
router.put('/:id/mark-paid', protect, authorize('warden'), async (req, res) => {
  try {
    const { receiptNumber } = req.body;

    const fee = await Fee.findById(req.params.id);
    if (!fee) {
      return res.status(404).json({ message: 'Fee record not found' });
    }

    fee.status = 'Paid';
    fee.paidAt = new Date();
    if (receiptNumber) {
      fee.receiptNumber = receiptNumber;
    }

    await fee.save();

    const populatedFee = await Fee.findById(fee._id)
      .populate('studentId', 'studentId')
      .populate({
        path: 'studentId',
        populate: { path: 'userId', select: 'name email' },
      });

    res.json({
      message: 'Fee marked as paid successfully',
      fee: populatedFee,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   DELETE /api/fees/:id
// @desc    Delete fee record (warden only)
// @access  Private (Warden only)
router.delete('/:id', protect, authorize('warden'), async (req, res) => {
  try {
    const fee = await Fee.findById(req.params.id);
    if (!fee) {
      return res.status(404).json({ message: 'Fee record not found' });
    }

    await Fee.findByIdAndDelete(req.params.id);

    res.json({ message: 'Fee record deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
