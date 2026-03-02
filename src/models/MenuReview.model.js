import mongoose from 'mongoose';

const menuReviewSchema = new mongoose.Schema(
  {
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
    },
    menuId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Menu',
      required: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    mealType: {
      type: String,
      enum: ['Breakfast', 'Lunch', 'Snacks', 'Dinner'],
      required: true,
    },
    comment: {
      type: String,
      required: [true, 'Please provide a comment'],
      trim: true,
      maxlength: [500, 'Comment cannot exceed 500 characters'],
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
menuReviewSchema.index({ menuId: 1, mealType: 1, createdAt: -1 });

const MenuReview = mongoose.model('MenuReview', menuReviewSchema);

export default MenuReview;
