import express from 'express';
import { authenticate } from '../middleware/auth';
import * as databaseController from '../controllers/database.controller';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Execute query directly on database
router.post('/execute', databaseController.executeQuery);

export default router; 