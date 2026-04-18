import { Signer } from '@aws-sdk/rds-signer';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

let pool: Pool | undefined;
let tokenExpiresAt = 0;

const REQUIRED_ENV_VARS = [
  'AURORA_DB_HOST',
  'AURORA_DB_PORT',
  'AURORA_DB_NAME',
  'AURORA_DB_USER',
  'AWS_REGION',
];

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function validateEnv() {
  for (const name of REQUIRED_ENV_VARS) assertEnv(name);
}

async function getAuthToken() {
  const hostname = assertEnv('AURORA_DB_HOST');
  const port = Number(assertEnv('AURORA_DB_PORT'));
  const username = assertEnv('AURORA_DB_USER');
  const region = assertEnv('AWS_REGION');

  const signer = new Signer({
    hostname,
    port,
    username,
    region,
  });

  return signer.getAuthToken();
}

async function createPool() {
  validateEnv();

  const host = assertEnv('AURORA_DB_HOST');
  const port = Number(assertEnv('AURORA_DB_PORT'));
  const database = assertEnv('AURORA_DB_NAME');
  const user = assertEnv('AURORA_DB_USER');
  const password = await getAuthToken();

  tokenExpiresAt = Date.now() + 14 * 60 * 1000;

  return new Pool({
    host,
    port,
    database,
    user,
    password,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

async function getPool() {
  if (!pool || Date.now() >= tokenExpiresAt) {
    await pool?.end().catch(() => undefined);
    pool = await createPool();
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
) {
  const activePool = await getPool();
  return activePool.query<T>(text, params);
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const activePool = await getPool();
  const client = await activePool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
