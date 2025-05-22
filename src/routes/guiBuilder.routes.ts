import express from 'express';
import { authenticate } from '../middleware/auth';
import * as guiBuilderController from '../controllers/guiBuilder.controller';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all tables and relationships for a database
router.get('/schema/:connectionId', guiBuilderController.getDatabaseSchemaForBuilder);

// Generate SQL from GUI builder configuration
router.post('/generate', guiBuilderController.generateSqlFromGuiConfig);

// Get sample queries for a table
router.get('/samples/:connectionId/table/:tableName', guiBuilderController.getSampleQueriesForTable);

export default router; 