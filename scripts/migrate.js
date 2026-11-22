const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Migrasi database selesai.');
  await pool.end();
})().catch((err) => {
  console.error('Migrasi gagal:', err.message);
  process.exit(1);
});
