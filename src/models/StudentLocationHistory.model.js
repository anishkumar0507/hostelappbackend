import mongoose from 'mongoose';

const StudentLocationHistorySchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  accuracy: { type: Number },
  timestamp: { type: Date, default: Date.now, index: true },
});

StudentLocationHistorySchema.index({ institutionId: 1, studentId: 1, timestamp: 1 });

export default mongoose.model('StudentLocationHistory', StudentLocationHistorySchema);
