require('dotenv').config({ path: './apps/api/.env' });
const db = require('./apps/api/config/db');

async function checkUsers() {
  try {
    const pool = await db.connectDB();
    const result = await pool.request().query(`
      SELECT user_id, firm_name, rate_type, rate_version 
      FROM Users 
      WHERE firm_name LIKE '%SHIV%' OR firm_name LIKE '%PRABHAKAR%'
    `);
    console.table(result.recordset);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkUsers();
