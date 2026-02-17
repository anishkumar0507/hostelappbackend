import User from '../models/User.model.js';

/**
 * Middleware to check if user has temporary password
 * Forces password change before accessing protected routes
 */
export const requirePasswordChange = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized',
      });
    }

    // Check if user has temporary password
    // Students and parents use temp passwords on first login
    if (req.user.role === 'student' || req.user.role === 'parent') {
      const user = await User.findById(req.user._id);
      if (user && user.isTempPassword) {
        return res.status(403).json({
          success: false,
          message: 'Password change required. Please change your temporary password first.',
          requiresPasswordChange: true,
        });
      }
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};
