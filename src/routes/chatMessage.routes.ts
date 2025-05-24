import express from 'express';
import { authenticate } from '../middleware/auth';
import * as chatMessageController from '../controllers/chatMessage.controller';

const router = express.Router();

router.use(authenticate);

// Get all chat messages for a playground
router.get('/playground/:playgroundId', chatMessageController.getAllForPlayground);

// Add a new chat message
router.post('/', chatMessageController.addMessage);

export default router; 