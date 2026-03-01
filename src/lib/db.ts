import { Pool, PoolConfig } from "pg";

const defaultConfig: PoolConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5442"),
  database: process.env.DB_NAME || "glosis",
  user: process.env.DB_USER || "glosis",
  password: process.env.DB_PASSWORD || "glosis",
  max: 10,
  idleTimeoutMillis: 30000,
};

let pool: Pool | null = null;

export function getPool(config?: Partial<PoolConfig>): Pool {
  if (!pool) {
    pool = new Pool({ ...defaultConfig, ...config });
  }
  return pool;
}

export async function getPoolForDb(dbName: string): Promise<Pool> {
  return new Pool({ ...defaultConfig, database: dbName });
}

export async function query(text: string, params?: unknown[]) {
  const client = await getPool().connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

export async function listDatabases(): Promise<string[]> {
  const adminPool = new Pool({ ...defaultConfig, database: "postgres" });
  try {
    const result = await adminPool.query(
      "SELECT datname FROM pg_database WHERE datistemplate = false AND datname != 'postgres' ORDER BY datname"
    );
    return result.rows.map((r: { datname: string }) => r.datname);
  } finally {
    await adminPool.end();
  }
}
