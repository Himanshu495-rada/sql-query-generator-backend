import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { logger } from "./utils/logger";
import { errorHandler } from "./middleware/errorHandler";

// Import routes
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import connectionRoutes from "./routes/connection.routes";
import playgroundRoutes from "./routes/playground.routes";
import queryRoutes from "./routes/query.routes";
import sandboxRoutes from "./routes/sandbox.routes";
import guiBuilderRoutes from "./routes/guiBuilder.routes";
import chatMessageRoutes from "./routes/chatMessage.routes";

// Load environment variables
dotenv.config();

// Initialize Prisma client
export const prisma = new PrismaClient();

// Create Express app
const app: Express = express();
const port = process.env.PORT || 3000;

const corsOptions = {
  origin: [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://sql-query-generator-playground.netlify.app", // Add your frontend Netlify URL
    "https://sql-generator-backend.netlify.app", // Add your backend Netlify URL if needed
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// Apply middleware
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Root route
app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "SQL Playground API",
    version: "1.0.0",
    status: "running",
  });
});

// Apply routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/connections", connectionRoutes);
app.use("/api/playgrounds", playgroundRoutes);
app.use("/api/queries", queryRoutes);
app.use("/api/sandbox", sandboxRoutes);
app.use("/api/gui-builder", guiBuilderRoutes);
app.use("/api/chat-messages", chatMessageRoutes);

// Apply error handler
app.use(errorHandler);

// Start server
app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
});

// Handle graceful shutdown
process.on("SIGINT", async () => {
  await shutdown();
});

process.on("SIGTERM", async () => {
  await shutdown();
});

async function shutdown() {
  logger.info("Shutting down server...");

  try {
    // Close Prisma client
    await prisma.$disconnect();
    logger.info("Database connections closed");

    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown:", error);
    process.exit(1);
  }
}

export default app;
