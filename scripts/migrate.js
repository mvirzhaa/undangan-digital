const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

async function runWithRetry(maxAttempts = 15, delayMs = 2000) {
  const sql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await pool.query(sql);
      console.log('Migrasi database selesai.');
      await pool.end();
      return;
    } catch (err) {
      if (attempt === maxAttempts) {
        console.error('Migrasi gagal setelah beberapa percobaan:', err.message);
        process.exit(1);
      }
      console.log(`Menunggu database siap... (percobaan ${attempt}/${maxAttempts}: ${err.message})`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

runWithRetry();
