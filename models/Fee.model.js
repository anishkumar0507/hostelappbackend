import mongoose from 'mongoose';

const feeSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    amount: {
      type: Number,
      required: [true, 'Please provide fee amount'],
      min: [0, 'Amount cannot be negative'],
    },
    status: {
      type: String,
      enum: ['Paid', 'Pending'],
      required: true,
      default: 'Pending',
    },
    term: {
      type: String,
      required: [true, 'Please provide term'],
      trim: true,
    },
    receiptNumber: {
      type: String,
      unique: true,
      sparse: true, // Allow multiple null values
      trim: true,
    },
    paidAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

const Fee = mongoose.model('Fee', feeSchema);

export default Fee;
