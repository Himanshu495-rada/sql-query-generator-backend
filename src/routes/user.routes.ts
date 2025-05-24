import express from 'express';
import { authenticate } from '../middleware/auth';
import * as userController from '../controllers/user.controller';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get user profile
router.get('/profile', userController.getProfile);

// Update user profile
router.put('/profile', userController.updateProfile);

// Update user settings
router.put('/settings', userController.updateSettings);

// Change password
router.put('/change-password', userController.changePassword);

// Get user API keys
router.get('/api-keys', userController.getApiKeys);

// Create a new API key
router.post('/api-keys', userController.createApiKey);

// Delete an API key
router.delete('/api-keys/:id', userController.deleteApiKey);

// Get user settings
router.get('/settings', userController.getSettings);

export default router; 