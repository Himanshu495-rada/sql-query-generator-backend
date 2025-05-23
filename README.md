# SQL Playground Backend

A powerful backend for a SQL query generation tool with AI assistance. This service allows users to connect to various databases, create sandboxed environments, and generate SQL queries from natural language using OpenAI.

## Features

- User authentication and account management
- Support for multiple database types (PostgreSQL, MySQL, SQLite, MongoDB)
- Sandbox database creation for safe query execution
- OpenAI integration for natural language to SQL conversion
- Query history and playground management
- GUI query builder for non-technical users
- Sample query generation for tables

## Prerequisites

- Node.js 16+
- PostgreSQL for the main application database
- Optionally: MySQL, SQLite, MongoDB if you want to connect to those database types

## Setup

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file based on `.env.example` with your configurations:

```
# Application settings
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# Database connection (PostgreSQL)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sql_playground"

# JWT settings
JWT_SECRET=your_jwt_secret_key_here
TOKEN_EXPIRATION=8h

# OpenAI API
OPENAI_API_KEY=your_openai_api_key

# Sandbox settings
SANDBOX_DB_PREFIX=sandbox_
SANDBOX_DB_HOST=localhost
SANDBOX_DB_PORT=5432
SANDBOX_DB_USER=sandbox_user
SANDBOX_DB_PASSWORD=sandbox_password

# Azure OpenAI API (Optional)
# See AZURE_OPENAI_SETUP.md for detailed setup instructions
USE_AZURE_OPENAI=true
AZURE_OPENAI_ENDPOINT=your_azure_openai_endpoint
AZURE_OPENAI_API_KEY=your_azure_openai_api_key
AZURE_OPENAI_DEPLOYMENT=your_deployment_name
AZURE_OPENAI_MODEL_NAME=your_model_name
AZURE_OPENAI_API_VERSION=2024-04-01-preview
```

4. Generate Prisma client:

```bash
npx prisma generate
```

5. Set up the database:

```bash
npx prisma migrate dev --name init
```

6. Start the development server:

```bash
npm run dev
```

## Project Structure

- **src/**: Source code
  - **controllers/**: API route handlers
  - **middleware/**: Express middleware functions
  - **models/**: Data models
  - **routes/**: API route definitions
  - **services/**: Business logic services
  - **utils/**: Utility functions and types
  - **index.ts**: Main application entry point
- **prisma/**: Prisma ORM files
  - **schema.prisma**: Database schema definition

## API Endpoints

### Authentication
- `POST /api/auth/register`: Register a new user
- `POST /api/auth/login`: Login with email and password
- `GET /api/auth/me`: Get current user profile

### User Management
- `GET /api/users/profile`: Get user profile
- `PUT /api/users/profile`: Update user profile
- `PUT /api/users/settings`: Update user settings

### Database Connections
- `GET /api/connections`: Get all connections
- `POST /api/connections`: Create a new connection
- `GET /api/connections/:id`: Get connection by ID
- `PUT /api/connections/:id`: Update connection
- `DELETE /api/connections/:id`: Delete connection

### Playgrounds
- `GET /api/playgrounds`: Get all playgrounds
- `POST /api/playgrounds`: Create a new playground
- `GET /api/playgrounds/:id`: Get playground by ID
- `PUT /api/playgrounds/:id`: Update playground
- `DELETE /api/playgrounds/:id`: Delete playground

### Queries
- `POST /api/queries/generate`: Generate SQL from natural language
- `POST /api/queries/execute`: Execute a SQL query
- `GET /api/queries/playground/:playgroundId`: Get query history

### Sandbox
- `GET /api/sandbox/status/:connectionId`: Get sandbox status
- `POST /api/sandbox/create/:connectionId`: Create a sandbox
- `POST /api/sandbox/reset/:sandboxId`: Reset a sandbox

### GUI Builder
- `GET /api/gui-builder/schema/:connectionId`: Get schema for GUI builder
- `POST /api/gui-builder/generate`: Generate SQL from GUI configuration

## License

[MIT](LICENSE) 