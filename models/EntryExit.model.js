import mongoose from 'mongoose';

const entryExitSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    inTime: {
      type: Date,
    },
    outTime: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['IN', 'OUT'],
      required: true,
    },
    method: {
      type: String,
      enum: ['QR', 'Biometric', 'Manual'],
      required: true,
      default: 'Manual',
    },
  },
  {
    timestamps: true,
  }
);

const EntryExit = mongoose.model('EntryExit', entryExitSchema);

export default EntryExit;
