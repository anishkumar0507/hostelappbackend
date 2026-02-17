import Complaint from '../models/Complaint.model.js';
import Student from '../models/Student.model.js';

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
    await complaint.populate('studentId', 'userId room');
    await complaint.populate('studentId.userId', 'name');

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
      .populate('studentId', 'userId room')
      .populate('studentId.userId', 'name')
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
      student: {
        name: complaint.studentId.userId.name,
        room: complaint.studentId.room,
      },
      assignedTo: complaint.assignedTo ? complaint.assignedTo.name : null,
    }));

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
    ).populate('studentId', 'userId room')
     .populate('studentId.userId', 'name')
     .populate('assignedTo', 'name');

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found',
      });
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
          name: complaint.studentId.userId.name,
          room: complaint.studentId.room,
        },
        assignedTo: complaint.assignedTo.name,
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