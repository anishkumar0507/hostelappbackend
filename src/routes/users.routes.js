import express from 'express';
import { savePushToken, clearPushToken } from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/save-push-token', protect, savePushToken);
router.post('/clear-push-token', protect, clearPushToken);

export default router;
