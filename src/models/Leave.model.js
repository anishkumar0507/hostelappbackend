import mongoose from 'mongoose';

const leaveSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      index: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['Home Visit', 'Local Coaching/Classes', 'Medical Checkup', 'Local Market/Personal', 'Emergency Leave', 'Other'],
    },
    status: {
      type: String,
      enum: ['Pending', 'PendingParent', 'ApprovedByParent', 'RejectedByParent', 'Approved', 'Rejected', 'Cancelled'],
      default: 'Pending',
    },
    outDate: {
      type: Date,
      required: true,
    },
    inDate: {
      type: Date,
      required: true,
    },
    outTime: {
      type: String, // Optional specific time
    },
    inTime: {
      type: String, // Optional specific time
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Warden who approved (final)
    },
    approvedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
    // 3-step approval: Student -> Parent -> Warden
    parentApprovalStatus: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
    },
    parentApprovedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    parentApprovedAt: {
      type: Date,
    },
    parentRejectionReason: {
      type: String,
      trim: true,
    },
    // Full status history for audit
    statusHistory: [
      {
        status: String,
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        role: String,
        reason: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
    actualOutTime: {
      type: Date,
    },
    actualInTime: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Validation: inDate should be after outDate
leaveSchema.pre('save', function(next) {
  if (this.inDate < this.outDate) {
    next(new Error('Return date must be after outing date'));
  }
  next();
});

// Index for efficient queries
leaveSchema.index({ studentId: 1, status: 1 });
leaveSchema.index({ status: 1, createdAt: -1 });

const Leave = mongoose.model('Leave', leaveSchema);

export default Leave;