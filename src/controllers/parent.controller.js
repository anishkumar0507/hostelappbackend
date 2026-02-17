import User from '../models/User.model.js';
import Student from '../models/Student.model.js';
import Parent from '../models/Parent.model.js';
import Leave from '../models/Leave.model.js';
import Fee from '../models/Fee.model.js';
import EntryExit from '../models/EntryExit.model.js';
import StudentLocation from '../models/StudentLocation.model.js';
import { generateTempPassword } from '../utils/generateTempPassword.js';
import { sendParentTempPasswordEmail } from '../utils/emailService.js';

/**
 * Get the student ID that this parent is linked to.
 * Throws if parent has no linked student.
 */
const getParentStudentId = async (userId, institutionId) => {
  const parent = await Parent.findOne({ userId, institutionId }).populate('studentId');
  if (!parent || !parent.studentId) {
    return null;
  }
  return parent.studentId._id;
};

/**
 * @desc    Register parent for a student (warden only)
 * @route   POST /api/parent/register
 * @access  Private (Warden only)
 */
export const registerParent = async (req, res) => {
  try {
    const { studentId, name, email, relationship } = req.body;
    const institutionId = req.user?.institutionId;
    if (!institutionId) {
      return res.status(400).json({
        success: false,
        message: 'User is not linked to any institution',
      });
    }

    if (!studentId || !name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide studentId, name, and email',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
    }

    const student = await Student.findOne({ _id: studentId, institutionId }).populate('userId', 'name');
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail, institutionId });
    if (existingUser) {
      const existingParent = await Parent.findOne({ userId: existingUser._id, institutionId });
      if (existingParent) {
        if (existingParent.studentId.toString() === studentId) {
          return res.status(400).json({
            success: false,
            message: 'This parent is already linked to this student',
          });
        }
        return res.status(400).json({
          success: false,
          message: 'This email is already registered as a parent for another student',
        });
      }
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    const tempPassword = generateTempPassword();

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: tempPassword,
      isTempPassword: true,
      role: 'parent',
      institutionId,
    });

    const parentRecord = await Parent.create({
      userId: user._id,
      studentId,
      relationship: relationship || 'Guardian',
      institutionId,
    });
    await parentRecord.populate('studentId');

    sendParentTempPasswordEmail(
      normalizedEmail,
      name.trim(),
      tempPassword,
      student.userId?.name || 'Your child'
    )
      .then(() => console.log(`✅ Parent temp password email sent to ${normalizedEmail}`))
      .catch((err) => console.error('❌ Parent email error:', err.message));

    res.status(201).json({
      success: true,
      message: 'Parent registered successfully. Temporary password has been sent to their email.',
      data: {
        parent: {
          id: parentRecord._id,
          userId: user._id,
          name: user.name,
          email: user.email,
          relationship: parentRecord.relationship,
          studentId: student._id,
          studentName: student.userId?.name,
        },
      },
    });
  } catch (error) {
    console.error('❌ registerParent error:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'This parent is already linked to a student',
      });
    }
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Get parent's linked child (student) info
 * @route   GET /api/parent/child
 * @access  Private (Parent only)
 */
export const getMyChild = async (req, res) => {
  try {
    const parent = await Parent.findOne({ userId: req.user._id, institutionId: req.user.institutionId })
      .populate('studentId')
      .populate('studentId.userId', 'name email');

    if (!parent || !parent.studentId) {
      return res.status(404).json({
        success: false,
        message: 'No child linked to your account',
      });
    }

    const student = parent.studentId;
    res.status(200).json({
      success: true,
      data: {
        id: student._id,
        name: student.userId?.name,
        email: student.userId?.email,
        class: student.class,
        section: student.section,
        rollNumber: student.rollNumber,
        room: student.room,
        phone: student.phone,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Get child's room details
 * @route   GET /api/parent/child/room
 * @access  Private (Parent only)
 */
export const getChildRoom = async (req, res) => {
  try {
    const studentId = await getParentStudentId(req.user._id, req.user.institutionId);
    if (!studentId) {
      return res.status(404).json({ success: false, message: 'No child linked' });
    }

    const student = await Student.findById(studentId).populate('userId', 'name');
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    res.status(200).json({
      success: true,
      data: {
        room: student.room || 'N/A',
        class: student.class,
        section: student.section || 'N/A',
        rollNumber: student.rollNumber,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

/**
 * @desc    Get child's fee and payment history
 * @route   GET /api/parent/child/fees
 * @access  Private (Parent only)
 */
export const getChildFees = async (req, res) => {
  try {
    const studentId = await getParentStudentId(req.user._id, req.user.institutionId);
    if (!studentId) {
      return res.status(404).json({ success: false, message: 'No child linked' });
    }

    const fees = await Fee.find({ studentId, institutionId: req.user.institutionId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: fees.length,
      data: fees,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

/**
 * @desc    Get child's entry/exit logs (last 30 days, with monthly filter)
 * @route   GET /api/parent/child/entry-exit
 * @access  Private (Parent only)
 */
export const getChildEntryExit = async (req, res) => {
  try {
    const studentId = await getParentStudentId(req.user._id, req.user.institutionId);
    if (!studentId) {
      return res.status(404).json({ success: false, message: 'No child linked' });
    }

    const { month, year } = req.query;
    const query = { studentId };

    if (month && year) {
      const start = new Date(parseInt(year), parseInt(month) - 1, 1);
      const end = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);
      query.createdAt = { $gte: start, $lte: end };
    } else {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      query.createdAt = { $gte: thirtyDaysAgo };
    }

    const logs = await EntryExit.find({ ...query, institutionId: req.user.institutionId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

/**
 * @desc    Get child's outing requests
 * @route   GET /api/parent/child/leaves
 * @access  Private (Parent only)
 */
export const getChildLeaves = async (req, res) => {
  try {
    const studentId = await getParentStudentId(req.user._id, req.user.institutionId);
    if (!studentId) {
      return res.status(404).json({ success: false, message: 'No child linked' });
    }

    const leaves = await Leave.find({ studentId, institutionId: req.user.institutionId })
      .populate('approvedBy', 'name')
      .populate('parentApprovedBy', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      leaves: leaves.map((l) => ({
        id: l._id,
        reason: l.reason,
        type: l.type,
        outDate: l.outDate,
        inDate: l.inDate,
        outTime: l.outTime,
        inTime: l.inTime,
        status: l.status,
        parentApprovalStatus: l.parentApprovalStatus,
        parentRejectionReason: l.parentRejectionReason,
        createdAt: l.createdAt,
        statusHistory: l.statusHistory || [],
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

/**
 * @desc    Get child's location (if sharing enabled)
 * @route   GET /api/parent/child/location
 * @access  Private (Parent only)
 */
export const getChildLocation = async (req, res) => {
  try {
    const studentId = await getParentStudentId(req.user._id, req.user.institutionId);
    if (!studentId) {
      return res.status(404).json({ success: false, message: 'No child linked' });
    }

    const loc = await StudentLocation.findOne({ studentId, institutionId: req.user.institutionId });
    if (!loc || !loc.isSharingEnabled) {
      return res.status(200).json({
        success: true,
        data: {
          isSharingEnabled: false,
          message: 'Location sharing is not enabled by your child',
        },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        isSharingEnabled: true,
        lat: loc.lat || null,
        lng: loc.lng || null,
        lastUpdated: loc.lastUpdated || null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

/**
 * @desc    Get child's current status (in/out)
 * @route   GET /api/parent/child/status
 * @access  Private (Parent only)
 */
export const getChildStatus = async (req, res) => {
  try {
    const studentId = await getParentStudentId(req.user._id, req.user.institutionId);
    if (!studentId) {
      return res.status(404).json({ success: false, message: 'No child linked' });
    }

    const lastLog = await EntryExit.findOne({ studentId, institutionId: req.user.institutionId }).sort({ createdAt: -1 });
    const status = lastLog ? lastLog.status : 'OUT';
    const lastUpdated = lastLog?.inTime || lastLog?.outTime || lastLog?.createdAt;

    res.status(200).json({
      success: true,
      data: {
        status,
        lastUpdated: lastUpdated || null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};
