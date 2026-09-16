const sql = require('mssql');
require('dotenv').config();

const sqlConfig = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'Dms@2026',
    server: process.env.DB_SERVER || '65.1.187.13',
    database: process.env.DB_NAME || 'DMS',
    port: parseInt(process.env.DB_PORT) || 1433,
    options: { encrypt: false, trustServerCertificate: true }
};

async function check() {
    const pool = await sql.connect(sqlConfig);
    const result = await pool.request().query("SELECT order_id, status FROM Orders WHERE status = 'PENDING'");
    console.log("SQL PENDING orders count:", result.recordset.length);
    console.log("SQL PENDING orders:", result.recordset);
    process.exit(0);
}
check();
