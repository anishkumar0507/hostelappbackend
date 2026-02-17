import StudentLocation from '../models/StudentLocation.model.js';
import StudentLocationHistory from '../models/StudentLocationHistory.model.js';
import Student from '../models/Student.model.js';
import Parent from '../models/Parent.model.js';

/**
 * @desc    Student: Toggle location sharing on/off
 * @route   PUT /api/location/toggle
 * @access  Private (Student only)
 */
export const toggleLocationSharing = async (req, res) => {
  try {
    // Students are no longer allowed to toggle tracking. Return forbidden.
    return res.status(403).json({
      success: false,
      message: 'Students cannot toggle location tracking. Contact your warden.',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Warden: Enable/Disable location tracking for a student
 * @route   PUT /api/location/:studentId/tracking
 * @access  Private (Warden only)
 */
export const setTrackingForStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Please provide enabled: true|false' });
    }

    const student = await Student.findOne({ _id: studentId, institutionId: req.user.institutionId });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    student.locationTrackingEnabled = enabled;
    await student.save();

    // If disabling, clear any existing location record
    if (!enabled) {
      const loc = await StudentLocation.findOne({ studentId: student._id, institutionId: student.institutionId });
      if (loc) {
        loc.isSharingEnabled = false;
        loc.lat = undefined;
        loc.lng = undefined;
        loc.lastUpdated = undefined;
        await loc.save();
      }
    } else {
      // ensure a StudentLocation exists and isSharingEnabled reflects student setting
      let loc = await StudentLocation.findOne({ studentId: student._id, institutionId: student.institutionId });
      if (!loc) {
        loc = await StudentLocation.create({ studentId: student._id, institutionId: student.institutionId, isSharingEnabled: true });
      } else {
        loc.isSharingEnabled = true;
        await loc.save();
      }
    }

    res.status(200).json({ success: true, data: { locationTrackingEnabled: student.locationTrackingEnabled } });
  } catch (error) {
    console.error('❌ Error setting tracking:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

/**
 * @desc    Student: Update last known location
 * @route   PUT /api/location/update
 * @access  Private (Student only)
 */
export const updateLocation = async (req, res) => {
  try {
    const { lat, lng, accuracy } = req.body;

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'Please provide valid lat and lng',
      });
    }

    const student = await Student.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    // Only allow update if the warden has enabled location tracking for this student
    if (!student.locationTrackingEnabled) {
      return res.status(400).json({ success: false, message: 'Location tracking is disabled by the warden' });
    }

    let loc = await StudentLocation.findOne({ studentId: student._id, institutionId: req.user.institutionId });
    if (!loc) {
      loc = await StudentLocation.create({
        studentId: student._id,
        institutionId: req.user.institutionId,
        isSharingEnabled: true,
        lat,
        lng,
        accuracy,
        lastUpdated: new Date(),
      });
    } else {
      if (!loc.isSharingEnabled) {
        // sync with student setting
        loc.isSharingEnabled = true;
      }
      loc.lat = lat;
      loc.lng = lng;
      if (typeof accuracy === 'number') loc.accuracy = accuracy;
      loc.lastUpdated = new Date();
      await loc.save();
    }

    // Append to history for trail visualization (and keep only last 30 days)
    try {
      await StudentLocationHistory.create({
        studentId: student._id,
        institutionId: req.user.institutionId,
        lat,
        lng,
        accuracy,
        timestamp: new Date(),
      });
      // cleanup: remove older than 30 days for this student
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await StudentLocationHistory.deleteMany({
        studentId: student._id,
        institutionId: req.user.institutionId,
        timestamp: { $lt: cutoff },
      });
    } catch (hErr) {
      console.error('❌ Failed to write location history:', hErr);
    }

    // Emit real-time update via WebSocket (if available)
    try {
      const { getIO } = await import('../utils/socket.js');
      const io = getIO();
      const payload = {
        studentId: student._id,
        lat,
        lng,
        accuracy: typeof accuracy === 'number' ? accuracy : null,
        lastUpdated: loc.lastUpdated,
      };
      if (io) {
        const room = `institution:${student.institutionId}`;
        io.to(room).emit('location:update', payload);
      }
    } catch (emitErr) {
      console.error('❌ Failed to emit socket update:', emitErr);
    }

    res.status(200).json({
      success: true,
      data: {
        lat: loc.lat,
        lng: loc.lng,
        accuracy: loc.accuracy,
        lastUpdated: loc.lastUpdated,
        isSharingEnabled: loc.isSharingEnabled,
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
 * @desc    Student: Get own location sharing status
 * @route   GET /api/location/me
 * @access  Private (Student only)
 */
export const getMyLocationStatus = async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    const loc = await StudentLocation.findOne({ studentId: student._id, institutionId: req.user.institutionId });
    res.status(200).json({
      success: true,
      data: {
        isSharingEnabled: loc?.isSharingEnabled ?? false,
        lastUpdated: loc?.lastUpdated || null,
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
 * @desc    Warden/Parent: Get student location (if sharing enabled)
 * @route   GET /api/location/:studentId
 * @access  Private (Warden or Parent of that student)
 */
export const getStudentLocation = async (req, res) => {
  try {
    const { studentId } = req.params;

    if (req.user.role === 'parent') {
      const parent = await Parent.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
      if (!parent || parent.studentId.toString() !== studentId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this student location',
        });
      }
    }
    // Warden can view any student

    if (req.user.role === 'warden') {
      const student = await Student.findOne({ _id: studentId, institutionId: req.user.institutionId });
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }
    }

    const loc = await StudentLocation.findOne({ studentId, institutionId: req.user.institutionId });
    if (!loc || !loc.isSharingEnabled) {
      return res.status(200).json({
        success: true,
        data: {
          isSharingEnabled: false,
          message: 'Location sharing is not enabled',
        },
      });
    }

    if (!loc.lat || !loc.lng) {
      return res.status(200).json({
        success: true,
        data: {
          isSharingEnabled: true,
          lat: null,
          lng: null,
          lastUpdated: null,
          message: 'No location data yet',
        },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        isSharingEnabled: true,
        lat: loc.lat,
        lng: loc.lng,
        lastUpdated: loc.lastUpdated,
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
 * @desc    Warden/Parent: Get student's location history (last 24 hours)
 * @route   GET /api/location/:studentId/history
 * @access  Private (Warden or Parent of that student)
 */
export const getStudentLocationHistory = async (req, res) => {
  try {
    const { studentId } = req.params;

    if (req.user.role === 'parent') {
      const parent = await Parent.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
      if (!parent || parent.studentId.toString() !== studentId) {
        return res.status(403).json({ success: false, message: 'Not authorized to view this student location history' });
      }
    }

    if (req.user.role === 'warden') {
      const student = await Student.findOne({ _id: studentId, institutionId: req.user.institutionId });
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }
    }

    // default: last 30 days unless `since` query provided
    const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const points = await StudentLocationHistory.find({
      studentId,
      institutionId: req.user.institutionId,
      timestamp: { $gte: since },
    }).sort({ timestamp: 1 });

    res.status(200).json({ success: true, data: { points } });
  } catch (error) {
    console.error('❌ Error fetching location history:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

/**
 * @desc    Student: Report permission status (granted/denied) to backend
 * @route   POST /api/location/permission
 * @access  Private (Student only)
 */
export const reportPermission = async (req, res) => {
  try {
    const { permissionGranted } = req.body;
    const student = await Student.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    let loc = await StudentLocation.findOne({ studentId: student._id, institutionId: req.user.institutionId });
    if (!loc) {
      loc = await StudentLocation.create({
        studentId: student._id,
        institutionId: req.user.institutionId,
        isSharingEnabled: false,
        permissionGranted: !!permissionGranted,
      });
    } else {
      loc.permissionGranted = !!permissionGranted;
      // if permission revoked, mark not sharing
      if (!permissionGranted) loc.isSharingEnabled = false;
      await loc.save();
    }

    res.status(200).json({ success: true, data: { permissionGranted: loc.permissionGranted } });
  } catch (error) {
    console.error('❌ Error reporting permission:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};
