import express from 'express';
import EntryExit from '../models/EntryExit.model.js';
import Student from '../models/Student.model.js';
import { protect, authorize } from '../middleware/auth.middleware.js';

const router = express.Router();

// @route   POST /api/entry-exit/entry
// @desc    Mark entry
// @access  Private
router.post('/entry', protect, async (req, res) => {
  try {
    const { studentId, method = 'Manual' } = req.body;

    // If student, use their own studentId
    let targetStudentId;
    if (req.user.role === 'student') {
      const student = await Student.findOne({ userId: req.user._id });
      if (!student) {
        return res.status(404).json({ message: 'Student profile not found' });
      }
      targetStudentId = student._id;
    } else {
      // Warden can mark entry for any student
      if (!studentId) {
        return res.status(400).json({ message: 'Please provide studentId' });
      }
      const student = await Student.findById(studentId);
      if (!student) {
        return res.status(404).json({ message: 'Student not found' });
      }
      targetStudentId = student._id;
    }

    // Check if student is already IN
    const lastLog = await EntryExit.findOne({ studentId: targetStudentId })
      .sort({ createdAt: -1 });

    if (lastLog && lastLog.status === 'IN') {
      return res.status(400).json({ message: 'Student is already marked as IN' });
    }

    // Create entry log
    const entryLog = await EntryExit.create({
      studentId: targetStudentId,
      inTime: new Date(),
      status: 'IN',
      method,
    });

    const populatedLog = await EntryExit.findById(entryLog._id)
      .populate('studentId', 'studentId')
      .populate({
        path: 'studentId',
        populate: { path: 'userId', select: 'name email' },
      });

    res.status(201).json({
      message: 'Entry marked successfully',
      log: populatedLog,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/entry-exit/exit
// @desc    Mark exit
// @access  Private
router.post('/exit', protect, async (req, res) => {
  try {
    const { studentId, method = 'Manual' } = req.body;

    // If student, use their own studentId
    let targetStudentId;
    if (req.user.role === 'student') {
      const student = await Student.findOne({ userId: req.user._id });
      if (!student) {
        return res.status(404).json({ message: 'Student profile not found' });
      }
      targetStudentId = student._id;
    } else {
      // Warden can mark exit for any student
      if (!studentId) {
        return res.status(400).json({ message: 'Please provide studentId' });
      }
      const student = await Student.findById(studentId);
      if (!student) {
        return res.status(404).json({ message: 'Student not found' });
      }
      targetStudentId = student._id;
    }

    // Check if student is already OUT or never entered
    const lastLog = await EntryExit.findOne({ studentId: targetStudentId })
      .sort({ createdAt: -1 });

    if (!lastLog || lastLog.status === 'OUT') {
      return res.status(400).json({ message: 'Student is not currently marked as IN' });
    }

    // Update the last entry log with exit time
    lastLog.outTime = new Date();
    lastLog.status = 'OUT';
    lastLog.method = method;
    await lastLog.save();

    const populatedLog = await EntryExit.findById(lastLog._id)
      .populate('studentId', 'studentId')
      .populate({
        path: 'studentId',
        populate: { path: 'userId', select: 'name email' },
      });

    res.json({
      message: 'Exit marked successfully',
      log: populatedLog,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/entry-exit/logs
// @desc    Get all entry-exit logs (warden only)
// @access  Private (Warden only)
router.get('/logs', protect, authorize('warden'), async (req, res) => {
  try {
    const { studentId, startDate, endDate, status, method } = req.query;

    // Build query
    const query = {};
    if (studentId) {
      const student = await Student.findOne({ studentId });
      if (student) {
        query.studentId = student._id;
      } else {
        return res.json([]); // Return empty if student not found
      }
    }
    if (status) query.status = status;
    if (method) query.method = method;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const logs = await EntryExit.find(query)
      .populate('studentId', 'studentId')
      .populate({
        path: 'studentId',
        populate: { path: 'userId', select: 'name email' },
      })
      .sort({ createdAt: -1 });

    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/entry-exit/my-logs
// @desc    Get student's own entry-exit logs
// @access  Private (Student only)
router.get('/my-logs', protect, authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    const logs = await EntryExit.find({ studentId: student._id })
      .sort({ createdAt: -1 })
      .limit(100); // Limit to recent 100 logs

    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
