# Testing the SQL Playground Backend

This directory contains tests for the SQL Playground backend, including the Azure OpenAI integration.

## Setup

1. Create a `.env.test` file in the root directory with the following content:

```
# Test environment settings
NODE_ENV=test
PORT=3001
LOG_LEVEL=error

# Use in-memory SQLite database for tests
DATABASE_URL="file::memory:?cache=shared"

# JWT for authentication tests
JWT_SECRET=test_jwt_secret_key
JWT_EXPIRY=1h

# OpenAI mock settings (not used in tests, just for configuration)
OPENAI_API_KEY=sk-test-mock-api-key

# Azure OpenAI settings (not used in tests as we mock the client)
USE_AZURE_OPENAI=true
AZURE_OPENAI_ENDPOINT=https://test-endpoint.openai.azure.com/
AZURE_OPENAI_API_KEY=test-api-key
AZURE_OPENAI_DEPLOYMENT=test-deployment
AZURE_OPENAI_MODEL_NAME=gpt-4o-mini
AZURE_OPENAI_API_VERSION=2024-04-01-preview

# Sandbox settings for tests
SANDBOX_DB_PREFIX=test_sandbox_
SANDBOX_DB_HOST=localhost
SANDBOX_DB_PORT=0
SANDBOX_DB_USER=test_user
SANDBOX_DB_PASSWORD=test_password
```

2. Install dependencies:

```bash
npm install
```

3. Generate Prisma client:

```bash
npx prisma generate
```

## Running Tests

Run all tests:

```bash
npm test
```

Run tests in watch mode (useful during development):

```bash
npm run test:watch
```

Generate test coverage report:

```bash
npm run test:coverage
```

## Test Structure

The tests are organized by feature:

- `auth.test.ts`: Authentication (login, signup, token validation)
- `query.test.ts`: Query generation and execution
- `connection.test.ts`: Database connection management and sandbox
- `azureOpenai.test.ts`: Azure OpenAI integration

## Mocking

The tests use Jest's mocking capabilities to:

1. Mock OpenAI and Azure OpenAI API calls
2. Mock database service functions
3. Provide test data

## Test Database

Tests use an in-memory SQLite database via Prisma, which is set up and torn down for each test suite.

## Adding New Tests

To add tests for a new feature:

1. Create a new test file with the `.test.ts` extension
2. Import the necessary setup utilities from `setup.ts`
3. Structure your tests with `describe` and `it` blocks
4. Make sure to clean up any resources your tests create 