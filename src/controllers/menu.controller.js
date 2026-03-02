import Menu from '../models/Menu.model.js';
import MenuVote from '../models/MenuVote.model.js';
import MenuReview from '../models/MenuReview.model.js';
import Student from '../models/Student.model.js';

/**
 * @desc    Create new daily menu
 * @route   POST /api/menu
 * @access  Private (Warden only)
 */
export const createMenu = async (req, res) => {
  try {
    const { menuDate, meals } = req.body;

    // Validate warden
    if (req.user.role !== 'warden') {
      return res.status(403).json({
        success: false,
        message: 'Only wardens can create menu items',
      });
    }

    if (!menuDate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide menu date',
      });
    }

    // Check if menu already exists for this date
    const existingMenu = await Menu.findOne({
      institutionId: req.user.institutionId,
      menuDate: new Date(menuDate),
    });

    if (existingMenu) {
      return res.status(400).json({
        success: false,
        message: 'Menu for this date already exists',
      });
    }

    const menu = await Menu.create({
      institutionId: req.user.institutionId,
      menuDate: new Date(menuDate),
      meals: meals || {},
      createdBy: req.user._id,
      status: 'draft',
    });

    res.status(201).json({
      success: true,
      message: 'Menu created successfully',
      data: menu,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Get all menus (with optional filters)
 * @route   GET /api/menu?startDate=&endDate=&status=
 * @access  Private (Student/Parent/Warden)
 */
export const getMenus = async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;

    let filter = {
      institutionId: req.user.institutionId,
    };

    if (startDate && endDate) {
      filter.menuDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    if (status) {
      filter.status = status;
    }

    // Students only see published menus
    if (req.user.role === 'student') {
      filter.status = 'published';
    }

    const menus = await Menu.find(filter)
      .populate('createdBy', 'name email')
      .sort({ menuDate: -1 });

    res.status(200).json({
      success: true,
      data: menus,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Get single menu with voting stats and reviews
 * @route   GET /api/menu/:id
 * @access  Private
 */
export const getMenuById = async (req, res) => {
  try {
    const { id } = req.params;

    const menu = await Menu.findById(id).populate('createdBy', 'name email');

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: 'Menu not found',
      });
    }

    // Students can only see published menus
    if (req.user.role === 'student' && menu.status !== 'published') {
      return res.status(403).json({
        success: false,
        message: 'Menu not yet published',
      });
    }

    // Get voting statistics for each meal
    const votes = await MenuVote.find({ menuId: id });
    const reviews = await MenuReview.find({ menuId: id })
      .populate('studentId', 'name')
      .populate('userId', 'name')
      .sort({ createdAt: -1 });

    const mealStats = {};
    const mealTypes = ['Breakfast', 'Lunch', 'Snacks', 'Dinner'];

    mealTypes.forEach((mealType) => {
      const mealVotes = votes.filter((v) => v.mealType === mealType);
      const mealReviews = reviews.filter((r) => r.mealType === mealType);
      
      mealStats[mealType.toLowerCase()] = {
        totalVotes: mealVotes.length,
        likes: mealVotes.filter((v) => v.voteType === 'like').length,
        dislikes: mealVotes.filter((v) => v.voteType === 'dislike').length,
        averageRating: mealVotes.length > 0
          ? (mealVotes.reduce((sum, v) => sum + v.rating, 0) / mealVotes.length).toFixed(1)
          : 0,
        reviews: mealReviews,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        ...menu._doc,
        stats: mealStats,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Update menu (Warden only)
 * @route   PUT /api/menu/:id
 * @access  Private (Warden only)
 */
export const updateMenu = async (req, res) => {
  try {
    if (req.user.role !== 'warden') {
      return res.status(403).json({
        success: false,
        message: 'Only wardens can update menu items',
      });
    }

    const { id } = req.params;
    const { menuDate, meals, status } = req.body;

    let menu = await Menu.findById(id);

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: 'Menu not found',
      });
    }

    // Check if warden belongs to same institution
    if (menu.institutionId.toString() !== req.user.institutionId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You cannot update this menu',
      });
    }

    if (menuDate) menu.menuDate = new Date(menuDate);
    if (meals) menu.meals = meals;
    if (status) menu.status = status;

    menu = await menu.save();

    res.status(200).json({
      success: true,
      message: 'Menu updated successfully',
      data: menu,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Delete menu (Warden only)
 * @route   DELETE /api/menu/:id
 * @access  Private (Warden only)
 */
export const deleteMenu = async (req, res) => {
  try {
    if (req.user.role !== 'warden') {
      return res.status(403).json({
        success: false,
        message: 'Only wardens can delete menu items',
      });
    }

    const { id } = req.params;

    const menu = await Menu.findById(id);

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: 'Menu not found',
      });
    }

    // Check if warden created this menu
    if (menu.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,belongs to same institution
    if (menu.institutionId.toString() !== req.user.institutionId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You cannot delete this menu',
      });
    }

    // Delete votes and reviews associated with this menu
    await MenuVote.deleteMany({ menuId: id });
    await MenuReview
    res.status(200).json({
      success: true,
      message: 'Menu deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**meal (Student only)
 * @route   POST /api/menu/:id/vote
 * @access  Private (Student only)
 */
export const voteOnMenu = async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Only students can vote on menus',
      });
    }

    const { id: menuId } = req.params;
    const { mealType, voteType, rating } = req.body;

    if (!['Breakfast', 'Lunch', 'Snacks', 'Dinner'].includes(mealType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid meal type',
      });
    }

    if (!['like', 'dislike'].includes(voteType)) {
      return res.status(400).json({
        success: false,
        message: 'Vote type must be like or dislike',
      });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5',
      });
    }

    // Check if menu exists
    const menu = await Menu.findById(menuId);
    if (!menu) {
      return res.status(404).json({
        success: false,
        message: 'Menu not found',
      });
    }

    if (menu.status !== 'published') {
      return res.status(403).json({
        success: false,
        message: 'Cannot vote on unpublished menu',
      });
    }

    // Get student info
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    // Check if student already voted
    let existingVote = await MenuVote.findOne({
      menuId,
      studentId: student._id,
      mealType,
    });

    if (existingVote) {
      // Update existing vote
      existingVote.voteType = voteType;
      existingVote.rating = rating;
      await existingVote.save();

      return res.status(200).json({
        success: true,
        message: 'Vote updated successfully',
        data: existingVote,
      });
    }

    // Create new vote
    const newVote = await MenuVote.create({
      institutionId: req.user.institutionId,
      menuId,
      studentId: student._id,
      userId: req.user._id,
      mealType,
      voteType,
      rating,
    });

    res.status(201).json({
      success: true,
      message: 'Vote recorded successfully',
      data: newVote,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Get voting statistics for a menu
 * @route   GET /api/menu/:id/stats
 * @access  Private
 */
export const getMenuStats = async (req, res) => {
  try {
    const { id: menuId } = req.params;
    const { mealType } = req.query;

    if (!['Breakfast', 'Lunch', 'Snacks', 'Dinner'].includes(mealType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid meal type',
      });
    }

    const votes = await MenuVote.find({ menuId, mealType });

    if (votes.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          totalVotes: 0,
          likes: 0,
          dislikes: 0,
          averageRating: 0,
          ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          likePercentage: 0,
        },
      });
    }

    const ratingDistribution = {
      1: votes.filter((v) => v.rating === 1).length,
      2: votes.filter((v) => v.rating === 2).length,
      3: votes.filter((v) => v.rating === 3).length,
      4: votes.filter((v) => v.rating === 4).length,
      5: votes.filter((v) => v.rating === 5).length,
    };

    const likes = votes.filter((v) => v.voteType === 'like').length;
    const dislikes = votes.filter((v) => v.voteType === 'dislike').length;

    res.status(200).json({
      success: true,
      data: {
        totalVotes: votes.length,
        likes,
        dislikes,
        likePercentage: ((likes / votes.length) * 100).toFixed(1),
        averageRating: (votes.reduce((sum, v) => sum + v.rating, 0) / votes.length).toFixed(1),
        ratingDistribution,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Get student's own vote on a menu meal
 * @route   GET /api/menu/:id/my-vote?mealType=
 * @access  Private (Student only)
 */
export const getMyVote = async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Only students can get their votes',
      });
    }

    const { id: menuId } = req.params;
    const { mealType } = req.query;

    if (!['Breakfast', 'Lunch', 'Snacks', 'Dinner'].includes(mealType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid meal type',
      });
    }

    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    const vote = await MenuVote.findOne({
      menuId,
      studentId: student._id,
      mealType,
    });

    res.status(200).json({
      success: true,
      data: vote,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Get today's menu
 * @route   GET /api/menu/today
 * @access  Private
 */
export const getTodayMenu = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let filter = {
      institutionId: req.user.institutionId,
      menuDate: {
        $gte: today,
        $lt: tomorrow,
      },
    };

    // Students only see published menus
    if (req.user.role === 'student') {
      filter.status = 'published';
    }

    const menu = await Menu.findOne(filter).populate('createdBy', 'name email');

    if (!menu) {
      return res.status(200).json({
        success: true,
        data: null,
        message: 'No menu uploaded for today',
      });
    }

    // Get voting statistics for each meal
    const votes = await MenuVote.find({ menuId: menu._id });
    const reviews = await MenuReview.find({ menuId: menu._id })
      .populate('studentId', 'name')
      .populate('userId', 'name')
      .sort({ createdAt: -1 });

    const mealStats = {};
    const mealTypes = ['Breakfast', 'Lunch', 'Snacks', 'Dinner'];

    mealTypes.forEach((mealType) => {
      const mealVotes = votes.filter((v) => v.mealType === mealType);
      const mealReviews = reviews.filter((r) => r.mealType === mealType);
      
      const likes = mealVotes.filter((v) => v.voteType === 'like').length;
      const totalVotes = mealVotes.length;
      
      mealStats[mealType.toLowerCase()] = {
        totalVotes,
        likes,
        dislikes: mealVotes.filter((v) => v.voteType === 'dislike').length,
        likePercentage: totalVotes > 0 ? ((likes / totalVotes) * 100).toFixed(1) : 0,
        averageRating: mealVotes.length > 0
          ? (mealVotes.reduce((sum, v) => sum + v.rating, 0) / mealVotes.length).toFixed(1)
          : 0,
        reviewCount: mealReviews.length,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        ...menu._doc,
        stats: mealStats,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Add review for a menu meal
 * @route   POST /api/menu/:id/review
 * @access  Private (Student only)
 */
export const addReview = async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Only students can add reviews',
      });
    }

    const { id: menuId } = req.params;
    const { mealType, comment, rating } = req.body;

    if (!['Breakfast', 'Lunch', 'Snacks', 'Dinner'].includes(mealType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid meal type',
      });
    }

    if (!comment || comment.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a comment',
      });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5',
      });
    }

    // Check if menu exists
    const menu = await Menu.findById(menuId);
    if (!menu) {
      return res.status(404).json({
        success: false,
        message: 'Menu not found',
      });
    }

    if (menu.status !== 'published') {
      return res.status(403).json({
        success: false,
        message: 'Cannot review unpublished menu',
      });
    }

    // Get student info
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    const review = await MenuReview.create({
      institutionId: req.user.institutionId,
      menuId,
      studentId: student._id,
      userId: req.user._id,
      mealType,
      comment: comment.trim(),
      rating,
    });

    const populatedReview = await MenuReview.findById(review._id)
      .populate('studentId', 'name')
      .populate('userId', 'name');

    res.status(201).json({
      success: true,
      message: 'Review added successfully',
      data: populatedReview,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Get reviews for a menu meal
 * @route   GET /api/menu/:id/reviews?mealType=
 * @access  Private
 */
export const getReviews = async (req, res) => {
  try {
    const { id: menuId } = req.params;
    const { mealType } = req.query;

    let filter = { menuId };

    if (mealType && ['Breakfast', 'Lunch', 'Snacks', 'Dinner'].includes(mealType)) {
      filter.mealType = mealType;
    }

    const reviews = await MenuReview.find(filter)
      .populate('studentId', 'name')
      .populate('userId', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: reviews,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Publish menu (Warden only)
 * @route   POST /api/menu/:id/publish
 * @access  Private (Warden only)
 */
export const publishMenu = async (req, res) => {
  try {
    if (req.user.role !== 'warden') {
      return res.status(403).json({
        success: false,
        message: 'Only wardens can publish menus',
      });
    }

    const { id } = req.params;

    let menu = await Menu.findById(id);

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: 'Menu not found',
      });
    }

    if (menu.institutionId.toString() !== req.user.institutionId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You cannot publish this menu',
      });
    }

    menu.status = 'published';
    await menu.save();

    res.status(200).json({
      success: true,
      message: 'Menu published successfully',
      data: menu,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
