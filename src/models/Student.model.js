import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      index: true,
    },
    class: {
      type: String,
      required: [true, 'Please provide class'],
      trim: true,
    },
    section: {
      type: String,
      trim: true,
    },
    rollNumber: {
      type: String,
      required: [true, 'Please provide roll number'],
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    // Guardian contact fields (kept on student for quick view)
    guardianName: {
      type: String,
      trim: true,
    },
    guardianEmail: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid guardian email'],
    },
    guardianPhone: {
      type: String,
      trim: true,
    },
    room: {
      type: String,
      trim: true,
    },
    // Controlled by warden: whether location tracking for this student is enabled
    locationTrackingEnabled: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

studentSchema.index({ institutionId: 1, rollNumber: 1 }, { unique: true });

const Student = mongoose.model('Student', studentSchema);

export default Student;
