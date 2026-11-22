const { Pool } = require('pg');
const cfg = require('./config');

const pool = new Pool({ connectionString: cfg.databaseUrl, max: 10 });

pool.on('error', (err) => console.error('[pg] koneksi idle error:', err.message));

const query = (text, params) => pool.query(text, params);

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, tx };
