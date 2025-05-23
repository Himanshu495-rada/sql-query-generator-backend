import request from 'supertest';
import { Express } from 'express';
import { prisma, setupTestData, cleanupTestData, testUser, testConnection } from './setup';
import app from '../src/index';
import * as databaseService from '../src/services/database.service';

// Mock database service
jest.mock('../src/services/database.service', () => ({
  connectToDatabase: jest.fn().mockResolvedValue(true),
  testConnection: jest.fn().mockResolvedValue(true),
  closeDatabaseConnection: jest.fn().mockResolvedValue(true),
  getDatabaseSchema: jest.fn().mockResolvedValue({
    tables: [
      {
        name: 'users',
        columns: [
          { name: 'id', type: 'INT', isPrimaryKey: true, nullable: false },
          { name: 'name', type: 'VARCHAR', nullable: false },
        ]
      }
    ]
  }),
  createSandboxDatabase: jest.fn().mockResolvedValue({
    name: 'sandbox_test',
    connectionString: 'sqlite://:memory:',
  }),
}));

describe('Connection and Database Tests', () => {
  let expressApp: Express;
  let authToken: string;
  let connectionId: string;

  beforeAll(async () => {
    await setupTestData();
    expressApp = app;
    
    // Login to get auth token
    const loginResponse = await request(expressApp)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      });
    
    authToken = loginResponse.body.data.token;
    connectionId = testConnection.id;
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe('Connection Management', () => {
    it('should create a new connection', async () => {
      const newConnection = {
        name: 'New Test Connection',
        type: 'postgres',
        host: 'localhost',
        port: 5432,
        username: 'postgres',
        password: 'postgres',
        database: 'testdb',
        connectionString: null,
        description: 'A test postgres connection',
      };

      const response = await request(expressApp)
        .post('/api/connections')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newConnection);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.connection).toBeDefined();
      expect(response.body.data.connection.name).toBe(newConnection.name);
      expect(response.body.data.connection.type).toBe(newConnection.type);
    });

    it('should get all connections for a user', async () => {
      const response = await request(expressApp)
        .get('/api/connections')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.connections)).toBe(true);
      expect(response.body.data.connections.length).toBeGreaterThan(0);
    });

    it('should update an existing connection', async () => {
      const updatedData = {
        name: 'Updated Connection Name',
        description: 'Updated description',
      };

      const response = await request(expressApp)
        .put(`/api/connections/${connectionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updatedData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.connection.name).toBe(updatedData.name);
      expect(response.body.data.connection.description).toBe(updatedData.description);
    });

    it('should delete a connection', async () => {
      // Create a connection to delete
      const tempConnection = await prisma.connection.create({
        data: {
          id: 'temp-connection-id',
          name: 'Temp Connection',
          type: 'sqlite' as any,
          host: 'localhost',
          port: 0,
          isActive: true,
          userId: testUser.id,
        },
      });

      const response = await request(expressApp)
        .delete(`/api/connections/${tempConnection.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted');

      // Verify it's actually deleted
      const deleted = await prisma.connection.findUnique({
        where: { id: tempConnection.id },
      });
      expect(deleted).toBeNull();
    });
  });

  describe('Connection Testing', () => {
    it('should test a valid connection successfully', async () => {
      const connectionData = {
        type: 'sqlite',
        host: 'localhost',
        port: 0,
        username: null,
        password: null,
        database: ':memory:',
        connectionString: null,
      };

      const response = await request(expressApp)
        .post('/api/connections/test')
        .set('Authorization', `Bearer ${authToken}`)
        .send(connectionData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isValid).toBe(true);
    });

    it('should fail for invalid connection', async () => {
      // Mock the test function to return a failure
      (databaseService.testConnection as jest.Mock).mockRejectedValueOnce(new Error('Connection failed'));

      const connectionData = {
        type: 'postgres',
        host: 'invalid-host',
        port: 5432,
        username: 'invalid',
        password: 'invalid',
        database: 'invalid',
        connectionString: null,
      };

      const response = await request(expressApp)
        .post('/api/connections/test')
        .set('Authorization', `Bearer ${authToken}`)
        .send(connectionData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isValid).toBe(false);
      expect(response.body.data.error).toContain('Connection failed');

      // Reset the mock
      (databaseService.testConnection as jest.Mock).mockResolvedValue(true);
    });
  });

  describe('Sandbox Database', () => {
    it('should create a sandbox database', async () => {
      const response = await request(expressApp)
        .post(`/api/sandbox/create/${connectionId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.sandbox).toBeDefined();
      expect(response.body.data.sandbox.name).toContain('sandbox_');
    });

    it('should get sandbox status', async () => {
      const response = await request(expressApp)
        .get(`/api/sandbox/status/${connectionId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.hasSandbox).toBeDefined();
    });

    it('should reset a sandbox database', async () => {
      // Create a sandbox first
      const sandbox = await prisma.sandboxDb.create({
        data: {
          id: 'test-sandbox-id',
          name: 'sandbox_test',
          connectionId: connectionId,
          schema: { tables: [] },
        },
      });

      const response = await request(expressApp)
        .post(`/api/sandbox/reset/${sandbox.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.sandbox).toBeDefined();
      expect(response.body.message).toContain('reset');
    });
  });
}); 