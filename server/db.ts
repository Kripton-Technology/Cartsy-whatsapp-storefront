import net from 'node:net';
import dns from 'node:dns';

// Ensure IPv4 is preferred and autoselect timeout doesn't stall queries
if (typeof (net as any).setDefaultAutoSelectFamily === 'function') {
  (net as any).setDefaultAutoSelectFamily(false);
}
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

import { neon } from '@neondatabase/serverless';
import { env } from './env.js';

if (!env.databaseUrl) {
  console.error('\n⚠️  [DATABASE WARNING] Missing DATABASE_URL in .env');
  console.error('👉 Copy .env.example to .env and paste your Neon PostgreSQL connection string.\n');
}

export const sql = env.databaseUrl ? neon(env.databaseUrl) : (null as any);

export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  if (!sql) {
    throw new Error('DATABASE_URL is not configured. Please add your database connection string to .env');
  }
  return sql.query(text, params) as Promise<T[]>;
}
