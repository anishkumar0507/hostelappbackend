import express from 'express';
import User from '../models/User.model.js';
import Student from '../models/Student.model.js';
import { protect, authorize } from '../middleware/auth.middleware.js';
import bcrypt from 'bcryptjs';

const router = express.Router();

// @route   GET /api/students/profile
// @desc    Get student's own profile
// @access  Private (Student only)
router.get('/profile', protect, authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id })
      .populate('userId', 'name email role');

    if (!student) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    res.json(student);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/students
// @desc    Get all students (warden only)
// @access  Private (Warden only)
router.get('/', protect, authorize('warden'), async (req, res) => {
  try {
    const students = await Student.find()
      .populate('userId', 'name email role')
      .sort({ createdAt: -1 });

    res.json(students);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/students/:id
// @desc    Get student by ID (warden only)
// @access  Private (Warden only)
router.get('/:id', protect, authorize('warden'), async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('userId', 'name email role');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.json(student);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/students
// @desc    Create new student account (warden only)
// @access  Private (Warden only)
router.post('/', protect, authorize('warden'), async (req, res) => {
  try {
    const { name, email, password, studentId, room, class: studentClass, phone, address, emergencyContact } = req.body;

    // Validate required fields
    if (!name || !email || !password || !studentId) {
      return res.status(400).json({ message: 'Please provide name, email, password, and studentId' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Check if studentId already exists
    const existingStudent = await Student.findOne({ studentId });
    if (existingStudent) {
      return res.status(400).json({ message: 'Student with this studentId already exists' });
    }

    // Create user account
    const user = await User.create({
      name,
      email,
      password,
      role: 'student',
    });

    // Create student profile
    const student = await Student.create({
      userId: user._id,
      studentId,
      room,
      class: studentClass,
      phone,
      address,
      emergencyContact,
    });

    // Populate and return
    const populatedStudent = await Student.findById(student._id)
      .populate('userId', 'name email role');

    res.status(201).json({
      message: 'Student account created successfully',
      student: populatedStudent,
      credentials: {
        email,
        password, // In production, send this via secure channel
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/students/:id
// @desc    Update student details (warden only)
// @access  Private (Warden only)
router.put('/:id', protect, authorize('warden'), async (req, res) => {
  try {
    const { name, email, studentId, room, class: studentClass, phone, address, emergencyContact } = req.body;

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Update student profile
    if (studentId) student.studentId = studentId;
    if (room !== undefined) student.room = room;
    if (studentClass !== undefined) student.class = studentClass;
    if (phone !== undefined) student.phone = phone;
    if (address !== undefined) student.address = address;
    if (emergencyContact !== undefined) student.emergencyContact = emergencyContact;

    await student.save();

    // Update user if name or email provided
    if (name || email) {
      const user = await User.findById(student.userId);
      if (name) user.name = name;
      if (email) {
        // Check if email already exists
        const existingUser = await User.findOne({ email, _id: { $ne: user._id } });
        if (existingUser) {
          return res.status(400).json({ message: 'Email already in use' });
        }
        user.email = email;
      }
      await user.save();
    }

    const updatedStudent = await Student.findById(student._id)
      .populate('userId', 'name email role');

    res.json({
      message: 'Student updated successfully',
      student: updatedStudent,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/students/:id/credentials
// @desc    Generate/update login credentials (warden only)
// @access  Private (Warden only)
router.put('/:id/credentials', protect, authorize('warden'), async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: 'Please provide a new password' });
    }

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Update password
    const user = await User.findById(student.userId);
    user.password = password; // Will be hashed by pre-save hook
    await user.save();

    res.json({
      message: 'Login credentials updated successfully',
      credentials: {
        email: user.email,
        password, // In production, send this via secure channel
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   DELETE /api/students/:id
// @desc    Delete student (warden only)
// @access  Private (Warden only)
router.delete('/:id', protect, authorize('warden'), async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Delete user account
    await User.findByIdAndDelete(student.userId);

    // Delete student profile
    await Student.findByIdAndDelete(req.params.id);

    res.json({ message: 'Student deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
