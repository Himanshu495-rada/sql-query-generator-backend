import express from 'express';
import { authenticate } from '../middleware/auth';
import * as authController from '../controllers/auth.controller';

const router = express.Router();

// Register a new user
router.post('/register', authController.register);

// Login
router.post('/login', authController.login);

// Get current user profile (requires authentication)
router.get('/me', authenticate, authController.getCurrentUser);

// Refresh token
router.post('/refresh-token', authController.refreshToken);

// Logout
router.post('/logout', authenticate, authController.logout);

// Forgot password
router.post('/forgot-password', authController.forgotPassword);

// Reset password
router.post('/reset-password', authController.resetPassword);

export default router; 