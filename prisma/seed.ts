import { PrismaClient, DatabaseType } from '@prisma/client';
import { hash } from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding database...');

  try {
    // Create default admin user
    const adminPassword = await hash('admin123', 10);
    const admin = await prisma.user.upsert({
      where: { email: 'admin@example.com' },
      update: {},
      create: {
        id: uuidv4(),
        email: 'admin@example.com',
        password: adminPassword,
        name: 'Admin User',
        settings: {
          create: {
            id: uuidv4(),
            theme: 'dark',
            codeEditorTheme: 'vs-dark',
            notificationsEnabled: true,
          },
        },
      },
    });

    console.log(`👤 Created admin user: ${admin.email}`);

    // Create default demo user
    const demoPassword = await hash('demo123', 10);
    const demoUser = await prisma.user.upsert({
      where: { email: 'demo@example.com' },
      update: {},
      create: {
        id: uuidv4(),
        email: 'demo@example.com',
        password: demoPassword,
        name: 'Demo User',
        settings: {
          create: {
            id: uuidv4(),
            theme: 'light',
            codeEditorTheme: 'vs-light',
            notificationsEnabled: true,
          },
        },
      },
    });

    console.log(`👤 Created demo user: ${demoUser.email}`);

    // Create sample connections for demo user
    const sampleSqliteConnection = await prisma.connection.upsert({
      where: {
        id: 'sample-sqlite-connection',
      },
      update: {},
      create: {
        id: 'sample-sqlite-connection',
        name: 'Sample SQLite Database',
        type: DatabaseType.SQLITE,
        connectionString: './sample.db',
        isSample: true,
        isActive: true,
        userId: demoUser.id,
      },
    });

    console.log(`🔌 Created sample SQLite connection: ${sampleSqliteConnection.name}`);

    // Create sample PostgreSQL connection
    const samplePgConnection = await prisma.connection.upsert({
      where: {
        id: 'sample-pg-connection',
      },
      update: {},
      create: {
        id: 'sample-pg-connection',
        name: 'Sample PostgreSQL Database',
        type: DatabaseType.POSTGRESQL,
        host: 'localhost',
        port: 5432,
        username: 'postgres',
        password: 'postgres',
        database: 'sample_db',
        isSample: true,
        isActive: true,
        userId: demoUser.id,
      },
    });

    console.log(`🔌 Created sample PostgreSQL connection: ${samplePgConnection.name}`);

    // Create a sample playground
    const samplePlayground = await prisma.playground.upsert({
      where: {
        id: 'sample-playground',
      },
      update: {},
      create: {
        id: 'sample-playground',
        name: 'Sample Playground',
        description: 'A playground with sample databases for demonstration purposes',
        userId: demoUser.id,
      },
    });

    console.log(`🎮 Created sample playground: ${samplePlayground.name}`);

    // Add connections to playground
    await prisma.playgroundConnection.upsert({
      where: {
        playgroundId_connectionId: {
          playgroundId: samplePlayground.id,
          connectionId: sampleSqliteConnection.id,
        },
      },
      update: {},
      create: {
        playgroundId: samplePlayground.id,
        connectionId: sampleSqliteConnection.id,
      },
    });

    await prisma.playgroundConnection.upsert({
      where: {
        playgroundId_connectionId: {
          playgroundId: samplePlayground.id,
          connectionId: samplePgConnection.id,
        },
      },
      update: {},
      create: {
        playgroundId: samplePlayground.id,
        connectionId: samplePgConnection.id,
      },
    });

    console.log('🔄 Added connections to sample playground');

    // Add a sample query
    const sampleQuery = await prisma.query.upsert({
      where: {
        id: 'sample-query',
      },
      update: {},
      create: {
        id: 'sample-query',
        playgroundId: samplePlayground.id,
        prompt: 'Show me all users',
        sqlQuery: 'SELECT * FROM users;',
        explanation: 'This query retrieves all records from the users table.',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log(`📝 Created sample query: ${sampleQuery.prompt}`);

    // Add a sample API key
    const openaiKey = await prisma.apiKey.upsert({
      where: {
        userId_service: {
          userId: demoUser.id,
          service: 'openai',
        },
      },
      update: {},
      create: {
        id: uuidv4(),
        userId: demoUser.id,
        service: 'openai',
        key: 'sk-demo-key-not-real',
        isActive: true,
      },
    });

    console.log(`🔑 Created sample API key for: ${openaiKey.service}`);

    console.log('✅ Seed completed successfully!');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 