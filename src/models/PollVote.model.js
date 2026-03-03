import mongoose from 'mongoose';

const pollVoteSchema = new mongoose.Schema(
  {
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
    },
    pollId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Poll',
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
    optionId: {
      type: String,
      required: true,
    },
    optionText: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// One student can vote once per poll (updated vote replaces old one)
pollVoteSchema.index(
  { pollId: 1, studentId: 1 },
  { unique: true }
);

pollVoteSchema.index({ institutionId: 1, pollId: 1 });
pollVoteSchema.index({ pollId: 1, optionId: 1 });

export default mongoose.model('PollVote', pollVoteSchema);
