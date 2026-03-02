import mongoose from 'mongoose';

const menuVoteSchema = new mongoose.Schema(
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
    voteType: {
      type: String,
      enum: ['like', 'dislike'],
      required: true,
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

// Create unique index - one student can vote once per meal per day
menuVoteSchema.index(
  { menuId: 1, studentId: 1, mealType: 1 },
  { unique: true }
);

const MenuVote = mongoose.model('MenuVote', menuVoteSchema);

export default MenuVote;
