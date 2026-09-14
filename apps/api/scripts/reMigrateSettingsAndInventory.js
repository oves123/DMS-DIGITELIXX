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

async function remigrate() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB.");

        const pool = await sql.connect(dbConfig);
        console.log("Connected to SQL.");

        // Remigrate CompanySettings
        console.log("Remigrating CompanySettings...");
        const settingsSql = await pool.request().query('SELECT * FROM CompanySettings');
        if (settingsSql.recordset.length > 0) {
            const s = settingsSql.recordset[0];
            let settingsMongo = await Models.CompanySettings.findOne();
            if (!settingsMongo) {
                settingsMongo = new Models.CompanySettings();
            }
            settingsMongo.address = s.address;
            settingsMongo.mobile_number = s.mobile_number;
            settingsMongo.state = s.state;
            settingsMongo.gst_number = s.gst_number;
            settingsMongo.fssai_number = s.fssai_number;
            settingsMongo.claim_window_days = s.claim_window_days;
            settingsMongo.cgst_rate = s.cgst_rate;
            settingsMongo.sgst_rate = s.sgst_rate;
            settingsMongo.qr_code_image = s.qr_code_image;
            settingsMongo.qr_code_mimetype = s.qr_code_mimetype;
            await settingsMongo.save();
            console.log("CompanySettings updated successfully.");
        }

        // Remigrate Inventory
        console.log("Remigrating Inventory...");
        const inventorySql = await pool.request().query('SELECT * FROM Inventory');
        let count = 0;
        for (const i of inventorySql.recordset) {
            const vQuery = { sql_variant_id: i.variant_id };
            const variant = await Models.Variant.findOne(vQuery);
            if (variant) {
                let inv = await Models.Inventory.findOne({ variant_id: variant._id });
                if (inv) {
                    inv.stock_quantity = i.current_stock_qty || 0;
                    inv.low_stock_threshold = i.low_stock_threshold || 5;
                    await inv.save();
                    count++;
                }
            }
        }
        console.log(`Inventory updated successfully for ${count} variants.`);

        console.log("Remigration Complete!");
        process.exit(0);

    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

remigrate();
