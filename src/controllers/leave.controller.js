import Leave from '../models/Leave.model.js';
import Student from '../models/Student.model.js';
import Parent from '../models/Parent.model.js';

/**
 * @desc    Create a new leave request
 * @route   POST /api/leaves
 * @access  Private (Student only)
 */
export const createLeaveRequest = async (req, res) => {
  try {
    const { reason, type, outDate, inDate, outTime, inTime } = req.body;

    // Validate required fields
    if (!reason || !type || !outDate || !inDate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide reason, type, out date, and in date',
      });
    }

    // Validate dates
    const outDateObj = new Date(outDate);
    const inDateObj = new Date(inDate);

    if (outDateObj >= inDateObj) {
      return res.status(400).json({
        success: false,
        message: 'Out date must be before in date',
      });
    }

    // Get student details
    const student = await Student.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    // Create leave request - 3-step: Student -> Parent -> Warden
    const leave = await Leave.create({
      studentId: student._id,
      institutionId: req.user.institutionId,
      reason: reason.trim(),
      type,
      outDate: outDateObj,
      inDate: inDateObj,
      outTime,
      inTime,
      status: 'PendingParent',
      parentApprovalStatus: 'Pending',
      statusHistory: [{
        status: 'PendingParent',
        role: 'student',
        timestamp: new Date(),
      }],
    });

    // Populate student details
    await leave.populate({
      path: 'studentId',
      select: 'userId room rollNumber',
      populate: {
        path: 'userId',
        select: 'name'
      }
    });

    res.status(201).json({
      success: true,
      message: 'Leave request submitted successfully',
      leave: {
        id: leave._id,
        reason: leave.reason,
        type: leave.type,
        outDate: leave.outDate,
        inDate: leave.inDate,
        outTime: leave.outTime,
        inTime: leave.inTime,
        status: leave.status,
        createdAt: leave.createdAt,
        student: {
          name: leave.studentId.userId.name,
          rollNumber: leave.studentId.rollNumber || 'N/A',
          room: leave.studentId.room,
        },
      },
    });
  } catch (error) {
    console.error('Create leave error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating leave request',
    });
  }
};

/**
 * @desc    Get all leave requests (for warden)
 * @route   GET /api/leaves
 * @access  Private (Warden only)
 */
export const getAllLeaveRequests = async (req, res) => {
  try {
    const { status } = req.query;

    const filter = {};
    if (status) {
      filter.status = status;
    }
    // Warden sees: PendingParent (info only), ApprovedByParent (to approve), Approved, Rejected, RejectedByParent, Cancelled
    // By default show all; frontend can filter for "ApprovedByParent" for pending warden approval

    const leaves = await Leave.find({ ...filter, institutionId: req.user.institutionId })
      .populate({
        path: 'studentId',
        select: 'userId room rollNumber',
        populate: {
          path: 'userId',
          select: 'name'
        }
      })
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 });

    const formattedLeaves = leaves.map(leave => ({
      id: leave._id,
      reason: leave.reason,
      type: leave.type,
      outDate: leave.outDate,
      inDate: leave.inDate,
      outTime: leave.outTime,
      inTime: leave.inTime,
      status: leave.status,
      createdAt: leave.createdAt,
      approvedAt: leave.approvedAt,
      rejectionReason: leave.rejectionReason,
      student: {
        name: leave.studentId?.userId?.name || 'Unknown Student',
        rollNumber: leave.studentId?.rollNumber || 'N/A',
        room: leave.studentId?.room || 'N/A',
      },
      approvedBy: leave.approvedBy ? leave.approvedBy.name : null,
    }));

    res.status(200).json({
      success: true,
      leaves: formattedLeaves,
    });
  } catch (error) {
    console.error('Get leaves error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching leave requests',
    });
  }
};

/**
 * @desc    Get student's own leave requests
 * @route   GET /api/leaves/my
 * @access  Private (Student only)
 */
export const getMyLeaveRequests = async (req, res) => {
  try {
    // Get student details
    const student = await Student.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    const leaves = await Leave.find({ studentId: student._id, institutionId: req.user.institutionId })
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 });

    const formattedLeaves = leaves.map(leave => ({
      id: leave._id,
      reason: leave.reason,
      type: leave.type,
      outDate: leave.outDate,
      inDate: leave.inDate,
      outTime: leave.outTime,
      inTime: leave.inTime,
      status: leave.status,
      createdAt: leave.createdAt,
      approvedAt: leave.approvedAt,
      rejectionReason: leave.rejectionReason,
      approvedBy: leave.approvedBy ? leave.approvedBy.name : null,
    }));

    res.status(200).json({
      success: true,
      leaves: formattedLeaves,
    });
  } catch (error) {
    console.error('Get my leaves error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching leave requests',
    });
  }
};

/**
 * @desc    Parent approves or rejects leave request
 * @route   PUT /api/leaves/:id/parent-approval
 * @access  Private (Parent only)
 */
export const parentApproveOrReject = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be Approved or Rejected',
      });
    }

    const parent = await Parent.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
    if (!parent) {
      return res.status(403).json({
        success: false,
        message: 'Parent profile not found',
      });
    }

    const leave = await Leave.findOne({ _id: id, institutionId: req.user.institutionId })
      .populate('studentId', 'userId room')
      .populate('studentId.userId', 'name');

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found',
      });
    }

    if (leave.studentId._id.toString() !== parent.studentId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to approve this leave request',
      });
    }

    if (leave.status !== 'PendingParent') {
      return res.status(400).json({
        success: false,
        message: 'This leave request is not awaiting parent approval',
      });
    }

    const newStatus = status === 'Approved' ? 'ApprovedByParent' : 'RejectedByParent';
    const historyEntry = {
      status: newStatus,
      updatedBy: req.user._id,
      role: 'parent',
      reason: status === 'Rejected' ? rejectionReason : undefined,
      timestamp: new Date(),
    };

    leave.status = newStatus;
    leave.parentApprovalStatus = status;
    leave.parentApprovedBy = req.user._id;
    leave.parentApprovedAt = new Date();
    if (status === 'Rejected') {
      leave.parentRejectionReason = rejectionReason;
    }
    leave.statusHistory = leave.statusHistory || [];
    leave.statusHistory.push(historyEntry);
    await leave.save();

    const populated = await Leave.findById(leave._id)
      .populate({
        path: 'studentId',
        select: 'userId room rollNumber',
        populate: {
          path: 'userId',
          select: 'name'
        }
      })
      .populate('parentApprovedBy', 'name');

    return res.status(200).json({
      success: true,
      message: `Leave request ${status.toLowerCase()} by parent`,
      leave: {
        id: populated._id,
        reason: populated.reason,
        type: populated.type,
        outDate: populated.outDate,
        inDate: populated.inDate,
        status: populated.status,
        parentApprovalStatus: populated.parentApprovalStatus,
        statusHistory: populated.statusHistory,
      },
    });
  } catch (error) {
    console.error('Parent approve leave error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating leave request',
    });
  }
};

/**
 * @desc    Update leave request status (for warden) - only for parent-approved requests
 * @route   PUT /api/leaves/:id/status
 * @access  Private (Warden only)
 */
export const updateLeaveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be Approved or Rejected',
      });
    }

    const leave = await Leave.findOne({ _id: id, institutionId: req.user.institutionId });
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found',
      });
    }

    if (leave.status !== 'ApprovedByParent') {
      return res.status(400).json({
        success: false,
        message: 'Only parent-approved requests can be approved/rejected by warden',
      });
    }

    const updateData = {
      status,
      approvedBy: req.user._id,
      statusHistory: leave.statusHistory || [],
    };
    updateData.statusHistory.push({
      status,
      updatedBy: req.user._id,
      role: 'warden',
      reason: status === 'Rejected' ? rejectionReason : undefined,
      timestamp: new Date(),
    });

    if (status === 'Approved') {
      updateData.approvedAt = new Date();
    } else if (status === 'Rejected') {
      updateData.rejectionReason = rejectionReason;
    }

    const updated = await Leave.findOneAndUpdate(
      { _id: id, institutionId: req.user.institutionId },
      updateData,
      { new: true }
    ).populate({
      path: 'studentId',
      select: 'userId room rollNumber',
      populate: {
        path: 'userId',
        select: 'name'
      }
    })
     .populate('approvedBy', 'name');

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found',
      });
    }

    res.status(200).json({
      success: true,
      message: `Leave request ${status.toLowerCase()} successfully`,
      leave: {
        id: updated._id,
        reason: updated.reason,
        type: updated.type,
        outDate: updated.outDate,
        inDate: updated.inDate,
        outTime: updated.outTime,
        inTime: updated.inTime,
        status: updated.status,
        createdAt: updated.createdAt,
        approvedAt: updated.approvedAt,
        rejectionReason: updated.rejectionReason,
        student: {
          name: updated.studentId.userId.name,
          room: updated.studentId.room,
        },
        approvedBy: updated.approvedBy?.name,
      },
    });
  } catch (error) {
    console.error('Update leave status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating leave request',
    });
  }
};

/**
 * @desc    Cancel a student's own pending leave request
 * @route   PUT /api/leaves/:id/cancel
 * @access  Private (Student only)
 */
export const cancelMyLeaveRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const student = await Student.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    const leave = await Leave.findOne({ _id: id, institutionId: req.user.institutionId })
      .populate('studentId', 'userId room')
      .populate('studentId.userId', 'name');

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found',
      });
    }

    if (leave.studentId._id.toString() !== student._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this leave request',
      });
    }

    if (!['Pending', 'PendingParent'].includes(leave.status)) {
      return res.status(400).json({
        success: false,
        message: 'Only pending requests (before parent/warden approval) can be cancelled',
      });
    }

    leave.status = 'Cancelled';
    await leave.save();

    return res.status(200).json({
      success: true,
      message: 'Leave request cancelled successfully',
      leave: {
        id: leave._id,
        reason: leave.reason,
        type: leave.type,
        outDate: leave.outDate,
        inDate: leave.inDate,
        outTime: leave.outTime,
        inTime: leave.inTime,
        status: leave.status,
        createdAt: leave.createdAt,
        approvedAt: leave.approvedAt,
        rejectionReason: leave.rejectionReason,
      },
    });
  } catch (error) {
    console.error('Cancel leave error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while cancelling leave request',
    });
  }
};