import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['complaint', 'leave', 'fee', 'chat', 'menu', 'feedback', 'general'],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      // Reference to the related document (complaint, leave, etc.)
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      // Backward compatible alias for older code paths.
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
    navigation: {
      screen: { type: String, trim: true },
      targetId: { type: String, trim: true },
      params: { type: mongoose.Schema.Types.Mixed },
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ institutionId: 1, userId: 1 });

notificationSchema.pre('validate', function syncReferenceIds(next) {
  if (!this.referenceId && this.relatedId) {
    this.referenceId = this.relatedId;
  }
  if (!this.relatedId && this.referenceId) {
    this.relatedId = this.referenceId;
  }
  next();
});

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
