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

async function remigrateCreditNoteItemsFull() {
    try {
        await mongoose.connect(MONGO_URI);
        const pool = await sql.connect(dbConfig);
        
        const cnSql = await pool.request().query('SELECT * FROM CreditNotes');
        const cnItemsSql = await pool.request().query('SELECT * FROM CreditNoteItems');
        
        const variants = await Models.Variant.find().lean();
        const variantMap = {};
        for(let v of variants) {
            variantMap[v.sql_variant_id] = v;
        }

        let updatedCount = 0;
        let totalItemsPushed = 0;

        for (const c of cnSql.recordset) {
            const mongoCN = await Models.CreditNote.findOne({ sql_credit_note_id: c.credit_note_id });
            if (!mongoCN) continue;

            const items = cnItemsSql.recordset.filter(i => i.credit_note_id === c.credit_note_id);
            const mongoItems = [];
            
            for (let i of items) {
                const v = variantMap[i.variant_id];
                
                // Push ALL items, even if the variant no longer exists.
                mongoItems.push({
                    sql_cn_item_id: i.cn_item_id,
                    variant_id: v ? v._id : undefined, // Leave undefined if orphaned
                    quantity: i.quantity || 0,
                    pieces_qty: i.pieces_qty || 0,
                    reason: i.reason || c.reason || (v ? 'Claim' : 'Direct Amount / Orphaned Item'),
                    price_at_order: i.price_at_order || 0,
                    item_total: i.item_total || 0
                });
            }

            if (mongoItems.length > 0) {
                mongoCN.items = mongoItems;
                await mongoCN.save();
                updatedCount++;
                totalItemsPushed += mongoItems.length;
            }
        }

        console.log(`Successfully embedded ${totalItemsPushed} items into ${updatedCount} credit notes, including the orphaned ones.`);
        process.exit(0);

    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

remigrateCreditNoteItemsFull();
