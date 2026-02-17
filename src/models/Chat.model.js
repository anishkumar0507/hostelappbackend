import mongoose from 'mongoose';

/**
 * Chat - one-to-one between Parent and Warden, linked to a student.
 * Messages are stored in the messages array.
 */
const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

const chatSchema = new mongoose.Schema(
  {
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    wardenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
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
    messages: [messageSchema],
  },
  {
    timestamps: true,
  }
);

chatSchema.index({ institutionId: 1, parentId: 1, studentId: 1 }, { unique: true });
chatSchema.index({ institutionId: 1, wardenId: 1, studentId: 1 });

const Chat = mongoose.model('Chat', chatSchema);

export default Chat;
