import Menu from '../models/Menu.model.js';
import MenuVote from '../models/MenuVote.model.js';
import MenuReview from '../models/MenuReview.model.js';
import Student from '../models/Student.model.js';
import Poll from '../models/Poll.model.js';
import PollVote from '../models/PollVote.model.js';

/**
 * @desc    Get all polls with voter details per option
 * @route   GET /api/menu/poll?status=
 * @access  Private
 */
export const getPolls = async (req, res) => {
  try {
    const { status } = req.query;

    const pollFilter = {
      institutionId: req.user.institutionId,
    };
    if (status) {
      pollFilter.status = status;
    }

    const polls = await Poll.find(pollFilter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    const pollIds = polls.map((poll) => poll._id);
    const pollVotes = pollIds.length
      ? await PollVote.find({ pollId: { $in: pollIds } })
          .lean()
      : [];

    const pollsWithDetails = polls.map((poll) => {
      const votesForPoll = pollVotes.filter((vote) => String(vote.pollId) === String(poll._id));

      // Build options with voter details
      const options = (poll.options || []).map((option) => {
        const optionVotes = votesForPoll.filter((vote) => vote.optionId === option.id);
        const totalVotes = optionVotes.length;

        return {
          optionId: option.id,
          optionName: option.text,
          totalVotes,
          percentage: pollVotes.length > 0 ? Math.round((totalVotes / votesForPoll.length) * 100) : 0,
          voters: optionVotes.map((vote) => ({
            studentId: vote.studentId,
            studentName: vote.studentName,
            createdAt: vote.createdAt,
          })),
        };
      });

      return {
        pollId: poll._id,
        title: poll.title,
        description: poll.description,
        status: poll.status,
        createdAt: poll.createdAt,
        options,
      };
    });

    return res.status(200).json({
      success: true,
      data: pollsWithDetails,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Get menu feedback (likes/dislikes for specific menu and meal type)
 * @route   GET /api/menu/:id/feedback?mealType=
 * @access  Private
 */
export const getMenuFeedback = async (req, res) => {
  try {
    const { id: menuId } = req.params;
    const { mealType } = req.query;

    if (!mealType || !['Breakfast', 'Lunch', 'Snacks', 'Dinner'].includes(mealType)) {
      return res.status(400).json({
        success: false,
        message: 'Valid mealType is required: Breakfast, Lunch, Snacks, or Dinner',
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

    // Get votes for this menu and meal type
    const votes = await MenuVote.find({
      menuId,
      mealType,
      institutionId: req.user.institutionId,
    }).lean();

    // Separate likes and dislikes
    const likedVotes = votes.filter((vote) => vote.voteType === 'like');
    const dislikedVotes = votes.filter((vote) => vote.voteType === 'dislike');

    const totalLikes = likedVotes.length;
    const totalDislikes = dislikedVotes.length;
    const totalVotes = totalLikes + totalDislikes;

    const likePercentage = totalVotes > 0 ? Math.round((totalLikes / totalVotes) * 100) : 0;
    const dislikePercentage = totalVotes > 0 ? Math.round((totalDislikes / totalVotes) * 100) : 0;

    // Build student lists
    const likedBy = likedVotes.map((vote) => ({
      studentId: vote.studentId,
      studentName: vote.studentName,
      createdAt: vote.createdAt,
    }));

    const dislikedBy = dislikedVotes.map((vote) => ({
      studentId: vote.studentId,
      studentName: vote.studentName,
      createdAt: vote.createdAt,
    }));

    return res.status(200).json({
      success: true,
      data: {
        menuId,
        mealType,
        totalLikes,
        totalDislikes,
        totalVotes,
        likePercentage,
        dislikePercentage,
        likedBy,
        dislikedBy,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

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

    console.log('✅ Menu created:', {
      _id: menu._id,
      date: menu.menuDate,
      status: menu.status,
      mealsKeys: Object.keys(menu.meals || {}),
      dinnerDishes: menu.meals?.dinner?.dishes?.length || 0,
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

    // Wardens see ALL menus (draft + published)
    // Students only see published menus
    if (req.user.role === 'student') {
      filter.status = 'published';
    } else if (status) {
      // Only apply explicit status filter for non-students and if provided
      filter.status = status;
    }
    // For wardens with no explicit status: return ALL menus

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

    console.log('✏️ Menu updated:', {
      _id: menu._id,
      status: menu.status,
      mealsKeys: Object.keys(menu.meals || {}),
      dinnerDishes: menu.meals?.dinner?.dishes?.length || 0,
    });

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

    // Check if warden belongs to same institution
    if (menu.institutionId.toString() !== req.user.institutionId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You cannot delete this menu',
      });
    }

    // Delete votes and reviews associated with this menu
    await MenuVote.deleteMany({ menuId: id });
    await MenuReview.deleteMany({ menuId: id });

    await Menu.findByIdAndDelete(id);

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

/**
 * @desc    Vote on menu meal (Student only)
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

    // Validate inputs
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

    // Get student info - REQUIRED for studentName
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    // Build student name - REQUIRED field
    const studentName =
      `${student.firstName || ''} ${student.lastName || ''}`.trim() ||
      student.rollNumber ||
      req.user.name;

    // Validate studentName is not empty
    if (!studentName || studentName.trim() === '') {
      return res.status(500).json({
        success: false,
        message: 'Cannot determine student name from database',
      });
    }

    const normalizedVoteDate = new Date(menu.menuDate);
    normalizedVoteDate.setHours(0, 0, 0, 0);

    // Check if student already voted for this menu and meal type
    // Key: menuId + studentId + mealType (one vote per menu per meal)
    let existingVote = await MenuVote.findOne({
      menuId,
      studentId: student._id,
      mealType,
    });

    try {
      if (existingVote) {
        // Update existing vote
        existingVote.voteType = voteType;
        existingVote.rating = rating;
        existingVote.studentName = studentName.trim();
        existingVote.date = normalizedVoteDate;
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
        studentName: studentName.trim(),
        userId: req.user._id,
        mealType,
        voteType,
        rating,
        date: normalizedVoteDate,
      });

      return res.status(201).json({
        success: true,
        message: 'Vote recorded successfully',
        data: newVote,
      });
    } catch (dbError) {
      // Handle E11000 duplicate key error gracefully
      if (dbError.code === 11000) {
        // Race condition: another request created the vote. Update it instead.
        const raceVote = await MenuVote.findOne({
          menuId,
          studentId: student._id,
          mealType,
        });

        if (raceVote) {
          raceVote.voteType = voteType;
          raceVote.rating = rating;
          raceVote.studentName = studentName.trim();
          raceVote.date = normalizedVoteDate;
          await raceVote.save();

          return res.status(200).json({
            success: true,
            message: 'Vote updated successfully',
            data: raceVote,
          });
        }
      }

      // Re-throw other errors
      throw dbError;
    }
  } catch (error) {
    console.error('Vote error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to record vote',
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

    console.log('📋 getTodayMenu - Menu found:', {
      _id: menu._id,
      status: menu.status,
      mealsKeys: Object.keys(menu.meals || {}),
      breakfastDishes: menu.meals?.breakfast?.dishes?.length || 0,
      lunchDishes: menu.meals?.lunch?.dishes?.length || 0,
      snacksDishes: menu.meals?.snacks?.dishes?.length || 0,
      dinnerDishes: menu.meals?.dinner?.dishes?.length || 0,
    });

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

    const responseData = {
      ...menu._doc,
      stats: mealStats,
    };

    console.log('📤 getTodayMenu - Response structure:', {
      hasMenus: !!responseData.meals,
      mealsKeys: Object.keys(responseData.meals || {}),
      dinnerExists: !!responseData.meals?.dinner,
      dinnerDishes: responseData.meals?.dinner?.dishes?.length || 0,
      dinnerDishesArray: responseData.meals?.dinner?.dishes,
    });

    res.status(200).json({
      success: true,
      data: responseData,
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

/**
 * @desc    Get voting details for a menu (who voted for what)
 * @route   GET /api/menu/:id/voting-details
 * @access  Private
 */
export const getVotingDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { mealType } = req.query;

    const menu = await Menu.findById(id);

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: 'Menu not found',
      });
    }

    const filter = {
      menuId: id,
      institutionId: req.user.institutionId,
    };

    if (mealType) {
      filter.mealType = mealType;
    }

    const votes = await MenuVote.find(filter)
      .populate('studentId', 'rollNo firstName lastName')
      .sort({ createdAt: -1 })
      .lean();

    const grouped = {};
    votes.forEach((vote) => {
      if (!grouped[vote.mealType]) {
        grouped[vote.mealType] = {
          likers: [],
          dislikers: [],
          totalLikes: 0,
          totalDislikes: 0,
        };
      }

      const voter = {
        studentId: vote.studentId,
        studentName: vote.studentName,
        voteType: vote.voteType,
        createdAt: vote.createdAt,
      };

      if (vote.voteType === 'like') {
        grouped[vote.mealType].likers.push(voter);
        grouped[vote.mealType].totalLikes += 1;
      } else {
        grouped[vote.mealType].dislikers.push(voter);
        grouped[vote.mealType].totalDislikes += 1;
      }
    });

    res.status(200).json({
      success: true,
      data: grouped,
    });
  } catch (error) {
    console.error('Error getting voting details:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Get menu details with full stats for wardens
 * @route   GET /api/menu/:id/details
 * @access  Private (Warden only)
 */
export const getMenuDetails = async (req, res) => {
  try {
    if (req.user.role !== 'warden') {
      return res.status(403).json({
        success: false,
        message: 'Only wardens can view detailed menu statistics',
      });
    }

    const { id: menuId } = req.params;

    const menu = await Menu.findById(menuId).populate('createdBy', 'name email');

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
        message: 'You cannot view this menu',
      });
    }

    // Get all votes for this menu
    const votes = await MenuVote.find({ menuId });

    const mealTypes = ['Breakfast', 'Lunch', 'Snacks', 'Dinner'];
    const mealStats = {};

    mealTypes.forEach((mealType) => {
      const mealVotes = votes.filter((v) => v.mealType === mealType);
      const likes = mealVotes.filter((v) => v.voteType === 'like');
      const dislikes = mealVotes.filter((v) => v.voteType === 'dislike');

      const totalVotes = mealVotes.length;
      const totalLikes = likes.length;
      const totalDislikes = dislikes.length;

      mealStats[mealType.toLowerCase()] = {
        dishes: menu.meals?.[mealType.toLowerCase()]?.dishes || [],
        stats: {
          totalVotes,
          totalLikes,
          totalDislikes,
          likePercentage: totalVotes > 0 ? Math.round((totalLikes / totalVotes) * 100) : 0,
          dislikePercentage: totalVotes > 0 ? Math.round((totalDislikes / totalVotes) * 100) : 0,
          averageRating: totalVotes > 0
            ? (mealVotes.reduce((sum, v) => sum + v.rating, 0) / totalVotes).toFixed(1)
            : 0,
          likedBy: likes.map((vote) => ({
            studentId: vote.studentId,
            studentName: vote.studentName,
            createdAt: vote.createdAt,
          })),
          dislikedBy: dislikes.map((vote) => ({
            studentId: vote.studentId,
            studentName: vote.studentName,
            createdAt: vote.createdAt,
          })),
        },
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        _id: menu._id,
        menuDate: menu.menuDate,
        status: menu.status,
        createdBy: menu.createdBy,
        createdAt: menu.createdAt,
        updatedAt: menu.updatedAt,
        meals: mealStats,
      },
    });
  } catch (error) {
    console.error('Error getting menu details:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
