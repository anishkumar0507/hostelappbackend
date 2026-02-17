import User from '../models/User.model.js';
import Institution from '../models/Institution.model.js';
import jwt from 'jsonwebtoken';
// Note: dotenv is loaded in server.js, process.env is available globally

/**
 * Generate JWT Token
 * @param {string} userId - User ID
 * @param {string} role - User role
 * @param {string} name - User name
 * @returns {string} JWT token
 */
const generateToken = (userId, role, name, isTempPassword = false, institutionId) => {
  return jwt.sign(
    { userId, role, name, isTempPassword, institutionId },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRE || '7d',
    }
  );
};

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * @desc    Register warden (warden only)
 * @route   POST /api/auth/warden-signup
 * @access  Public
 */
export const wardenSignup = async (req, res) => {
  try {
    const { name, email, password, institutionName } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and password',
      });
    }

    if (!institutionName) {
      return res.status(400).json({
        success: false,
        message: 'Please provide institution name',
      });
    }

    const normalizedName = institutionName.trim();
    const nameRegex = new RegExp(`^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    let institution = await Institution.findOne({ name: nameRegex });
    if (!institution) {
      institution = await Institution.create({
        name: normalizedName,
        isActive: true,
      });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }

    // Validate name
    if (name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Name must be at least 2 characters long',
      });
    }

    // Check if user already exists
    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({
      email: normalizedEmail,
      institutionId: institution._id,
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    // Create warden user
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: 'warden',
      institutionId: institution._id,
    });

    // Generate token
    const token = generateToken(user._id, user.role, user.name, false, user.institutionId);

    res.status(201).json({
      success: true,
      message: 'Warden account created successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        institutionId: user.institutionId,
      },
      institution: {
        id: institution._id,
        name: institution.name,
      },
    });
  } catch (error) {
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', '),
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error during registration',
    });
  }
};

/**
 * @desc    Login user (student or warden)
 * @route   POST /api/auth/login
 * @access  Public
 */
export const login = async (req, res) => {
  try {
    const { email, password, institutionName } = req.body;

    // Validate input
    if (!email || !password || !institutionName) {
      return res.status(400).json({
        success: false,
        message: 'Please provide institution name, email, and password',
      });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
    }

    // Check if user exists and get password
    const normalizedInstitutionName = institutionName.trim();
    const institutionRegex = new RegExp(`^${normalizedInstitutionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const institution = await Institution.findOne({ name: institutionRegex, isActive: true });
    if (!institution) {
      return res.status(404).json({
        success: false,
        message: 'Institution not found',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({
      email: normalizedEmail,
      institutionId: institution._id,
    }).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check password
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Check if user is using temporary password
    if (user.isTempPassword) {
      // Return token but flag that password change is required
      const token = generateToken(user._id, user.role, user.name, true, user.institutionId);
      return res.status(200).json({
        success: true,
        token,
        requiresPasswordChange: true,
        forcePasswordChange: true, // Explicit flag for mandatory change
        message: 'Please change your temporary password',
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          institutionId: user.institutionId,
        },
        institution: {
          id: institution._id,
          name: institution.name,
        },
      });
    }

    // Generate token with userId, role, and name (isTempPassword = false)
    const token = generateToken(user._id, user.role, user.name, false, user.institutionId);

    res.status(200).json({
      success: true,
      token,
      requiresPasswordChange: false,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        institutionId: user.institutionId,
      },
      institution: {
        id: institution._id,
        name: institution.name,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error during login',
    });
  }
};

/**
 * @desc    Change password (for users with temporary password)
 * @route   PUT /api/auth/change-password
 * @access  Private
 */
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current password and new password',
      });
    }

    // Validate new password length
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long',
      });
    }

    // Get user with password
    const user = await User.findById(req.user._id).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Verify current password
    const isMatch = await user.matchPassword(currentPassword);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    // Check if new password is same as current
    const isSamePassword = await user.matchPassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from current password',
      });
    }

    // Update password and clear temporary flag
    user.password = newPassword;
    user.isTempPassword = false;
    await user.save();

    // Generate new token without isTempPassword flag
    const newToken = generateToken(user._id, user.role, user.name, false);

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
      token: newToken, // Return new token with updated isTempPassword flag
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error during password change',
    });
  }
};
