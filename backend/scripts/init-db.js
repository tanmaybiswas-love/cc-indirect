/**
 * Database initialization script
 * Creates all tables using raw SQL via pg package
 */
const { Client } = require('pg');

const createTablesSQL = `
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "name" TEXT,
    "avatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "provider" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "language" TEXT NOT NULL DEFAULT 'javascript',
    "context" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "File" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "language" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "File_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "RateLimit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "minuteKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RateLimit_provider_minuteKey_key" UNIQUE ("provider", "minuteKey")
);

CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checksum" TEXT NOT NULL,
    "finished_at" TIMESTAMP(3),
    "migration_name" TEXT NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);
`;

async function initDB() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        console.error('DATABASE_URL not set!');
        process.exit(1);
    }
    const url = new URL(databaseUrl);
    const client = new Client({
        host: url.hostname,
        port: parseInt(url.port) || 5432,
        user: url.username,
        password: url.password,
        database: url.pathname.slice(1),
        ssl: { rejectUnauthorized: false }
    });
    try {
        console.log('Connecting to database...');
        await client.connect();
        console.log('Creating tables...');
        await client.query(createTablesSQL);
        console.log('All tables created successfully!');
    } catch (error) {
        console.error('Database initialization failed:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

initDB();
