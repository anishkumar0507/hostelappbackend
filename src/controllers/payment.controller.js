import crypto from 'crypto';
import Razorpay from 'razorpay';
import Fee from '../models/Fee.model.js';
import Student from '../models/Student.model.js';
import Parent from '../models/Parent.model.js';
import Payment from '../models/Payment.model.js';
import { generateReceiptNumber } from '../utils/receiptNumber.js';
import { sendPaymentReceiptEmail } from '../utils/emailService.js';
import { buildReceiptPdfBuffer } from '../utils/receiptPdf.js';

/**
 * @desc    Get payment summary for all students (warden only)
 * @route   GET /api/payments
 * @access  Private (Warden only)
 */
export const getPaymentSummary = async (req, res) => {
  try {
    // Get all students with their fees
    const students = await Student.find({ institutionId: req.user.institutionId })
      .populate('userId', 'name email')
      .sort({ rollNumber: 1 });

    // Get all fees
    const allFees = await Fee.find({ institutionId: req.user.institutionId }).populate({
      path: 'studentId',
      select: 'rollNumber userId',
      populate: { path: 'userId', select: 'name' },
    });

    // Get completed payments to recover paid totals if fees are missing/out of sync
    const completedPayments = await Payment.find({ status: 'Completed', institutionId: req.user.institutionId }).select('studentId amount createdAt');
    const paymentTotals = new Map();
    completedPayments.forEach((payment) => {
      const studentKey = payment.studentId?.toString();
      if (!studentKey) return;
      const existing = paymentTotals.get(studentKey) || { totalPaid: 0, lastPaidAt: null };
      existing.totalPaid += payment.amount || 0;
      if (!existing.lastPaidAt || payment.createdAt > existing.lastPaidAt) {
        existing.lastPaidAt = payment.createdAt;
      }
      paymentTotals.set(studentKey, existing);
    });

    // Group fees by student and calculate totals
    const paymentSummary = students.map((student) => {
      const studentFees = allFees.filter(
        (fee) => fee.studentId._id.toString() === student._id.toString()
      );

      let totalFees = studentFees.reduce((sum, fee) => sum + fee.amount, 0);
      const paidFromFees = studentFees
        .filter((fee) => fee.status === 'Paid')
        .reduce((sum, fee) => sum + fee.amount, 0);

      const paymentAggregate = paymentTotals.get(student._id.toString()) || { totalPaid: 0, lastPaidAt: null };
      const paidFromPayments = paymentAggregate.totalPaid || 0;

      const paidAmount = paidFromPayments > paidFromFees ? paidFromPayments : paidFromFees;
      if (totalFees === 0 && paidFromPayments > 0) {
        totalFees = paidFromPayments;
      }

      const dueAmount = Math.max(totalFees - paidAmount, 0);
      const paymentStatus = dueAmount === 0 ? 'Paid' : dueAmount === totalFees ? 'Pending' : 'Partial';

      return {
        studentId: student._id,
        studentName: student.userId?.name || 'Unknown',
        rollNumber: student.rollNumber,
        email: student.userId?.email || 'N/A',
        class: student.class,
        section: student.section || 'N/A',
        room: student.room || 'N/A',
        totalFees,
        paidAmount,
        dueAmount,
        paymentStatus,
        feeCount: studentFees.length,
        fees: studentFees.map((fee) => ({
          id: fee._id,
          amount: fee.amount,
          term: fee.term,
          status: fee.status,
          receiptNumber: fee.receiptNumber || 'N/A',
          paidAt: fee.paidAt || null,
          dueDate: fee.dueDate || null,
          createdAt: fee.createdAt,
        })),
      };
    });

    res.status(200).json({
      success: true,
      count: paymentSummary.length,
      data: paymentSummary,
    });
  } catch (error) {
    console.error('❌ Error fetching payment summary:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Create Razorpay order for pending fees
 * @route   POST /api/payments/create-order
 * @access  Private (Student, Parent, Warden)
 */
export const createRazorpayOrder = async (req, res) => {
  try {
    const razorpay = getRazorpayClient();
    if (!razorpay) {
      return res.status(500).json({
        success: false,
        message: 'Razorpay is not configured',
      });
    }

    const { student, payerType, payerUserId, error } = await resolvePayer(req, req.body?.studentId);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error,
      });
    }
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    const pendingFees = await Fee.find({ studentId: student._id, status: 'Pending', institutionId: req.user.institutionId }).sort({ createdAt: 1 });
    if (pendingFees.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No pending fees to pay',
        data: null,
      });
    }

    const totalDue = pendingFees.reduce((sum, fee) => sum + (fee.amount || 0), 0);
    const receiptNumber = generateReceiptNumber();

    const order = await razorpay.orders.create({
      amount: Math.round(totalDue * 100),
      currency: 'INR',
      receipt: receiptNumber,
      payment_capture: 1,
    });

    await Payment.create({
      studentId: student._id,
      institutionId: req.user.institutionId,
      payerType,
      payerUserId,
      amount: totalDue,
      method: 'Razorpay',
      gateway: 'Razorpay',
      status: 'Pending',
      receiptNumber,
      feeIds: pendingFees.map((fee) => fee._id),
      currency: order.currency,
      razorpayOrderId: order.id,
    });

    return res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        receiptNumber,
        keyId: process.env.RAZORPAY_KEY_ID,
        studentName: student.userId?.name || 'Student',
        studentEmail: student.userId?.email || '',
      },
    });
  } catch (error) {
    console.error('❌ Error creating Razorpay order:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Verify Razorpay payment and mark fees as paid
 * @route   POST /api/payments/verify
 * @access  Private (Student, Parent, Warden)
 */
export const verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body || {};
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'Missing Razorpay payment details',
      });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET || '';
    const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (expected !== razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'Payment signature verification failed',
      });
    }

    const paymentRecord = await Payment.findOne({ razorpayOrderId, institutionId: req.user.institutionId });
    if (!paymentRecord) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found',
      });
    }

    let student = null;
    let payerType = req.user.role === 'warden' ? 'warden' : 'student';
    let payerUserId = req.user._id;

    if (req.user.role === 'warden') {
      student = await Student.findOne({ _id: paymentRecord.studentId, institutionId: req.user.institutionId }).populate('userId', 'name email');
    } else {
      const resolved = await resolvePayer(req);
      student = resolved.student;
      payerType = resolved.payerType;
      payerUserId = resolved.payerUserId;
    }

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    const feeQuery = (paymentRecord.feeIds && paymentRecord.feeIds.length > 0)
      ? { _id: { $in: paymentRecord.feeIds }, status: 'Pending', institutionId: req.user.institutionId }
      : { studentId: student._id, status: 'Pending', institutionId: req.user.institutionId };

    const pendingFees = await Fee.find(feeQuery).sort({ createdAt: 1 });

    if (pendingFees.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No pending fees to pay',
        data: [],
      });
    }

    const paidAt = new Date();
    await Promise.all(
      pendingFees.map(async (fee) => {
        fee.status = 'Paid';
        fee.paidAt = paidAt;
        fee.receiptNumber = fee.receiptNumber || paymentRecord.receiptNumber;
        fee.paidBy = payerType;
        fee.paidByUserId = payerUserId;
        await fee.save();
      })
    );

    paymentRecord.status = 'Completed';
    paymentRecord.transactionId = razorpayPaymentId;
    paymentRecord.razorpayPaymentId = razorpayPaymentId;
    paymentRecord.razorpaySignature = razorpaySignature;
    await paymentRecord.save();

    const parent = await Parent.findOne({ studentId: student._id, institutionId: req.user.institutionId }).populate('userId', 'email name');
    const receiptPayload = {
      receiptNumber: paymentRecord.receiptNumber,
      studentName: student.userId?.name,
      studentEmail: student.userId?.email,
      amount: paymentRecord.amount,
      paidAt,
      method: paymentRecord.method,
      items: pendingFees.map((fee) => ({ term: fee.term, amount: fee.amount })),
    };

    if (student.userId?.email) {
      sendPaymentReceiptEmail({
        to: student.userId.email,
        ...receiptPayload,
      });
    }

    if (parent?.userId?.email) {
      sendPaymentReceiptEmail({
        to: parent.userId.email,
        ...receiptPayload,
      });
    }

    const updatedFees = await Fee.find({ studentId: student._id, institutionId: req.user.institutionId }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      data: updatedFees,
      receiptNumber: paymentRecord.receiptNumber,
    });
  } catch (error) {
    console.error('❌ Error verifying Razorpay payment:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Download payment receipt PDF
 * @route   GET /api/payments/receipt/:receiptNumber
 * @access  Private (Student, Parent, Warden)
 */
export const getReceiptPdf = async (req, res) => {
  try {
    const { receiptNumber } = req.params;
    if (!receiptNumber) {
      return res.status(400).json({ success: false, message: 'Receipt number required' });
    }

    let studentId = null;
    if (req.user.role === 'student') {
      const student = await Student.findOne({ userId: req.user._id, institutionId: req.user.institutionId }).populate('userId', 'name email');
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student profile not found' });
      }
      studentId = student._id;
    }

    if (req.user.role === 'parent') {
      const parent = await Parent.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
      if (!parent) {
        return res.status(404).json({ success: false, message: 'Parent profile not found' });
      }
      studentId = parent.studentId;
    }

    const feeQuery = studentId
      ? { studentId, receiptNumber, institutionId: req.user.institutionId }
      : { receiptNumber, institutionId: req.user.institutionId };
    const fees = await Fee.find(feeQuery).populate({
      path: 'studentId',
      populate: { path: 'userId', select: 'name email' },
    });

    if (!fees.length) {
      return res.status(404).json({ success: false, message: 'Receipt not found' });
    }

    const studentName = fees[0].studentId?.userId?.name || 'Student';
    const studentEmail = fees[0].studentId?.userId?.email || '';
    const amount = fees.reduce((sum, fee) => sum + (fee.amount || 0), 0);
    const paidAt = fees[0].paidAt || fees[0].updatedAt;
    const paymentRecord = await Payment.findOne({ receiptNumber, institutionId: req.user.institutionId });
    const method = paymentRecord?.method || 'Manual';

    const pdfBuffer = await buildReceiptPdfBuffer({
      receiptNumber,
      studentName,
      studentEmail,
      amount,
      paidAt,
      method,
      items: fees.map((fee) => ({ term: fee.term, amount: fee.amount })),
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Receipt-${receiptNumber}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('❌ Error generating receipt PDF:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

const getRazorpayClient = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return null;
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

const resolvePayer = async (req, studentId) => {
  if (req.user.role === 'warden') {
    if (!studentId) {
      return { student: null, payerType: 'warden', payerUserId: req.user._id, error: 'Student ID is required' };
    }
    const student = await Student.findOne({ _id: studentId, institutionId: req.user.institutionId }).populate('userId', 'name email');
    return { student, payerType: 'warden', payerUserId: req.user._id };
  }

  if (req.user.role === 'parent') {
    const parent = await Parent.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
    if (!parent) return { student: null, payerType: 'parent', payerUserId: req.user._id };
    const student = await Student.findOne({ _id: parent.studentId, institutionId: req.user.institutionId }).populate('userId', 'name email');
    return { student, payerType: 'parent', payerUserId: req.user._id };
  }

  const student = await Student.findOne({ userId: req.user._id, institutionId: req.user.institutionId }).populate('userId', 'name email');
  return { student, payerType: 'student', payerUserId: req.user._id };
};

/**
 * @desc    Record a student payment against their pending fees
 *          (Student or Parent - tracks who paid)
 * @route   POST /api/payments/pay
 * @access  Private (Student or Parent only)
 */
export const payMyFees = async (req, res) => {
  try {
    const { amount, method = 'UPI', transactionId } = req.body || {};

    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid amount',
      });
    }

    let student;
    if (req.user.role === 'parent') {
      const parent = await Parent.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
      if (!parent) {
        return res.status(404).json({
          success: false,
          message: 'Parent profile not found',
        });
      }
      student = await Student.findOne({ _id: parent.studentId, institutionId: req.user.institutionId }).populate('userId', 'name email');
    } else {
      student = await Student.findOne({ userId: req.user._id, institutionId: req.user.institutionId }).populate('userId', 'name email');
    }

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    const pendingFees = await Fee.find({ studentId: student._id, status: 'Pending', institutionId: req.user.institutionId }).sort({ createdAt: 1 });
    if (pendingFees.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No pending fees to pay',
        data: [],
      });
    }

    const totalDue = pendingFees.reduce((sum, fee) => sum + (fee.amount || 0), 0);
    if (amount !== totalDue) {
      return res.status(400).json({
        success: false,
        message: `Payment amount mismatch. Expected ₹${totalDue}, received ₹${amount}.`,
      });
    }

    const paidAt = new Date();
    const transactionReceipt = generateReceiptNumber();
    const paidBy = req.user.role === 'parent' ? 'parent' : 'student';
    const paidByUserId = req.user._id;

    // Mark all pending fees as paid
    await Promise.all(
      pendingFees.map(async (fee) => {
        fee.status = 'Paid';
        fee.paidAt = paidAt;
        fee.receiptNumber = fee.receiptNumber || transactionReceipt;
        fee.paidBy = paidBy;
        fee.paidByUserId = paidByUserId;
        await fee.save();
      })
    );

    // Create Payment record
    try {
      await Payment.create({
        studentId: student._id,
        institutionId: req.user.institutionId,
        payerType: paidBy === 'parent' ? 'parent' : 'student',
        payerUserId: paidByUserId,
        amount,
        method,
        gateway: method === 'Cash' ? 'Manual' : 'Razorpay',
        status: 'Completed',
        transactionId: transactionId || transactionReceipt,
        receiptNumber: transactionReceipt,
        feeIds: pendingFees.map((fee) => fee._id),
      });
    } catch (payErr) {
      console.error('❌ Failed to create Payment record:', payErr);
      // Not critical - fees are already marked paid, but log for investigation
    }

    const parent = await Parent.findOne({ studentId: student._id, institutionId: req.user.institutionId }).populate('userId', 'email name');
    const receiptPayload = {
      receiptNumber: transactionReceipt,
      studentName: student.userId?.name,
      studentEmail: student.userId?.email,
      amount,
      paidAt,
      method,
      items: pendingFees.map((fee) => ({ term: fee.term, amount: fee.amount })),
    };

    if (student.userId?.email) {
      sendPaymentReceiptEmail({ to: student.userId.email, ...receiptPayload });
    }

    if (parent?.userId?.email) {
      sendPaymentReceiptEmail({ to: parent.userId.email, ...receiptPayload });
    }

    const updatedFees = await Fee.find({ studentId: student._id, institutionId: req.user.institutionId }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: 'Payment recorded successfully',
      data: updatedFees,
      receiptNumber: transactionReceipt,
    });
  } catch (error) {
    console.error('❌ Error recording payment:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};
