# SQL Playground Backend Architecture

This document provides an overview of the architectural decisions made in the SQL Playground backend application.

## System Overview

The SQL Playground backend is designed to support natural language to SQL query generation, database connections management, and safe query execution through sandbox databases. The system allows users to:

1. Connect to various database types
2. Create isolated sandbox environments for query execution
3. Generate SQL queries from natural language prompts using OpenAI
4. Manage workspaces (playgrounds) with multiple database connections
5. Build SQL queries via a GUI interface for non-technical users

## Technology Stack

- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL for application data storage
- **ORM**: Prisma ORM for database access
- **Authentication**: JWT-based authentication
- **AI Integration**: OpenAI API for natural language processing
- **Database Connectors**: Support for PostgreSQL, MySQL, SQLite, and MongoDB

## Core Components

### Authentication System

JWT-based authentication with secure password hashing and token management. Provides user registration, login, and profile management.

### Database Connection Manager

Manages connections to user-provided databases with:

- Connection configuration storage (encrypted credentials)
- Dynamic connection establishment to various database types
- Database metadata extraction
- Connection pool management

### Sandbox Database System

Creates isolated sandbox environments for safe query execution:

- Schema replication from source database
- Dynamic sandbox creation and destruction
- Schema synchronization between original and sandbox databases
- Support for multiple database types

### Natural Language to SQL Engine

Integrates with OpenAI to convert natural language prompts to SQL:

- Context-aware query generation using database schema information
- Query explanation generation
- History tracking for improved context awareness

### Playground Management

Workspaces for organizing related database connections and queries:

- Multiple connections per playground
- Query history tracking
- Context preservation across sessions

### GUI Query Builder

Visual interface for building SQL queries:

- Schema-aware component
- SQL generation from visual configuration
- Sample query templates

## Data Flow

1. User authenticates and receives JWT token
2. User creates or accesses a playground
3. User adds database connections to their playground
4. For each connection, a sandbox database can be created
5. User inputs natural language prompt or uses GUI builder
6. System generates SQL query using OpenAI or GUI builder configuration
7. Query is executed against sandbox database
8. Results are returned to the user
9. Query and results are saved to history

## Security Considerations

- User passwords are hashed using bcrypt
- Database credentials are stored securely
- Sandbox databases isolate query execution from production databases
- API endpoints require authentication
- Rate limiting is applied to sensitive operations
- OpenAI API key is stored securely

## Scalability

The architecture supports horizontal scaling:

- Stateless API layer allows multiple instances
- Database connection pooling for efficient resource use
- Separate sandboxes per connection for isolation
- Asynchronous processing for resource-intensive operations

## Error Handling

Comprehensive error handling approach:

- Centralized error middleware
- Consistent error response format
- Detailed logging with winston
- Proper error categorization (client vs. server errors)

## Future Improvements

Potential enhancements to the system:

- Implement real-time collaborative editing
- Add database migration planning and execution
- Integrate with version control systems
- Provide SQL query optimization suggestions
- Support more database types
- Implement advanced data visualization for query results 