import mongoose from 'mongoose';

const pollSchema = new mongoose.Schema(
  {
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
    },
    menuId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Menu',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 200,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    options: [
      {
        id: String,
        text: String,
        description: String,
      },
    ],
    pollType: {
      type: String,
      enum: ['menu_dish', 'custom'],
      default: 'custom',
    },
    status: {
      type: String,
      enum: ['active', 'closed'],
      default: 'active',
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
    },
    allowMultipleVotes: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

pollSchema.index({ institutionId: 1, createdBy: 1 });
pollSchema.index({ institutionId: 1, status: 1 });

export default mongoose.model('Poll', pollSchema);
