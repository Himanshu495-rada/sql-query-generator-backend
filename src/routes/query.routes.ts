import express from 'express';
import { authenticate } from '../middleware/auth';
import * as queryController from '../controllers/query.controller';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Generate SQL from natural language prompt
router.post('/generate', queryController.generateQuery);

// Execute query on sandbox database
router.post('/execute', queryController.executeQuery);

// Save a query
router.post('/', queryController.saveQuery);

// Get query by ID
router.get('/:id', queryController.getQueryById);

// Delete a query
router.delete('/:id', queryController.deleteQuery);

// Get query history for a playground
router.get('/playground/:playgroundId', queryController.getQueryHistory);

export default router; 