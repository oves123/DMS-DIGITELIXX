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

async function remigrateOrderItems() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB.");

        const pool = await sql.connect(dbConfig);
        console.log("Connected to SQL.");

        console.log("Fetching Orders from SQL to re-populate items...");
        const ordersSql = await pool.request().query('SELECT * FROM Orders');
        const orderItemsSql = await pool.request().query('SELECT * FROM OrderItems');
        
        console.log(`Found ${ordersSql.recordset.length} orders, ${orderItemsSql.recordset.length} items.`);

        // Create a map of sql_variant_id -> mongo variant document
        const variants = await Models.Variant.find().lean();
        const variantMap = {};
        for(let v of variants) {
            variantMap[v.sql_variant_id] = v;
        }

        let updatedCount = 0;
        for (const o of ordersSql.recordset) {
            // Find order in Mongo
            const mongoOrder = await Models.Order.findOne({ sql_order_id: o.order_id });
            if (!mongoOrder) continue;

            const items = orderItemsSql.recordset.filter(i => i.order_id === o.order_id);
            const mongoItems = [];
            
            for (let i of items) {
                const v = variantMap[i.variant_id];
                if (v) {
                    mongoItems.push({
                        sql_order_item_id: i.order_item_id,
                        product_id: v.product_id, // We get product_id from the variant
                        variant_id: v._id,
                        quantity: i.requested_qty || 0,
                        executed_qty: i.executed_qty || 0,
                        unit_price: i.price_at_order || 0,
                        created_at: mongoOrder.created_at
                    });
                }
            }

            if (mongoItems.length > 0) {
                mongoOrder.items = mongoItems;
                await mongoOrder.save();
                updatedCount++;
            }
        }

        console.log(`Successfully embedded items into ${updatedCount} orders.`);
        process.exit(0);

    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

remigrateOrderItems();
