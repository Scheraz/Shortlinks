const { Pool } = require('pg');

// All config from env vars — injected via K8s ConfigMap/Secret at deploy
// time (or via Azure Key Vault CSI driver in the AKS version), never
// hardcoded, so the same image runs unmodified across environments.
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || process.env.POSTGRES_USER || 'postgres',
  password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || 'postgres',
  database: process.env.PGDATABASE || process.env.POSTGRES_DB || 'shortlink',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error(JSON.stringify({ level: 'error', msg: 'pg pool error', error: err.message }));
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS links (
      code TEXT PRIMARY KEY,
      target_url TEXT NOT NULL,
      click_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function pingDb() {
  await pool.query('SELECT 1');
}

module.exports = { pool, initSchema, pingDb };
