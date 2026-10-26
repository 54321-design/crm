// Creates all tables (and the default statuses/sources/workflows) in the database from backend/.env.
// Safe to run more than once. Usage: npm run setup:db
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT || 3306),
    database: process.env.DATABASE_NAME || 'crm',
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    multipleStatements: true,
    ssl: process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA.replace(/\\n/g, '\n') }
      : process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: false } : undefined,
  });
  // Use the database named in .env instead of the CREATE DATABASE / USE lines in the file.
  const sql = fs.readFileSync(path.join(__dirname, '../../database/schema.sql'), 'utf8')
    .replace(/^CREATE DATABASE.*$/im, '').replace(/^USE .*$/im, '');
  await conn.query(sql);
  const [t] = await conn.query('SHOW TABLES');
  console.log(`Done. ${t.length} tables in "${process.env.DATABASE_NAME || 'crm'}".`);
  await conn.end();
})().catch((e) => { console.error('Setup failed:', e.message); process.exit(1); });
