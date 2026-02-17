import mongoose from 'mongoose';

const institutionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide an institution name'],
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

institutionSchema.index({ name: 1 }, { unique: true });

const Institution = mongoose.model('Institution', institutionSchema);

export default Institution;
