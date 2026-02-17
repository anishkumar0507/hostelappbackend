import mongoose from 'mongoose';

/**
 * Parent model - links a parent User to exactly one Student.
 * One student can have multiple parents (e.g., mother, father).
 * Parent accounts are created ONLY by warden - no public signup.
 */
const parentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // One user can only be parent of one student
    },
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    relationship: {
      type: String,
      trim: true,
      default: 'Guardian',
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient lookups
parentSchema.index({ studentId: 1, institutionId: 1 });
parentSchema.index({ institutionId: 1, userId: 1 }, { unique: true });

const Parent = mongoose.model('Parent', parentSchema);

export default Parent;
