import Fee from '../models/Fee.model.js';
import Student from '../models/Student.model.js';

/**
 * @desc    Get all fees (warden) or own fees (student)
 * @route   GET /api/fees
 * @access  Private
 */
export const getFees = async (req, res) => {
  try {
    if (req.user.role === 'warden') {
      // Warden can see all fees
      const { studentId, status, term } = req.query;
      const query = { institutionId: req.user.institutionId };
      if (studentId) {
        const student = await Student.findOne({ rollNumber: studentId, institutionId: req.user.institutionId });
        if (student) {
          query.studentId = student._id;
        } else {
          return res.status(200).json({
            success: true,
            count: 0,
            data: [],
          });
        }
      }
      if (status) query.status = status;
      if (term) query.term = term;

      const fees = await Fee.find(query)
        .populate({
          path: 'studentId',
          select: 'rollNumber class section',
          populate: { path: 'userId', select: 'name email' },
        })
        .sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        count: fees.length,
        data: fees,
      });
    } else {
      // Student can only see own fees
      const student = await Student.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student profile not found',
        });
      }

      const fees = await Fee.find({ studentId: student._id, institutionId: req.user.institutionId })
        .sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        count: fees.length,
        data: fees,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Get fee by ID
 * @route   GET /api/fees/:id
 * @access  Private
 */
export const getFeeById = async (req, res) => {
  try {
    const fee = await Fee.findOne({ _id: req.params.id, institutionId: req.user.institutionId })
      .populate({
        path: 'studentId',
        select: 'rollNumber class section',
        populate: { path: 'userId', select: 'name email' },
      });

    if (!fee) {
      return res.status(404).json({
        success: false,
        message: 'Fee record not found',
      });
    }

    // Check if student is accessing their own fee or if user is warden
    if (req.user.role === 'student') {
      const student = await Student.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
      if (!student || fee.studentId._id.toString() !== student._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access this fee record',
        });
      }
    }

    res.status(200).json({
      success: true,
      data: fee,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Create fee record
 * @route   POST /api/fees
 * @access  Private (Warden only)
 */
export const createFee = async (req, res) => {
  try {
    const { studentId, amount, term, status = 'Pending', dueDate } = req.body;

    if (!studentId || !amount || !term) {
      return res.status(400).json({
        success: false,
        message: 'Please provide studentId, amount, and term',
      });
    }

    const student = await Student.findOne({ _id: studentId, institutionId: req.user.institutionId });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    const fee = await Fee.create({
      studentId,
      institutionId: req.user.institutionId,
      amount,
      term,
      status,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    });

    const populatedFee = await Fee.findById(fee._id)
      .populate({
        path: 'studentId',
        select: 'rollNumber class section',
        populate: { path: 'userId', select: 'name email' },
      });

    res.status(201).json({
      success: true,
      message: 'Fee record created successfully',
      data: populatedFee,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Update fee record
 * @route   PUT /api/fees/:id
 * @access  Private (Warden only)
 */
export const updateFee = async (req, res) => {
  try {
    const { amount, status, term, receiptNumber, dueDate } = req.body;

    const fee = await Fee.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!fee) {
      return res.status(404).json({
        success: false,
        message: 'Fee record not found',
      });
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
    if (dueDate !== undefined) fee.dueDate = dueDate ? new Date(dueDate) : undefined;

    await fee.save();

    const populatedFee = await Fee.findById(fee._id)
      .populate({
        path: 'studentId',
        select: 'rollNumber class section',
        populate: { path: 'userId', select: 'name email' },
      });

    res.status(200).json({
      success: true,
      message: 'Fee record updated successfully',
      data: populatedFee,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Mark fee as paid
 * @route   PUT /api/fees/:id/mark-paid
 * @access  Private (Warden only)
 */
export const markFeePaid = async (req, res) => {
  try {
    const { receiptNumber } = req.body;

    const fee = await Fee.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!fee) {
      return res.status(404).json({
        success: false,
        message: 'Fee record not found',
      });
    }

    fee.status = 'Paid';
    fee.paidAt = new Date();
    fee.paidBy = 'warden';
    fee.paidByUserId = req.user._id;
    if (receiptNumber) {
      fee.receiptNumber = receiptNumber;
    }

    await fee.save();

    const populatedFee = await Fee.findById(fee._id)
      .populate({
        path: 'studentId',
        select: 'rollNumber class section',
        populate: { path: 'userId', select: 'name email' },
      });

    res.status(200).json({
      success: true,
      message: 'Fee marked as paid successfully',
      data: populatedFee,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Delete fee record
 * @route   DELETE /api/fees/:id
 * @access  Private (Warden only)
 */
export const deleteFee = async (req, res) => {
  try {
    const fee = await Fee.findById(req.params.id);
    if (!fee) {
      return res.status(404).json({
        success: false,
        message: 'Fee record not found',
      });
    }

    await Fee.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Fee record deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};
