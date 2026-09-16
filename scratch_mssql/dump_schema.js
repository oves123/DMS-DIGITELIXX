const sql = require('mssql');

const config = {
    user: 'sa',
    password: 'Dms@2026',
    server: '65.1.187.13',
    database: 'DMS',
    port: 1433,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function getSchemas() {
    try {
        let pool = await sql.connect(config);
        let result = await pool.request().query(`
            SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME IN (
                'CompanySettings', 'Claims', 'OldCreditNotes', 'Payments',
                'CreditNotes', 'CreditNoteItems', 'Users', 'Categories',
                'Products', 'ProductVariants', 'Inventory', 'Orders',
                'OrderItems', 'Invoices'
            )
            ORDER BY TABLE_NAME, ORDINAL_POSITION
        `);
        
        const schema = {};
        for (const row of result.recordset) {
            if (!schema[row.TABLE_NAME]) schema[row.TABLE_NAME] = [];
            schema[row.TABLE_NAME].push(`${row.COLUMN_NAME} (${row.DATA_TYPE})`);
        }
        
        console.log(JSON.stringify(schema, null, 2));
        pool.close();
    } catch (err) {
        console.error(err);
    }
}

getSchemas();
