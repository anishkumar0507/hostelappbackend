import EntryExit from '../models/EntryExit.model.js';
import Student from '../models/Student.model.js';
import mongoose from 'mongoose';

/**
 * @desc    Mark entry
 * @route   POST /api/entry-exit/entry
 * @access  Private
 */
export const markEntry = async (req, res) => {
  try {
    const { studentId, method = 'Manual' } = req.body;

    // If student, use their own studentId
    let targetStudentId;
    if (req.user.role === 'student') {
      const student = await Student.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student profile not found',
        });
      }
      targetStudentId = student._id;
    } else {
      // Warden can mark entry for any student
      if (!studentId) {
        return res.status(400).json({
          success: false,
          message: 'Please provide studentId',
        });
      }

      // Accept either Mongo ObjectId or rollNumber (for QR scans)
      const isObjectId = mongoose.Types.ObjectId.isValid(studentId);
      const student = isObjectId
        ? await Student.findOne({ _id: studentId, institutionId: req.user.institutionId })
        : await Student.findOne({ rollNumber: String(studentId).trim(), institutionId: req.user.institutionId });

      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student not found',
        });
      }
      targetStudentId = student._id;
    }

    // Check if student is already IN
    const lastLog = await EntryExit.findOne({ studentId: targetStudentId, institutionId: req.user.institutionId })
      .sort({ createdAt: -1 });

    if (lastLog && lastLog.status === 'IN') {
      return res.status(400).json({
        success: false,
        message: 'Student is already marked as IN',
      });
    }

    // Create entry log
    const entryLog = await EntryExit.create({
      studentId: targetStudentId,
      institutionId: req.user.institutionId,
      inTime: new Date(),
      status: 'IN',
      method,
    });

    const populatedLog = await EntryExit.findById(entryLog._id)
      .populate({
        path: 'studentId',
        select: 'rollNumber class section',
        populate: { path: 'userId', select: 'name email' },
      });

    res.status(201).json({
      success: true,
      message: 'Entry marked successfully',
      data: populatedLog,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Mark exit
 * @route   POST /api/entry-exit/exit
 * @access  Private
 */
export const markExit = async (req, res) => {
  try {
    const { studentId, method = 'Manual' } = req.body;

    // If student, use their own studentId
    let targetStudentId;
    if (req.user.role === 'student') {
      const student = await Student.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student profile not found',
        });
      }
      targetStudentId = student._id;
    } else {
      // Warden can mark exit for any student
      if (!studentId) {
        return res.status(400).json({
          success: false,
          message: 'Please provide studentId',
        });
      }

      // Accept either Mongo ObjectId or rollNumber (for QR scans)
      const isObjectId = mongoose.Types.ObjectId.isValid(studentId);
      const student = isObjectId
        ? await Student.findOne({ _id: studentId, institutionId: req.user.institutionId })
        : await Student.findOne({ rollNumber: String(studentId).trim(), institutionId: req.user.institutionId });

      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student not found',
        });
      }
      targetStudentId = student._id;
    }

    // Check if student is already OUT or never entered
    const lastLog = await EntryExit.findOne({ studentId: targetStudentId, institutionId: req.user.institutionId })
      .sort({ createdAt: -1 });

    if (!lastLog || lastLog.status === 'OUT') {
      return res.status(400).json({
        success: false,
        message: 'Student is not currently marked as IN',
      });
    }

    // Update the last entry log with exit time
    lastLog.outTime = new Date();
    lastLog.status = 'OUT';
    lastLog.method = method;
    await lastLog.save();

    const populatedLog = await EntryExit.findById(lastLog._id)
      .populate({
        path: 'studentId',
        select: 'rollNumber class section',
        populate: { path: 'userId', select: 'name email' },
      });

    res.status(200).json({
      success: true,
      message: 'Exit marked successfully',
      data: populatedLog,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Get all entry-exit logs
 * @route   GET /api/entry-exit/logs
 * @access  Private (Warden only)
 */
export const getAllLogs = async (req, res) => {
  try {
    const { studentId, startDate, endDate, status, method } = req.query;

    // Build query
    const query = {};
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
    if (method) query.method = method;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const logs = await EntryExit.find({ ...query, institutionId: req.user.institutionId })
      .populate({
        path: 'studentId',
        select: 'rollNumber class section',
        populate: { path: 'userId', select: 'name email' },
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Get student's own entry-exit logs
 * @route   GET /api/entry-exit/my-logs
 * @access  Private (Student only)
 */
export const getMyLogs = async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    const logs = await EntryExit.find({ studentId: student._id, institutionId: req.user.institutionId })
      .sort({ createdAt: -1 })
      .limit(100); // Limit to recent 100 logs

    res.status(200).json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};
