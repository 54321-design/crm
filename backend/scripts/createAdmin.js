// Usage: node scripts/createAdmin.js "Your Name" you@example.com YourPassword
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');
const { normEmail } = require('../src/utils/normalize');

(async () => {
  const [name, rawEmail, password] = process.argv.slice(2);
  const email = normEmail(rawEmail);
  if (!name || !email || !password || password.length < 8) {
    console.error('Usage: node scripts/createAdmin.js "Name" email@example.com password(min 8 chars)');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,'admin')
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = 'admin', is_active = 1`,
    [name, email, hash]);
  console.log(`Admin ready: ${email}`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
