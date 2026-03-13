import express from 'express';
import { savePushToken } from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/save-push-token', protect, savePushToken);

export default router;
