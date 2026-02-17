import cron from 'node-cron';
import Fee from '../models/Fee.model.js';
import Parent from '../models/Parent.model.js';
import { sendPaymentReminderEmail } from './emailService.js';

export const schedulePaymentReminders = () => {
  cron.schedule(
    '0 9 * * *',
    async () => {
      try {
        const now = new Date();
        const weekAhead = new Date();
        weekAhead.setDate(now.getDate() + 7);

        const pendingFees = await Fee.find({
          status: 'Pending',
          dueDate: { $gte: now, $lte: weekAhead },
          $or: [{ reminderSentAt: { $exists: false } }, { reminderSentAt: null }],
        }).populate({
          path: 'studentId',
          populate: { path: 'userId', select: 'name email' },
        });

        for (const fee of pendingFees) {
          const student = fee.studentId;
          if (!student) continue;

          const payload = {
            studentName: student.userId?.name,
            amount: fee.amount,
            dueDate: fee.dueDate,
            term: fee.term,
          };

          if (student.userId?.email) {
            await sendPaymentReminderEmail({ to: student.userId.email, ...payload });
          }

          const parent = await Parent.findOne({ studentId: student._id }).populate('userId', 'email name');
          if (parent?.userId?.email) {
            await sendPaymentReminderEmail({ to: parent.userId.email, ...payload });
          }

          fee.reminderSentAt = new Date();
          await fee.save();
        }
      } catch (error) {
        console.error('❌ Payment reminder job failed:', error.message || error);
      }
    },
    { timezone: 'Asia/Kolkata' }
  );
};
