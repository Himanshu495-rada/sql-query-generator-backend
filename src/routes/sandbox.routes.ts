import express from "express";
import { authenticate } from "../middleware/auth";
import * as sandboxController from "../controllers/sandbox.controller";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get sandbox status for a connection
router.get("/status/:connectionId", sandboxController.getSandboxStatus);

// Create a sandbox for a connection (if it doesn't exist)
router.post("/create/:connectionId", sandboxController.createSandbox);

// Reset a sandbox (drop and recreate)
router.post("/reset/:sandboxId", sandboxController.resetSandbox);

// Synchronize sandbox schema with original database
router.post("/sync/:sandboxId", sandboxController.syncSandboxSchema);

// Delete a sandbox
router.delete("/delete/:sandboxId", sandboxController.deleteSandbox);

export default router;
