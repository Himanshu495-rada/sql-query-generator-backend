import express from 'express';
import { authenticate } from '../middleware/auth';
import * as playgroundController from '../controllers/playground.controller';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all playgrounds for user
router.get('/', playgroundController.getAllPlaygrounds);

// Get playground by ID
router.get('/:id', playgroundController.getPlaygroundById);

// Create a new playground
router.post('/', playgroundController.createPlayground);

// Update a playground
router.put('/:id', playgroundController.updatePlayground);

// Delete a playground
router.delete('/:id', playgroundController.deletePlayground);

// Get all queries for a playground
router.get('/:id/queries', playgroundController.getPlaygroundQueries);

// Add a connection to a playground
router.post('/:id/connections', playgroundController.addConnectionToPlayground);

// Remove a connection from a playground
router.delete('/:id/connections/:connectionId', playgroundController.removeConnectionFromPlayground);

export default router; 