import Poll from '../models/Poll.model.js';
import PollVote from '../models/PollVote.model.js';
import Student from '../models/Student.model.js';
import MenuVote from '../models/MenuVote.model.js';

/**
 * @desc    Create a new poll (Warden only)
 * @route   POST /api/poll
 * @access  Private (Warden only)
 */
export const createPoll = async (req, res) => {
  try {
    const { title, description, options, pollType, endDate } = req.body;

    if (!title || !options || options.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Poll must have title and at least 2 options',
      });
    }

    const poll = new Poll({
      institutionId: req.user.institutionId,
      createdBy: req.user._id,
      title,
      description,
      options: options.map((option, index) => ({
        id: `option_${index}`,
        text: option.text,
        description: option.description || '',
      })),
      pollType: pollType || 'custom',
      endDate: endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // default 7 days
    });

    await poll.save();

    res.status(201).json({
      success: true,
      message: 'Poll created successfully',
      data: poll,
    });
  } catch (error) {
    console.error('Error creating poll:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Get all active polls for institution
 * @route   GET /api/poll
 * @access  Private
 */
export const getPolls = async (req, res) => {
  try {
    const { status = 'active' } = req.query;

    const filter = {
      institutionId: req.user.institutionId,
    };

    if (status) {
      filter.status = status;
    }

    const polls = await Poll.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    // Add vote counts for each option
    const pollsWithVotes = await Promise.all(
      polls.map(async (poll) => {
        const votes = await PollVote.find({ pollId: poll._id }).lean();

        const optionVotes = {};
        poll.options.forEach((option) => {
          optionVotes[option.id] = {
            count: votes.filter((v) => v.optionId === option.id).length,
            percentage: 0,
          };
        });

        const totalVotes = votes.length;
        Object.keys(optionVotes).forEach((optionId) => {
          optionVotes[optionId].percentage =
            totalVotes > 0
              ? Math.round((optionVotes[optionId].count / totalVotes) * 100)
              : 0;
        });

        return {
          ...poll,
          totalVotes,
          optionVotes,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: pollsWithVotes,
    });
  } catch (error) {
    console.error('Error getting polls:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Get poll details with voter information (Warden only)
 * @route   GET /api/poll/:id/details
 * @access  Private (Warden only)
 */
export const getPollDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const poll = await Poll.findById(id)
      .populate('createdBy', 'name email')
      .lean();

    if (!poll) {
      return res.status(404).json({
        success: false,
        message: 'Poll not found',
      });
    }

    // Get all votes with student details
    const votes = await PollVote.find({ pollId: id })
      .populate('studentId', 'rollNo firstName lastName')
      .sort({ createdAt: -1 })
      .lean();

    const optionStats = {};
    poll.options.forEach((option) => {
      optionStats[option.id] = {
        option: option,
        votes: votes.filter((v) => v.optionId === option.id),
        count: votes.filter((v) => v.optionId === option.id).length,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        ...poll,
        totalVotes: votes.length,
        optionStats,
        allVotes: votes,
      },
    });
  } catch (error) {
    console.error('Error getting poll details:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Vote on a poll
 * @route   POST /api/poll/:id/vote
 * @access  Private (Student only)
 */
export const votePoll = async (req, res) => {
  try {
    const { id } = req.params;
    const { optionId } = req.body;

    const poll = await Poll.findById(id);

    if (!poll) {
      return res.status(404).json({
        success: false,
        message: 'Poll not found',
      });
    }

    if (poll.status === 'closed') {
      return res.status(400).json({
        success: false,
        message: 'This poll is closed',
      });
    }

    const option = poll.options.find((opt) => opt.id === optionId);
    if (!option) {
      return res.status(400).json({
        success: false,
        message: 'Invalid option selected',
      });
    }

    // Get student info
    const student = await Student.findOne({
      userId: req.user._id,
      institutionId: req.user.institutionId,
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    // Remove existing vote if updating
    await PollVote.deleteOne({
      pollId: id,
      studentId: student._id,
    });

    // Create new vote
    const vote = new PollVote({
      institutionId: req.user.institutionId,
      pollId: id,
      studentId: student._id,
      userId: req.user._id,
      optionId,
      optionText: option.text,
    });

    await vote.save();

    res.status(201).json({
      success: true,
      message: 'Vote recorded successfully',
      data: vote,
    });
  } catch (error) {
    console.error('Error voting on poll:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Get menu voting history (who voted for what)
 * @route   GET /api/menu/:id/voting-history
 * @access  Private
 */
export const getVotingHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const { mealType } = req.query;

    const filter = {
      menuId: id,
      institutionId: req.user.institutionId,
    };

    if (mealType) {
      filter.mealType = mealType;
    }

    const votes = await MenuVote.find(filter)
      .populate('studentId', 'rollNo firstName lastName')
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    const grouped = {};
    votes.forEach((vote) => {
      if (!grouped[vote.mealType]) {
        grouped[vote.mealType] = {
          likes: [],
          dislikes: [],
          total: 0,
        };
      }

      if (vote.voteType === 'like') {
        grouped[vote.mealType].likes.push({
          studentName: `${vote.studentId?.firstName} ${vote.studentId?.lastName}`,
          rollNo: vote.studentId?.rollNo,
          rating: vote.rating,
          timestamp: vote.createdAt,
        });
      } else {
        grouped[vote.mealType].dislikes.push({
          studentName: `${vote.studentId?.firstName} ${vote.studentId?.lastName}`,
          rollNo: vote.studentId?.rollNo,
          rating: vote.rating,
          timestamp: vote.createdAt,
        });
      }

      grouped[vote.mealType].total += 1;
    });

    res.status(200).json({
      success: true,
      data: grouped,
    });
  } catch (error) {
    console.error('Error getting voting history:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Close/End a poll (Warden only)
 * @route   PUT /api/poll/:id/close
 * @access  Private (Warden only)
 */
export const closePoll = async (req, res) => {
  try {
    const { id } = req.params;

    const poll = await Poll.findById(id);

    if (!poll) {
      return res.status(404).json({
        success: false,
        message: 'Poll not found',
      });
    }

    if (poll.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only close your own polls',
      });
    }

    poll.status = 'closed';
    await poll.save();

    res.status(200).json({
      success: true,
      message: 'Poll closed successfully',
      data: poll,
    });
  } catch (error) {
    console.error('Error closing poll:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Delete a poll (Warden only)
 * @route   DELETE /api/poll/:id
 * @access  Private (Warden only)
 */
export const deletePoll = async (req, res) => {
  try {
    const { id } = req.params;

    const poll = await Poll.findById(id);

    if (!poll) {
      return res.status(404).json({
        success: false,
        message: 'Poll not found',
      });
    }

    if (poll.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own polls',
      });
    }

    await PollVote.deleteMany({ pollId: id });
    await Poll.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Poll deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting poll:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
