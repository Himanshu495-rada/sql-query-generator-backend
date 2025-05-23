import request from 'supertest';
import { Express } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { prisma, setupTestData, cleanupTestData, testUser } from './setup';
import app from '../src/index';

describe('Authentication Tests', () => {
  let expressApp: Express;
  let authToken: string;

  beforeAll(async () => {
    await setupTestData();
    expressApp = app;
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe('User Registration', () => {
    it('should register a new user successfully', async () => {
      const newUser = {
        email: 'newuser@example.com',
        password: 'StrongPassword123!',
        name: 'New Test User',
      };

      const response = await request(expressApp)
        .post('/api/auth/register')
        .send(newUser);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.email).toBe(newUser.email);
      expect(response.body.data.user.name).toBe(newUser.name);
      expect(response.body.data.token).toBeDefined();

      // Cleanup - delete the created user
      await prisma.user.delete({
        where: { email: newUser.email },
      });
    });

    it('should not register a user with an existing email', async () => {
      const response = await request(expressApp)
        .post('/api/auth/register')
        .send({
          email: testUser.email, // Already exists
          password: 'NewPassword123!',
          name: 'Duplicate User',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already exists');
    });

    it('should not register a user with invalid data', async () => {
      const response = await request(expressApp)
        .post('/api/auth/register')
        .send({
          email: 'notanemail',
          password: '123', // Too short
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('User Login', () => {
    it('should login an existing user successfully', async () => {
      const response = await request(expressApp)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data.token).toBeDefined();

      // Save token for authenticated requests
      authToken = response.body.data.token;
    });

    it('should not login with incorrect password', async () => {
      const response = await request(expressApp)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123!',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid credentials');
    });

    it('should not login with non-existent email', async () => {
      const response = await request(expressApp)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Password123!',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid credentials');
    });
  });

  describe('Authentication Middleware', () => {
    it('should allow access to protected routes with valid token', async () => {
      const response = await request(expressApp)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.email).toBe(testUser.email);
    });

    it('should deny access to protected routes without token', async () => {
      const response = await request(expressApp)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Authentication required');
    });

    it('should deny access with invalid token', async () => {
      const response = await request(expressApp)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalidtoken123');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Password Reset', () => {
    it('should request password reset successfully', async () => {
      const response = await request(expressApp)
        .post('/api/auth/password-reset/request')
        .send({
          email: testUser.email,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    // Additional password reset tests would go here
  });
}); 