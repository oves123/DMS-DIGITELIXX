require('dotenv').config({ path: '../.env' });
const sql = require('mssql');
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const Models = require('../mongoModels/index');

const MONGO_URI = 'mongodb://client_admin:mwB3r23ehlW0Lvmd@ac-wiv8wxz-shard-00-00.zylwuu6.mongodb.net:27017,ac-wiv8wxz-shard-00-01.zylwuu6.mongodb.net:27017,ac-wiv8wxz-shard-00-02.zylwuu6.mongodb.net:27017/DMS?ssl=true&replicaSet=atlas-22cj8k-shard-0&authSource=admin';

async function migrateData() {
    try {
        console.log('🔗 Connecting to MSSQL...');
        const pool = await connectDB();
        
        console.log('🔗 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ MongoDB Connected!');

        // Clear existing data in MongoDB to avoid duplicates during testing
        console.log('🧹 Clearing old MongoDB data...');
        await Promise.all(Object.values(Models).map(model => model.deleteMany({})));

        // Mappings for SQL IDs to Mongo ObjectIds
        const idMap = {
            users: {},
            categories: {},
            products: {},
            variants: {},
            orders: {},
            invoices: {}
        };

        // 1. Users
        console.log('🔄 Migrating Users...');
        const usersRes = await pool.request().query('SELECT * FROM Users');
        for (const u of usersRes.recordset) {
            const doc = await Models.User.create({
                sql_user_id: u.user_id,
                phone: u.phone || u.phone_number || ('UNKNOWN_' + u.user_id),
                password_hash: u.password_hash || 'none',
                role: u.role,
                firm_name: u.firm_name,
                owner_name: u.owner_name,
                gst_number: u.gst_number,
                address: u.address,
                wallet_balance: u.wallet_balance || 0,
                created_at: u.created_at,
                updated_at: u.updated_at
            });
            idMap.users[u.user_id] = doc._id;
        }

        // 2. Categories
        console.log('🔄 Migrating Categories...');
        const catRes = await pool.request().query('SELECT * FROM Categories');
        for (const c of catRes.recordset) {
            const doc = await Models.Category.create({
                sql_category_id: c.category_id,
                name: c.name,
                created_at: c.created_at
            });
            idMap.categories[c.category_id] = doc._id;
        }

        // 3. Products
        console.log('🔄 Migrating Products...');
        const prodRes = await pool.request().query('SELECT * FROM Products');
        for (const p of prodRes.recordset) {
            const doc = await Models.Product.create({
                sql_product_id: p.product_id,
                category_id: idMap.categories[p.category_id],
                name: p.name,
                hsn_code: p.hsn_code,
                gst_percent: p.gst_percent,
                created_at: p.created_at,
                updated_at: p.updated_at
            });
            idMap.products[p.product_id] = doc._id;
        }

        // 4. Product Variants
        console.log('🔄 Migrating Product Variants...');
        const varRes = await pool.request().query('SELECT * FROM ProductVariants');
        for (const v of varRes.recordset) {
            const doc = await Models.Variant.create({
                sql_variant_id: v.variant_id,
                product_id: idMap.products[v.product_id],
                pack_size: v.pack_size,
                distributor_rate: v.distributor_rate, // Reverted from nd_rate during schema check
                retailer_rate: v.retailer_rate,
                mrp: v.mrp,
                created_at: v.created_at,
                updated_at: v.updated_at
            });
            idMap.variants[v.variant_id] = doc._id;
        }

        // 5. Inventory
        console.log('🔄 Migrating Inventory...');
        const invRes = await pool.request().query('SELECT * FROM Inventory');
        for (const i of invRes.recordset) {
            await Models.Inventory.create({
                sql_inventory_id: i.inventory_id,
                variant_id: idMap.variants[i.variant_id],
                stock_quantity: i.stock_quantity,
                low_stock_threshold: i.low_stock_threshold,
                updated_at: i.updated_at
            });
        }

        // 6. Orders & Order Items
        console.log('🔄 Migrating Orders...');
        const orderRes = await pool.request().query('SELECT * FROM Orders');
        for (const o of orderRes.recordset) {
            // Fetch items for this order
            const itemsRes = await pool.request()
                .input('oid', sql.Int, o.order_id)
                .query('SELECT * FROM OrderItems WHERE order_id = @oid');
            
            const items = itemsRes.recordset
                .filter(i => idMap.products[i.product_id] && idMap.variants[i.variant_id])
                .map(i => ({
                    sql_order_item_id: i.order_item_id,
                    product_id: idMap.products[i.product_id],
                    variant_id: idMap.variants[i.variant_id],
                    quantity: i.quantity,
                    executed_qty: i.executed_qty,
                    unit_price: i.unit_price,
                    created_at: i.created_at
                }));

            const doc = await Models.Order.create({
                sql_order_id: o.order_id,
                distributor_id: idMap.users[o.distributor_id], // nd_user_id was renamed to distributor_id
                status: o.status,
                created_at: o.created_at,
                updated_at: o.updated_at,
                items: items
            });
            idMap.orders[o.order_id] = doc._id;
        }

        // 7. Invoices
        console.log('🔄 Migrating Invoices...');
        const invoiceRes = await pool.request().query('SELECT * FROM Invoices');
        for (const i of invoiceRes.recordset) {
            if (!idMap.orders[i.order_id]) continue; // Skip if order doesn't exist
            
            const doc = await Models.Invoice.create({
                sql_invoice_id: i.invoice_id,
                order_id: idMap.orders[i.order_id],
                invoice_number: i.invoice_number,
                subtotal: i.subtotal,
                cgst_amount: i.cgst_amount,
                sgst_amount: i.sgst_amount,
                grand_total: i.grand_total,
                credit_applied: i.credit_applied,
                extra_discount: i.extra_discount,
                discount_reason: i.discount_reason,
                paid_amount: i.paid_amount,
                payment_status: i.payment_status,
                created_at: i.created_at
            });
            idMap.invoices[i.invoice_id] = doc._id;
        }

        // 8. Payments
        console.log('🔄 Migrating Payments...');
        const payRes = await pool.request().query('SELECT * FROM Payments');
        for (const p of payRes.recordset) {
            if (!idMap.users[p.distributor_id]) continue; // Skip if user doesn't exist

            await Models.Payment.create({
                sql_payment_id: p.payment_id,
                distributor_id: idMap.users[p.distributor_id], // Was nd_user_id or distributor_id
                invoice_id: p.invoice_id ? idMap.invoices[p.invoice_id] : null,
                amount: p.amount,
                payment_mode: p.payment_mode,
                reference_number: p.reference_number,
                notes: p.notes,
                payment_date: p.payment_date,
                created_at: p.created_at
            });
        }

        // 9. Credit Notes
        console.log('🔄 Migrating Credit Notes...');
        const cnRes = await pool.request().query('SELECT * FROM CreditNotes');
        for (const c of cnRes.recordset) {
            if (!idMap.users[c.distributor_id]) continue; // Skip if user doesn't exist
            
            await Models.CreditNote.create({
                sql_credit_note_id: c.credit_note_id,
                distributor_id: idMap.users[c.distributor_id],
                cn_number: c.cn_number || `CN-${c.credit_note_id}`,
                total_amount: c.amount || c.total_amount || 0,
                reason: c.reason || 'Claim Settlement',
                created_at: c.created_at
            });
        }

        // 10. Company Settings
        console.log('🔄 Migrating Company Settings...');
        const setRes = await pool.request().query('SELECT * FROM CompanySettings');
        for (const s of setRes.recordset) {
            await Models.CompanySettings.create({
                sql_setting_id: s.setting_id,
                account_name: s.account_name,
                account_no: s.account_no,
                bank_name: s.bank_name,
                ifsc_code: s.ifsc_code,
                branch: s.branch,
                email: s.email,
                updated_at: s.updated_at
            });
        }

        console.log('✅✅✅ MIGRATION COMPLETED SUCCESSFULLY! ✅✅✅');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration Failed:', error);
        process.exit(1);
    }
}

migrateData();
