import { AzureOpenAI } from 'openai';
import azureOpenAIClient from '../src/utils/azureOpenai';

// Mock the AzureOpenAI class
jest.mock('openai', () => {
  const mockChatCompletionsCreate = jest.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            query: 'SELECT * FROM users WHERE age > 18',
            explanation: 'This query selects all users older than 18'
          })
        }
      }
    ]
  });

  return {
    AzureOpenAI: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockChatCompletionsCreate
        }
      }
    }))
  };
});

describe('Azure OpenAI Integration Tests', () => {
  // Save original env vars
  const originalEnv = { ...process.env };

  beforeAll(() => {
    // Setup test environment variables
    process.env.USE_AZURE_OPENAI = 'true';
    process.env.AZURE_OPENAI_ENDPOINT = 'https://test-endpoint.openai.azure.com/';
    process.env.AZURE_OPENAI_API_KEY = 'test-api-key';
    process.env.AZURE_OPENAI_DEPLOYMENT = 'test-deployment';
    process.env.AZURE_OPENAI_MODEL_NAME = 'gpt-4o-mini';
    process.env.AZURE_OPENAI_API_VERSION = '2024-04-01-preview';
  });

  afterAll(() => {
    // Restore original env vars
    process.env = originalEnv;
  });

  it('should create an Azure OpenAI client with correct configuration', () => {
    // Re-import the client after setting env vars
    jest.resetModules();
    const azureClient = require('../src/utils/azureOpenai').default;
    
    // Verify AzureOpenAI was constructed with correct parameters
    expect(AzureOpenAI).toHaveBeenCalledWith({
      endpoint: 'https://test-endpoint.openai.azure.com/',
      apiKey: 'test-api-key',
      deployment: 'test-deployment',
      apiVersion: '2024-04-01-preview',
    });
  });

  it('should call chat completions with correct parameters', async () => {
    const messages = [
      { role: 'system', content: 'You are a SQL expert' },
      { role: 'user', content: 'Get all users older than 18' }
    ];

    await azureOpenAIClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.5,
      max_tokens: 500
    });

    // Get the mock function
    const mockCreate = (azureOpenAIClient.chat.completions.create as jest.Mock);
    
    // Verify the mock was called with correct parameters
    expect(mockCreate).toHaveBeenCalledWith({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.5,
      max_tokens: 500
    });
  });

  it('should handle errors gracefully', async () => {
    // Override the mock to throw an error
    const mockCreate = (azureOpenAIClient.chat.completions.create as jest.Mock);
    mockCreate.mockRejectedValueOnce(new Error('Azure OpenAI API error'));

    try {
      await azureOpenAIClient.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'test' }],
      });
      fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).toBe('Azure OpenAI API error');
    }

    // Reset the mock
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              query: 'SELECT * FROM users',
              explanation: 'This query selects all users'
            })
          }
        }
      ]
    });
  });
}); 