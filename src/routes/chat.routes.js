import express from 'express';
import {
  getMyChat,
  sendMessage,
  getWardenChats,
  getWardenChatById,
  wardenSendMessage,
} from '../controllers/chat.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const router = express.Router();

router.use(protect);

// Parent chat
router.get('/', authorize('parent'), getMyChat);
router.post('/message', authorize('parent'), sendMessage);

// Warden chat
router.get('/warden', authorize('warden'), getWardenChats);
router.get('/warden/:chatId', authorize('warden'), getWardenChatById);
router.post('/warden/:chatId/message', authorize('warden'), wardenSendMessage);

export default router;
