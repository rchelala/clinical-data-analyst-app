import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Created once at module load so it's reused across requests within the
// same serverless instance, rather than reconnecting on every invocation.
export const sql = neon(databaseUrl);
