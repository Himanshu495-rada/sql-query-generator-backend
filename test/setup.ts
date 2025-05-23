import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';

// Load environment variables
dotenv.config({ path: '.env.test' });

// Create a test prisma client
export const prisma = new PrismaClient();

// Sample test user data
export const testUser = {
  id: uuidv4(),
  email: 'test@example.com',
  password: 'Password123!',
  name: 'Test User',
};

// Sample connection data
export const testConnection = {
  id: uuidv4(),
  name: 'Test Database',
  type: 'sqlite',
  description: 'A test database connection',
};

// Sample playground data
export const testPlayground = {
  id: uuidv4(),
  name: 'Test Playground',
  description: 'A test SQL playground',
};

// Setup function - creates test data in the database
export const setupTestData = async () => {
  // Create test user
  const hashedPassword = await bcrypt.hash(testUser.password, 10);
  
  await prisma.user.upsert({
    where: { email: testUser.email },
    update: {},
    create: {
      id: testUser.id,
      email: testUser.email,
      password: hashedPassword,
      name: testUser.name,
    },
  });

  // Create test connection
  await prisma.connection.upsert({
    where: { id: testConnection.id },
    update: {},
    create: {
      id: testConnection.id,
      name: testConnection.name,
      type: testConnection.type as any,
      description: testConnection.description,
      host: 'localhost',
      port: 0,
      username: null,
      password: null,
      database: ':memory:',
      isActive: true,
      userId: testUser.id,
    },
  });

  // Create test playground
  await prisma.playground.upsert({
    where: { id: testPlayground.id },
    update: {},
    create: {
      id: testPlayground.id,
      name: testPlayground.name,
      description: testPlayground.description,
      userId: testUser.id,
    },
  });
};

// Cleanup function - removes test data
export const cleanupTestData = async () => {
  // Delete in this order to avoid foreign key constraints
  await prisma.query.deleteMany({
    where: { playground: { userId: testUser.id } },
  });
  
  await prisma.playground.deleteMany({
    where: { userId: testUser.id },
  });
  
  await prisma.sandboxDb.deleteMany({
    where: { connection: { userId: testUser.id } },
  });
  
  await prisma.connection.deleteMany({
    where: { userId: testUser.id },
  });
  
  await prisma.apiKey.deleteMany({
    where: { userId: testUser.id },
  });
  
  await prisma.user.deleteMany({
    where: { id: testUser.id },
  });
}; 