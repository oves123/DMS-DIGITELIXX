require('dotenv').config({ path: './apps/api/.env' });
const db = require('./apps/api/config/db');

async function checkPrices() {
  try {
    const pool = await db.connectDB();
    const result = await pool.request().query(`
      SELECT p.name, v.pack_size, v.retailer_rate, v.old_retailer_rate, v.distributor_rate, v.old_distributor_rate
      FROM ProductVariants v
      JOIN Products p ON v.product_id = p.product_id
      WHERE p.name LIKE '%ROCK SALTED CHIPS%'
    `);
    console.table(result.recordset);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkPrices();
