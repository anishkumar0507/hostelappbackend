import Leave from '../models/Leave.model.js';
import Student from '../models/Student.model.js';
import Parent from '../models/Parent.model.js';
import User from '../models/User.model.js';
import { getIO } from '../utils/socket.js';
import { notifyUser, notifyUsers } from '../services/notification.service.js';

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

    // Validate dates: inDate must be on or after outDate (same day allowed for short outings)
    if (inDateObj < outDateObj) {
      return res.status(400).json({
        success: false,
        message: 'Return date must be on or after the out date',
      });
    }

    if (outDateObj.getTime() === inDateObj.getTime() && outTime && inTime && inTime < outTime) {
      return res.status(400).json({
        success: false,
        message: 'For same-day outings, in time must be on or after out time',
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

    // Notify wardens + parent via DB history + socket + push.
    try {
      const io = getIO();
      const wardens = await User.find({ role: 'warden', institutionId: req.user.institutionId });
      const studentName = leave.studentId?.userId?.name || 'Unknown';
      const room = leave.studentId?.room || '';

      await notifyUsers(wardens.map((warden) => ({
        institutionId: req.user.institutionId,
        userId: warden._id,
        type: 'leave',
        title: `New ${leave.type} Request`,
        message: `${studentName}${room ? ` (Room ${room})` : ''} submitted a ${leave.type.toLowerCase()} request.`,
        referenceId: leave._id,
        socketEvent: 'notification:new',
        pushData: { type: 'leave', leaveId: String(leave._id) },
      })));

      if (io) {
        wardens.forEach(warden => {
          io.to(`warden_${warden._id}`).emit('newLeaveRequest', {
            id: leave._id,
            studentName,
            type: leave.type,
            outDate: leave.outDate,
            inDate: leave.inDate,
            status: leave.status,
          });
        });
      }

      // Push to parent
      const parentRecord = await Parent.findOne({ studentId: student._id });
      if (parentRecord) {
        await notifyUser({
          institutionId: req.user.institutionId,
          userId: parentRecord.userId,
          type: 'leave',
          title: `${leave.type} Request Submitted`,
          message: `${studentName} has submitted a ${leave.type.toLowerCase()} request that needs your approval.`,
          referenceId: leave._id,
          socketEvent: 'notification:new',
          pushData: { type: 'leave', leaveId: String(leave._id) },
        });
      }
    } catch (socketError) {
      console.error('Socket emit error (leave):', socketError);
    }

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

    // Notify relevant parties about parent's decision
    try {
      const io = getIO();
      const studentName = populated.studentId?.userId?.name || 'Unknown';

      if (status === 'Approved') {
        // Notify wardens that leave is ready for final approval.
        const wardens = await User.find({ role: 'warden', institutionId: req.user.institutionId });
        await notifyUsers(wardens.map((warden) => ({
          institutionId: req.user.institutionId,
          userId: warden._id,
          type: 'leave',
          title: 'Leave Ready for Approval',
          message: `Parent approved ${studentName}'s ${populated.type.toLowerCase()} request. Awaiting warden approval.`,
          referenceId: leave._id,
          socketEvent: 'notification:new',
          pushData: { type: 'leave', leaveId: String(leave._id), status: populated.status },
        })));

        if (io) {
          wardens.forEach(warden => {
            io.to(`warden_${warden._id}`).emit('leaveReadyForApproval', {
              id: leave._id,
              studentName,
              type: populated.type,
              status: populated.status,
            });
          });
        }
      } else {
        // Parent rejected — notify student.
        if (populated.studentId?.userId?._id) {
          await notifyUser({
            institutionId: req.user.institutionId,
            userId: populated.studentId.userId._id,
            type: 'leave',
            title: 'Leave Request Rejected by Parent',
            message: `Your ${populated.type.toLowerCase()} request was rejected by your parent.`,
            referenceId: leave._id,
            socketEvent: 'notification:new',
            pushData: { type: 'leave', leaveId: String(leave._id), status: populated.status },
          });

          if (io) {
            io.to(`student_${populated.studentId.userId._id}`).emit('leaveStatusUpdated', {
              id: leave._id,
              status: populated.status,
              type: populated.type,
              updatedBy: 'parent',
            });
          }
        }
      }
    } catch (socketError) {
      console.error('Socket emit error (parent approval):', socketError);
    }

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

    // Notify student and parent about warden's decision.
    try {
      const io = getIO();
      const studentName = updated.studentId?.userId?.name || 'Unknown';
      const leaveType = updated.type || 'Leave';
      const notifTitle = status === 'Approved'
        ? `${leaveType} Request Approved`
        : `${leaveType} Request Rejected`;
      const notifBody = status === 'Approved'
        ? `Your ${leaveType.toLowerCase()} request has been approved by the warden.`
        : `Your ${leaveType.toLowerCase()} request was rejected by the warden.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`;

      // Notify student
      if (updated.studentId?.userId?._id) {
        await notifyUser({
          institutionId: req.user.institutionId,
          userId: updated.studentId.userId._id,
          type: 'leave',
          title: notifTitle,
          message: notifBody,
          referenceId: updated._id,
          socketEvent: 'notification:new',
          pushData: { type: 'leave', leaveId: String(updated._id), status },
        });

        if (io) {
          io.to(`student_${updated.studentId.userId._id}`).emit('leaveStatusUpdated', {
            id: updated._id,
            status: updated.status,
            type: updated.type,
            updatedBy: 'warden',
          });
        }
      }

      // Notify parent
      const parentRecord = await Parent.findOne({ studentId: updated.studentId?._id });
      if (parentRecord) {
        const parentBody = status === 'Approved'
          ? `${studentName}'s ${leaveType.toLowerCase()} request has been approved by the warden.`
          : `${studentName}'s ${leaveType.toLowerCase()} request was rejected by the warden.`;

        await notifyUser({
          institutionId: req.user.institutionId,
          userId: parentRecord.userId,
          type: 'leave',
          title: notifTitle,
          message: parentBody,
          referenceId: updated._id,
          socketEvent: 'notification:new',
          pushData: { type: 'leave', leaveId: String(updated._id), status },
        });

        if (io) {
          io.to(`parent_${parentRecord.userId}`).emit('leaveStatusUpdated', {
            id: updated._id,
            status: updated.status,
            type: updated.type,
            updatedBy: 'warden',
          });
        }
      }
    } catch (pushError) {
      console.error('Push error (warden leave decision):', pushError);
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