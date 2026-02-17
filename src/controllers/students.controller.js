import Student from '../models/Student.model.js';
import StudentLocation from '../models/StudentLocation.model.js';

/**
 * @desc    Warden: Get all students with their latest locations
 * @route   GET /api/students/with-locations
 * @access  Private (Warden only)
 */
export const getAllStudentsWithLocations = async (req, res) => {
  try {
    const students = await Student.find().populate('userId', 'name email role');

    // Fetch location for each student
    const studentsWithLocations = await Promise.all(
      students.map(async (student) => {
        const loc = await StudentLocation.findOne({ studentId: student._id });
        return {
          _id: student._id,
          userId: student.userId,
          rollNumber: student.rollNumber,
          room: student.room,
          section: student.section,
          class: student.class,
          phone: student.phone,
          locationTrackingEnabled: student.locationTrackingEnabled,
          location: loc ? {
            lat: loc.lat,
            lng: loc.lng,
            accuracy: loc.accuracy,
            lastUpdated: loc.lastUpdated,
            isSharingEnabled: loc.isSharingEnabled,
            permissionGranted: loc.permissionGranted,
          } : null,
        };
      })
    );

    res.status(200).json({ success: true, data: studentsWithLocations });
  } catch (error) {
    console.error('❌ Error fetching students with locations:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};
