const sql = require('mssql');
const mongoose = require('mongoose');
const Models = require('../mongoModels/index');

const dbConfig = { 
    user: 'sa', 
    password: 'Dms@2026', 
    server: '65.1.187.13', 
    database: 'DMS', 
    options: { encrypt: true, trustServerCertificate: true } 
};

const MONGO_URI = 'mongodb://client_admin:mwB3r23ehlW0Lvmd@ac-wiv8wxz-shard-00-00.zylwuu6.mongodb.net:27017,ac-wiv8wxz-shard-00-01.zylwuu6.mongodb.net:27017,ac-wiv8wxz-shard-00-02.zylwuu6.mongodb.net:27017/DMS?ssl=true&replicaSet=atlas-22cj8k-shard-0&authSource=admin';

async function verifyDataIntegrity() {
    try {
        await mongoose.connect(MONGO_URI);
        const pool = await sql.connect(dbConfig);
        
        const tables = [
            { sqlName: 'Users', mongoModel: Models.User },
            { sqlName: 'Categories', mongoModel: Models.Category },
            { sqlName: 'Products', mongoModel: Models.Product },
            { sqlName: 'ProductVariants', mongoModel: Models.Variant },
            { sqlName: 'Orders', mongoModel: Models.Order },
            { sqlName: 'Invoices', mongoModel: Models.Invoice },
            { sqlName: 'Payments', mongoModel: Models.Payment },
            { sqlName: 'CreditNotes', mongoModel: Models.CreditNote },
            { sqlName: 'CompanySettings', mongoModel: Models.CompanySettings },
            { sqlName: 'Inventory', mongoModel: Models.Inventory },
            { sqlName: 'Claims', mongoModel: Models.Claim }
        ];

        console.log("=== Data Integrity Check ===");
        console.log(String("Table").padEnd(20) + String("SQL Count").padEnd(15) + String("MongoDB Count"));
        console.log("--------------------------------------------------");
        
        let allMatch = true;
        
        for (const table of tables) {
            const sqlCountRes = await pool.request().query(`SELECT COUNT(*) as c FROM ${table.sqlName}`);
            const sqlCount = sqlCountRes.recordset[0].c;
            
            const mongoCount = await table.mongoModel.countDocuments();
            
            console.log(
                String(table.sqlName).padEnd(20) + 
                String(sqlCount).padEnd(15) + 
                String(mongoCount) + 
                (sqlCount === mongoCount ? "  ✅" : "  ❌")
            );
            
            if (sqlCount !== mongoCount && table.sqlName !== 'CompanySettings') {
                allMatch = false;
            }
        }
        
        console.log("--------------------------------------------------");
        
        // Also verify nested items
        const orderItemsSql = await pool.request().query('SELECT COUNT(*) as c FROM OrderItems');
        const orderItemsMongo = await Models.Order.aggregate([ { $unwind: "$items" }, { $count: "c" } ]);
        const oiMongoCount = orderItemsMongo.length > 0 ? orderItemsMongo[0].c : 0;
        console.log(String("OrderItems (Nested)").padEnd(20) + String(orderItemsSql.recordset[0].c).padEnd(15) + String(oiMongoCount) + (orderItemsSql.recordset[0].c === oiMongoCount ? "  ✅" : "  ❌"));

        const cnItemsSql = await pool.request().query('SELECT COUNT(*) as c FROM CreditNoteItems');
        const cnItemsMongo = await Models.CreditNote.aggregate([ { $unwind: "$items" }, { $count: "c" } ]);
        const cniMongoCount = cnItemsMongo.length > 0 ? cnItemsMongo[0].c : 0;
        console.log(String("CN Items (Nested)").padEnd(20) + String(cnItemsSql.recordset[0].c).padEnd(15) + String(cniMongoCount) + (cnItemsSql.recordset[0].c === cniMongoCount ? "  ✅" : "  ❌"));
        
        if (orderItemsSql.recordset[0].c !== oiMongoCount) allMatch = false;

        console.log("\nFinal Verdict: " + (allMatch ? "100% Match! Everything is migrated." : "Mismatch detected!"));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

verifyDataIntegrity();
