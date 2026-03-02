import mongoose from 'mongoose';

const mealSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Breakfast', 'Lunch', 'Snacks', 'Dinner'],
    required: true,
  },
  dishes: [{
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    imageUrl: {
      type: String,
      trim: true,
    },
  }],
});

const menuSchema = new mongoose.Schema(
  {
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
    },
    menuDate: {
      type: Date,
      required: [true, 'Please provide menu date'],
    },
    meals: {
      breakfast: mealSchema,
      lunch: mealSchema,
      snacks: mealSchema,
      dinner: mealSchema,
    },
    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure one menu per day per institution
menuSchema.index({ institutionId: 1, menuDate: 1 }, { unique: true });

const Menu = mongoose.model('Menu', menuSchema);

export default Menu;
