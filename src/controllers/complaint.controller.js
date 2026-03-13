import Complaint from '../models/Complaint.model.js';
import Student from '../models/Student.model.js';
import User from '../models/User.model.js';
import Notification from '../models/Notification.model.js';
import { getIO } from '../utils/socket.js';
import { sendPushNotification, sendPushNotifications } from '../services/pushNotification.service.js';

/**
 * @desc    Create a new complaint
 * @route   POST /api/complaints
 * @access  Private (Student only)
 */
export const createComplaint = async (req, res) => {
  try {
    const { title, description, category, priority = 'Medium' } = req.body;

    // Validate required fields
    if (!title || !description || !category) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title, description, and category',
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

    // Create complaint
    const complaint = await Complaint.create({
      studentId: student._id,
      institutionId: req.user.institutionId,
      title: title.trim(),
      description: description.trim(),
      category,
      priority,
      status: 'Pending',
    });

    // Populate student details
    await complaint.populate({
      path: 'studentId',
      select: 'userId room',
      populate: {
        path: 'userId',
        select: 'name',
      },
    });

    // NOTIFICATION: Notify all wardens about new complaint
    try {
      const wardens = await User.find({ role: 'warden', institutionId: req.user.institutionId });
      
      // Create notifications for all wardens
      const notifications = wardens.map(warden => ({
        institutionId: req.user.institutionId,
        userId: warden._id,
        type: 'complaint',
        title: 'New Complaint Received',
        message: `${complaint.studentId.userId.name} raised a complaint: "${title.trim()}"`,
        relatedId: complaint._id,
        isRead: false,
      }));

      if (notifications.length > 0) {
        await Notification.insertMany(notifications);
      }

      // Emit real-time socket notification to wardens
      const io = getIO();
      if (io) {
        wardens.forEach(warden => {
          io.to(`warden_${warden._id}`).emit('newComplaint', {
            id: complaint._id,
            title: complaint.title,
            studentName: complaint.studentId.userId.name,
            category: complaint.category,
            priority: complaint.priority,
            createdAt: complaint.createdAt,
          });
        });
      }

      // Push notifications to all wardens
      const wardenTokens = wardens.map(w => w.expoPushToken).filter(Boolean);
      const studentName = complaint.studentId.userId.name;
      const room = complaint.studentId.room || '';
      await sendPushNotifications(
        wardenTokens,
        'New Complaint Received',
        `${studentName}${room ? ` (Room ${room})` : ''}: ${title.trim()}`,
        { type: 'complaint', complaintId: String(complaint._id) }
      );
    } catch (notifError) {
      console.error('Notification error:', notifError);
      // Don't fail the request if notification fails
    }

    res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully',
      complaint: {
        id: complaint._id,
        title: complaint.title,
        description: complaint.description,
        category: complaint.category,
        status: complaint.status,
        priority: complaint.priority,
        createdAt: complaint.createdAt,
        student: {
          name: complaint.studentId.userId.name,
          room: complaint.studentId.room,
        },
      },
    });
  } catch (error) {
    console.error('Create complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating complaint',
    });
  }
};

/**
 * @desc    Get all complaints (for warden)
 * @route   GET /api/complaints
 * @access  Private (Warden only)
 */
export const getAllComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({ institutionId: req.user.institutionId })
      .populate({
        path: 'studentId',
        select: 'userId room',
        populate: {
          path: 'userId',
          select: 'name',
        },
      })
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1 });

    const formattedComplaints = complaints.map(complaint => {
      const studentName = complaint.studentId?.userId?.name || 'Unknown';
      const studentRoom = complaint.studentId?.room || 'N/A';
      return {
        id: complaint._id,
        title: complaint.title,
        description: complaint.description,
        category: complaint.category,
        status: complaint.status,
        priority: complaint.priority,
        createdAt: complaint.createdAt,
        resolvedAt: complaint.resolvedAt,
        resolution: complaint.resolution,
        // Top-level fields for easy frontend access
        studentName,
        studentRoom,
        // Nested object kept for backward compatibility
        student: {
          name: studentName,
          room: studentRoom,
        },
        assignedTo: complaint.assignedTo ? complaint.assignedTo.name : null,
      };
    });

    res.status(200).json({
      success: true,
      complaints: formattedComplaints,
    });
  } catch (error) {
    console.error('Get complaints error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching complaints',
    });
  }
};

/**
 * @desc    Get student's own complaints
 * @route   GET /api/complaints/my
 * @access  Private (Student only)
 */
export const getMyComplaints = async (req, res) => {
  try {
    // Get student details
    const student = await Student.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    const complaints = await Complaint.find({ studentId: student._id, institutionId: req.user.institutionId })
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1 });

    const formattedComplaints = complaints.map(complaint => ({
      id: complaint._id,
      title: complaint.title,
      description: complaint.description,
      category: complaint.category,
      status: complaint.status,
      priority: complaint.priority,
      createdAt: complaint.createdAt,
      resolvedAt: complaint.resolvedAt,
      resolution: complaint.resolution,
      assignedTo: complaint.assignedTo ? complaint.assignedTo.name : null,
    }));

    res.status(200).json({
      success: true,
      complaints: formattedComplaints,
    });
  } catch (error) {
    console.error('Get my complaints error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching complaints',
    });
  }
};

/**
 * @desc    Update complaint status (for warden)
 * @route   PUT /api/complaints/:id/status
 * @access  Private (Warden only)
 */
export const updateComplaintStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolution } = req.body;

    if (!['Resolved', 'Rejected', 'In Progress'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be Resolved, Rejected, or In Progress',
      });
    }

    const updateData = {
      status,
      assignedTo: req.user._id,
    };

    if (status === 'Resolved') {
      updateData.resolvedAt = new Date();
      updateData.resolution = resolution;
    }

    const complaint = await Complaint.findOneAndUpdate(
      { _id: id, institutionId: req.user.institutionId },
      updateData,
      { new: true }
    )
      .populate({
        path: 'studentId',
        select: 'userId room',
        populate: {
          path: 'userId',
          select: 'name',
        },
      })
      .populate('assignedTo', 'name');

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found',
      });
    }

    // Notify the student via socket that their complaint status changed
    try {
      const io = getIO();
      if (io && complaint.studentId?.userId?._id) {
        io.to(`student_${complaint.studentId.userId._id}`).emit('complaintStatusUpdated', {
          id: complaint._id,
          title: complaint.title,
          status: complaint.status,
        });
      }

      // Push notification to the student
      const studentUser = await User.findById(complaint.studentId?.userId?._id);
      if (studentUser?.expoPushToken) {
        const statusMsg = status === 'Resolved'
          ? `Your complaint "${complaint.title}" has been resolved.`
          : status === 'Rejected'
            ? `Your complaint "${complaint.title}" was rejected.`
            : `Your complaint "${complaint.title}" is now In Progress.`;
        await sendPushNotification(
          studentUser.expoPushToken,
          'Complaint Status Updated',
          statusMsg,
          { type: 'complaint', complaintId: String(complaint._id), status }
        );
      }
    } catch (socketError) {
      console.error('Socket emit error (complaint update):', socketError);
    }

    res.status(200).json({
      success: true,
      message: `Complaint ${status.toLowerCase()} successfully`,
      complaint: {
        id: complaint._id,
        title: complaint.title,
        description: complaint.description,
        category: complaint.category,
        status: complaint.status,
        priority: complaint.priority,
        createdAt: complaint.createdAt,
        resolvedAt: complaint.resolvedAt,
        resolution: complaint.resolution,
        student: {
          name: complaint.studentId?.userId?.name || 'Unknown',
          room: complaint.studentId?.room || 'N/A',
        },
        assignedTo: complaint.assignedTo?.name || null,
      },
    });
  } catch (error) {
    console.error('Update complaint status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating complaint',
    });
  }
};