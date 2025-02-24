import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
// Remove this import that's causing the error
// import { DATABASE_URL } from '$env/static/private';

// Use environment variables directly or with fallbacks
const databaseUrl = process.env.DATABASE_URL || import.meta.env.DATABASE_URL;

// Add error handling for missing database URL
if (!databaseUrl) {
	console.error('DATABASE_URL is not defined in environment variables');
}

// Create the postgres client
const client = postgres(databaseUrl);

// Create the drizzle database instance
export const db = drizzle(client);
