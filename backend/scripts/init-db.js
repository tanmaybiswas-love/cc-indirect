/**
 * Database initialization script
 * Creates all tables using raw SQL via pg package
 */
const { Client } = require('pg');

const createTablesSQL = `
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "password" TEXT,
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
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "language" TEXT NOT NULL DEFAULT 'javascript',
    "context" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "File" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "language" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
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
        
        // Add missing columns and fix constraints for existing tables
        console.log('Fixing existing table constraints...');
        
        // User password column
        try {
            await client.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "password" TEXT');
            console.log('Added password column to User table');
        } catch (e) { /* already exists */ }
        
        // Make Project.userId nullable (drop old FK constraint first)
        try {
            await client.query('ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_userId_fkey"');
            await client.query('ALTER TABLE "Project" ALTER COLUMN "userId" DROP NOT NULL');
            console.log('Made Project.userId nullable');
        } catch (e) { console.log('Project.userId already nullable:', e.message); }
        
        // Make File.projectId nullable
        try {
            await client.query('ALTER TABLE "File" DROP CONSTRAINT IF EXISTS "File_projectId_fkey"');
            await client.query('ALTER TABLE "File" ALTER COLUMN "projectId" DROP NOT NULL');
            console.log('Made File.projectId nullable');
        } catch (e) { console.log('File.projectId already nullable:', e.message); }
        
        // Make Message.projectId nullable
        try {
            await client.query('ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_projectId_fkey"');
            await client.query('ALTER TABLE "Message" ALTER COLUMN "projectId" DROP NOT NULL');
            console.log('Made Message.projectId nullable');
        } catch (e) { console.log('Message.projectId already nullable:', e.message); }
        
        console.log('Database initialization complete!');
    } catch (error) {
        console.error('Database initialization failed:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

initDB();
