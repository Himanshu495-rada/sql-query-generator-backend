import request from 'supertest';
import { Express } from 'express';
import { prisma, setupTestData, cleanupTestData, testUser, testConnection, testPlayground } from './setup';
import app from '../src/index';

// Mock OpenAI/Azure OpenAI
jest.mock('openai', () => {
  const mockOpenAIInstance = {
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  query: 'SELECT * FROM users WHERE name = "John"',
                  explanation: 'This query selects all users named John'
                })
              }
            }
          ]
        })
      }
    }
  };
  
  const OpenAI = jest.fn().mockImplementation(() => mockOpenAIInstance);
  const AzureOpenAI = jest.fn().mockImplementation(() => mockOpenAIInstance);
  
  return { OpenAI, AzureOpenAI };
});

describe('Query Tests', () => {
  let expressApp: Express;
  let authToken: string;

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
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe('Query Generation', () => {
    it('should generate a SQL query from natural language prompt', async () => {
      const response = await request(expressApp)
        .post('/api/queries/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          prompt: 'Get all users named John',
          playgroundId: testPlayground.id,
          connectionId: testConnection.id,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.query).toBeDefined();
      expect(response.body.data.query.prompt).toBe('Get all users named John');
      expect(response.body.data.query.sqlQuery).toBe('SELECT * FROM users WHERE name = "John"');
      expect(response.body.data.query.explanation).toBe('This query selects all users named John');
    });

    it('should return error when missing required fields', async () => {
      const response = await request(expressApp)
        .post('/api/queries/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing prompt
          playgroundId: testPlayground.id,
          connectionId: testConnection.id,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle OpenAI errors gracefully', async () => {
      // Temporarily override mock to throw an error
      const originalMock = require('openai').OpenAI;
      require('openai').OpenAI.mockImplementationOnce(() => ({
        chat: {
          completions: {
            create: jest.fn().mockRejectedValue(new Error('OpenAI API error'))
          }
        }
      }));

      const response = await request(expressApp)
        .post('/api/queries/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          prompt: 'Get all users named John',
          playgroundId: testPlayground.id,
          connectionId: testConnection.id,
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('OpenAI API error');

      // Restore original mock
      require('openai').OpenAI = originalMock;
    });
  });

  describe('Query Execution', () => {
    let queryId: string;

    beforeAll(async () => {
      // Create a test query
      const query = await prisma.query.create({
        data: {
          id: "test-query-id",
          prompt: "Get all users",
          sqlQuery: "SELECT * FROM users",
          explanation: "This query returns all users",
          playgroundId: testPlayground.id,
          sandboxDbId: null,
        },
      });

      queryId = query.id;
    });

    it('should execute a SQL query', async () => {
      // Mock database service
      jest.mock('../src/services/database.service', () => ({
        connectToDatabase: jest.fn().mockResolvedValue(true),
        executeQuery: jest.fn().mockResolvedValue({
          rows: [{ id: 1, name: 'John' }],
          executionTime: 10,
        }),
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
      }));

      const response = await request(expressApp)
        .post('/api/queries/execute')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          queryId,
          sqlQuery: "SELECT * FROM users",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.query).toBeDefined();
      expect(response.body.data.query.sqlQuery).toBe('SELECT * FROM users');
      expect(response.body.data.query.result).toBeDefined();
    });

    it('should handle execution errors gracefully', async () => {
      // Mock database service to throw an error
      jest.mock('../src/services/database.service', () => ({
        connectToDatabase: jest.fn().mockResolvedValue(true),
        executeQuery: jest.fn().mockRejectedValue(new Error('SQL syntax error')),
        closeDatabaseConnection: jest.fn().mockResolvedValue(true),
      }));

      const response = await request(expressApp)
        .post('/api/queries/execute')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          queryId,
          sqlQuery: "INVALID SQL QUERY",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('SQL syntax error');
    });
  });

  describe('Query History', () => {
    it('should retrieve query history for a playground', async () => {
      const response = await request(expressApp)
        .get(`/api/queries/playground/${testPlayground.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.queries).toBeDefined();
      expect(Array.isArray(response.body.data.queries)).toBe(true);
    });

    it('should not retrieve query history for non-existent playground', async () => {
      const response = await request(expressApp)
        .get('/api/queries/playground/nonexistent-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });
}); 