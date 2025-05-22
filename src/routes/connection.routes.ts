import express from 'express';
import multer from 'multer';
import path from 'path';
import { authenticate } from '../middleware/auth';
import * as connectionController from '../controllers/connection.controller';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Configure multer for sqlite file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `sqlite-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
  fileFilter: (req, file, cb) => {
    // Accept only SQLite file extensions
    const allowedExtensions = ['.db', '.sqlite', '.sqlite3'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      return cb(null, true);
    }
    cb(new Error('Only SQLite database files are allowed'));
  }
});

// Get all connections for user
router.get('/', connectionController.getAllConnections);

// Get connection by ID
router.get('/:id', connectionController.getConnectionById);

// Create a new connection
router.post('/', connectionController.createConnection);

// Upload SQLite database file
router.post('/sqlite-upload', upload.single('sqliteFile'), connectionController.uploadSqliteFile);

// Update a connection
router.put('/:id', connectionController.updateConnection);

// Delete a connection
router.delete('/:id', connectionController.deleteConnection);

// Test connection
router.post('/test', connectionController.testConnection);

// Get database schema
router.get('/:id/schema', connectionController.getDatabaseSchema);

// Get sample databases
router.get('/sample/all', connectionController.getSampleDatabases);

export default router; 