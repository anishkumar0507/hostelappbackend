import express from 'express';
import {
  getMyProfile,
  getAllStudents,
  getStudentById,
  lookupStudent,
  createStudent,
  updateStudent,
  deleteStudent,
  getAllStudentsWithLocations,
  deleteStudentEverywhere,
} from '../controllers/student.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';
import { requirePasswordChange } from '../middleware/requirePasswordChange.middleware.js';

const router = express.Router();

/**
 * @route   GET /api/students/profile
 * @desc    Get student's own profile
 * @access  Private (Student only, password change required if temp password)
 */
router.get('/profile', protect, authorize('student'), requirePasswordChange, getMyProfile);

/**
 * @route   GET /api/students/locations/all
 * @desc    Get all students with their live locations (warden dashboard)
 * @access  Private (Warden only)
 */
router.get('/locations/all', protect, authorize('warden'), getAllStudentsWithLocations);

/**
 * @route   GET /api/students
 * @desc    Get all students
 * @access  Private (Warden only)
 */
router.get('/', protect, authorize('warden'), getAllStudents);

/**
 * @route   GET /api/students/lookup
 * @desc    Lookup student by roll number or id (warden only)
 * @access  Private (Warden only)
 */
router.get('/lookup', protect, authorize('warden'), lookupStudent);

/**
 * @route   POST /api/students
 * @desc    Create new student account
 * @access  Private (Warden only)
 */
router.post('/', protect, authorize('warden'), createStudent);

/**
 * @route   GET /api/students/:id
 * @desc    Get student by ID
 * @access  Private (Warden only)
 */
router.get('/:id', protect, authorize('warden'), getStudentById);

/**
 * @route   PUT /api/students/:id
 * @desc    Update student details
 * @access  Private (Warden only)
 */
router.put('/:id', protect, authorize('warden'), updateStudent);

/**
 * @route   DELETE /api/students/:id
 * @desc    Delete student account
 * @access  Private (Warden only)
 */
router.delete('/:id', protect, authorize('warden'), deleteStudent);

/**
 * @route   DELETE /api/students/:id/delete-all
 * @desc    Delete student and related records
 * @access  Private (Warden only)
 */
router.delete('/:id/delete-all', protect, authorize('warden'), deleteStudentEverywhere);

export default router;
