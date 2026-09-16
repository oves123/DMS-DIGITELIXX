const sql = require('mssql');

const config = {
    user: 'sa',
    password: 'Dms@2026',
    server: '65.1.187.13',
    database: 'DMS',
    port: 1433,
    options: {
        encrypt: true, // Use this if you're on Windows Azure
        trustServerCertificate: true // Change to true for local dev / self-signed certs
    }
};

async function checkSQL() {
    try {
        console.log('Connecting to SQL Server...');
        let pool = await sql.connect(config);
        console.log('Connected!');
        
        let result = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
        `);
        
        console.log('Tables found:');
        console.dir(result.recordset);
        
        pool.close();
    } catch (err) {
        console.error('SQL connection error:', err);
    }
}

checkSQL();
