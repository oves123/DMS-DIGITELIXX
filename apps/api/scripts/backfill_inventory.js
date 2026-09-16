const mongoose = require('mongoose');
const Models = require('../mongoModels');

const MONGO_URI = 'mongodb+srv://client_admin:mwB3r23ehlW0Lvmd@cluster0.zylwuu6.mongodb.net/DMS';

async function backfill() {
    try {
        console.log('Connecting to MongoDB Atlas...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const variants = await Models.Variant.find({});
        const inventories = await Models.Inventory.find({});

        const inventoryVariantIds = new Set(inventories.map(inv => inv.variant_id.toString()));

        let addedCount = 0;

        for (const variant of variants) {
            if (!inventoryVariantIds.has(variant._id.toString())) {
                await Models.Inventory.create({
                    sql_inventory_id: -addedCount - 1,
                    variant_id: variant._id,
                    stock_quantity: 0,
                    low_stock_threshold: 10,
                    updated_at: new Date()
                });
                addedCount++;
            }
        }

        console.log(`✅ Backfilled ${addedCount} missing inventory records.`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

backfill();
