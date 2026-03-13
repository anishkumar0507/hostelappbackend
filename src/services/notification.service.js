import Notification from '../models/Notification.model.js';
import User from '../models/User.model.js';
import { getIO } from '../utils/socket.js';
import { sendPushNotification } from './pushNotification.service.js';

// Emit only to the user-specific room to avoid duplicate events.
// Role-specific room events (newComplaint, leaveStatusUpdated, etc.) are
// dispatched directly by the controllers where more context is available.
const emitNotification = (io, user, eventName, payload) => {
  if (!io || !user?._id) return;
  const userId = String(user._id);
  io.to(`user_${userId}`).emit(eventName, payload);
};

export const notifyUser = async ({
  institutionId,
  userId,
  type,
  title,
  message,
  referenceId,
  socketEvent = 'notification:new',
  socketPayload = {},
  pushData = {},
}) => {
  const user = await User.findById(userId).select('role expoPushToken');
  if (!user) return null;

  console.log('[notification] Sending notification to user:', user._id, '| role:', user.role, '| title:', title);

  const notification = await Notification.create({
    institutionId,
    userId,
    type,
    title,
    message,
    referenceId,
    relatedId: referenceId,
    isRead: false,
  });

  const io = getIO();
  emitNotification(io, user, socketEvent, {
    ...socketPayload,
    notification,
  });

  await sendPushNotification(user.expoPushToken, title, message, pushData);
  return notification;
};

export const notifyUsers = async (notifications) => {
  if (!Array.isArray(notifications) || notifications.length === 0) {
    return [];
  }

  const created = [];
  for (const notification of notifications) {
    // Process sequentially to keep flow predictable and avoid noisy socket bursts.
    const item = await notifyUser(notification);
    if (item) created.push(item);
  }

  return created;
};
