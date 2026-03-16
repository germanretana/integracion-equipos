import pkg from "pg";

const { Pool } = pkg;

let pool = null;

export function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set.");
  }

  pool = new Pool({
    connectionString,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
  });

  return pool;
}

export async function testConnection() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const res = await client.query("select now()");
    return res.rows[0];
  } finally {
    client.release();
  }
}
