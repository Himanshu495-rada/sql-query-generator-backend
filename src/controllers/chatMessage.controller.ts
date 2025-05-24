import { Request, Response, NextFunction } from 'express';
import { prisma } from '../index';
import { ApiError } from '../middleware/errorHandler';

// Get all chat messages for a playground
export const getAllForPlayground = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const { playgroundId } = req.params;
    if (!userId) throw new ApiError(401, 'Authentication required');
    if (!playgroundId) throw new ApiError(400, 'Playground ID is required');

    // Check if playground belongs to user
    const playground = await prisma.playground.findFirst({
      where: { id: playgroundId, userId },
    });
    if (!playground) throw new ApiError(404, 'Playground not found');

    const messages = await prisma.chatMessage.findMany({
      where: { playgroundId },
      orderBy: { createdAt: 'asc' },
    });
    res.status(200).json({ success: true, data: { messages } });
  } catch (error) {
    next(error);
  }
};

// Add a new chat message
export const addMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const { playgroundId, sender, message, sql, queryId, results } = req.body;
    if (!userId) throw new ApiError(401, 'Authentication required');
    if (!playgroundId || !sender || !message) throw new ApiError(400, 'Missing required fields');

    // Check if playground belongs to user
    const playground = await prisma.playground.findFirst({
      where: { id: playgroundId, userId },
    });
    if (!playground) throw new ApiError(404, 'Playground not found');

    const chatMessage = await prisma.chatMessage.create({
      data: {
        playgroundId,
        userId,
        sender,
        message,
        sql,
        queryId,
        results,
      },
    });
    res.status(201).json({ success: true, data: { chatMessage } });
  } catch (error) {
    next(error);
  }
}; 