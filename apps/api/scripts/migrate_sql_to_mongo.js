const sql = require('mssql');
const mongoose = require('mongoose');
const Models = require('../mongoModels');
require('dotenv').config({ path: '../.env' });

const sqlConfig = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'Dms@2026',
    server: process.env.DB_SERVER || '65.1.187.13',
    database: process.env.DB_NAME || 'DMS',
    port: parseInt(process.env.DB_PORT) || 1433,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

const MONGO_URI = 'mongodb+srv://login_db_user:ZCptqugt1GofEQSi@cluster0.b5wi4hl.mongodb.net/DMS?retryWrites=true&w=majority';

async function migrate() {
    try {
        console.log('Connecting to MongoDB Atlas...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        console.log('Connecting to MS SQL Server...');
        const pool = await sql.connect(sqlConfig);
        console.log('✅ Connected to SQL Server');

        // CLEAR EXISTING MONGODB DATA
        console.log('\\n--- Wiping Existing MongoDB Data ---');
        await Models.User.deleteMany({});
        await Models.Category.deleteMany({});
        await Models.Product.deleteMany({});
        await Models.Variant.deleteMany({});
        await Models.Inventory.deleteMany({});
        await Models.Order.deleteMany({});
        await Models.Invoice.deleteMany({});
        await Models.Payment.deleteMany({});
        await Models.CreditNote.deleteMany({});
        await Models.Claim.deleteMany({});
        await Models.CompanySettings.deleteMany({});
        console.log('✅ MongoDB collections cleared. Ready for clean migration.');

        // Mapping dictionaries to replace SQL integer IDs with MongoDB ObjectIds
        const idMap = {
            users: {},
            categories: {},
            products: {},
            variants: {},
            orders: {},
            invoices: {}
        };

        // 1. Users
        console.log('\\n--- Migrating Users ---');
        let users = await pool.request().query('SELECT * FROM Users');
        for (const row of users.recordset) {
            const doc = await Models.User.findOneAndUpdate(
                { sql_user_id: row.user_id },
                {
                    sql_user_id: row.user_id,
                    phone: row.phone_number,
                    password_hash: row.password_hash,
                    role: row.role || 'DISTRIBUTOR',
                    firm_name: row.firm_name,
                    owner_name: row.owner_name,
                    gst_number: row.gst_number,
                    address: row.address,
                    wallet_balance: row.wallet_balance || 0,
                    fssai_number: row.fssai_number,
                    pan_card: row.pan_card,
                    aadhar_card: row.aadhar_card,
                    photo: row.photo,
                    rate_type: row.rate_type,
                    rate_version: row.rate_version,
                    created_at: row.created_at || new Date()
                },
                { upsert: true, new: true }
            );
            idMap.users[row.user_id] = doc._id;
        }
        console.log(`Migrated ${users.recordset.length} Users.`);

        // 2. Categories
        console.log('\\n--- Migrating Categories ---');
        let categories = await pool.request().query('SELECT * FROM Categories');
        for (const row of categories.recordset) {
            const doc = await Models.Category.findOneAndUpdate(
                { sql_category_id: row.category_id },
                {
                    sql_category_id: row.category_id,
                    name: row.name,
                    created_at: row.created_at || new Date()
                },
                { upsert: true, new: true }
            );
            idMap.categories[row.category_id] = doc._id;
        }
        console.log(`Migrated ${categories.recordset.length} Categories.`);

        // 3. Products
        console.log('\\n--- Migrating Products ---');
        let products = await pool.request().query('SELECT * FROM Products');
        for (const row of products.recordset) {
            const doc = await Models.Product.findOneAndUpdate(
                { sql_product_id: row.product_id },
                {
                    sql_product_id: row.product_id,
                    category_id: idMap.categories[row.category_id] || null,
                    name: row.name,
                    hsn_code: row.hsn_code,
                    gst_percent: row.gst_percent || 18,
                    uom: row.uom,
                    created_at: row.created_at || new Date()
                },
                { upsert: true, new: true }
            );
            idMap.products[row.product_id] = doc._id;
        }
        console.log(`Migrated ${products.recordset.length} Products.`);

        // 4. ProductVariants
        console.log('\\n--- Migrating Product Variants ---');
        let variants = await pool.request().query('SELECT * FROM ProductVariants');
        for (const row of variants.recordset) {
            const doc = await Models.Variant.findOneAndUpdate(
                { sql_variant_id: row.variant_id },
                {
                    sql_variant_id: row.variant_id,
                    product_id: idMap.products[row.product_id] || null,
                    pack_size: row.pack_size,
                    distributor_rate: row.distributor_rate,
                    retailer_rate: row.retailer_rate,
                    mrp: row.mrp,
                    pieces_per_box: row.pieces_per_box,
                    uom: row.uom,
                    old_distributor_rate: row.old_distributor_rate,
                    old_retailer_rate: row.old_retailer_rate,
                    created_at: row.created_at || new Date()
                },
                { upsert: true, new: true }
            );
            idMap.variants[row.variant_id] = doc._id;
        }
        console.log(`Migrated ${variants.recordset.length} Product Variants.`);

        // 5. Inventory
        console.log('\\n--- Migrating Inventory ---');
        let inventory = await pool.request().query('SELECT * FROM Inventory');
        for (const row of inventory.recordset) {
            await Models.Inventory.findOneAndUpdate(
                { sql_inventory_id: row.inventory_id },
                {
                    sql_inventory_id: row.inventory_id,
                    variant_id: idMap.variants[row.variant_id] || null,
                    stock_quantity: row.current_stock_qty || 0,
                    low_stock_threshold: row.low_stock_threshold || 10,
                    updated_at: row.last_updated_at || new Date()
                },
                { upsert: true, new: true }
            );
        }
        console.log(`Migrated ${inventory.recordset.length} Inventory Records.`);

        // 6. Orders & OrderItems
        console.log('\\n--- Migrating Orders & OrderItems ---');
        let orders = await pool.request().query('SELECT * FROM Orders');
        let allOrderItems = await pool.request().query('SELECT * FROM OrderItems');
        let orderItemsByOrder = {};
        for (const item of allOrderItems.recordset) {
            if (!orderItemsByOrder[item.order_id]) orderItemsByOrder[item.order_id] = [];
            orderItemsByOrder[item.order_id].push({
                sql_order_item_id: item.order_item_id,
                variant_id: idMap.variants[item.variant_id] || null,
                product_id: null, // Since we don't have product_id directly here, could be populated later, but Schema says required? Actually orderItemSchema requires product_id. Let's fix this below.
                quantity: item.requested_qty,
                executed_qty: item.executed_qty,
                unit_price: item.price_at_order,
                sd_remark: item.sd_remark
            });
        }

        // We need product_id for OrderItems based on VariantId.
        for (const oId in orderItemsByOrder) {
            for (const it of orderItemsByOrder[oId]) {
                if (it.variant_id) {
                    const variantDoc = await Models.Variant.findById(it.variant_id);
                    if (variantDoc) it.product_id = variantDoc.product_id;
                }
            }
        }

        for (const row of orders.recordset) {
            const items = orderItemsByOrder[row.order_id] || [];
            // Remove items without product_id to avoid validation error
            const validItems = items.filter(it => it.product_id && it.variant_id);

            const doc = await Models.Order.findOneAndUpdate(
                { sql_order_id: row.order_id },
                {
                    sql_order_id: row.order_id,
                    distributor_id: idMap.users[row.distributor_id] || null,
                    status: row.status,
                    order_date: row.order_date,
                    execution_date: row.execution_date,
                    apply_wallet: row.apply_wallet,
                    items: validItems,
                    created_at: row.order_date || new Date()
                },
                { upsert: true, new: true }
            );
            idMap.orders[row.order_id] = doc._id;
        }
        console.log(`Migrated ${orders.recordset.length} Orders (with their items).`);

        // 7. Invoices
        console.log('\\n--- Migrating Invoices ---');
        let invoices = await pool.request().query('SELECT * FROM Invoices');
        for (const row of invoices.recordset) {
            try {
                const doc = await Models.Invoice.findOneAndUpdate(
                    { sql_invoice_id: row.invoice_id },
                    {
                        sql_invoice_id: row.invoice_id,
                        order_id: idMap.orders[row.order_id] || null,
                        invoice_number: row.invoice_number,
                        subtotal: row.subtotal,
                        cgst_amount: row.cgst_amount,
                        sgst_amount: row.sgst_amount,
                        grand_total: row.grand_total,
                        pdf_url: row.pdf_url,
                        credit_applied: row.credit_applied,
                        extra_discount: row.extra_discount,
                        discount_reason: row.discount_reason,
                        paid_amount: row.paid_amount,
                        payment_status: row.payment_status,
                        created_at: row.created_at || new Date()
                    },
                    { upsert: true, new: true }
                );
                idMap.invoices[row.invoice_id] = doc._id;
            } catch (err) {
                if (err.code === 11000) {
                    console.log(`Duplicate invoice number detected: ${row.invoice_number}. Appending ID.`);
                    const doc = await Models.Invoice.findOneAndUpdate(
                        { sql_invoice_id: row.invoice_id },
                        {
                            sql_invoice_id: row.invoice_id,
                            order_id: idMap.orders[row.order_id] || null,
                            invoice_number: `${row.invoice_number}_dup_${row.invoice_id}`,
                            subtotal: row.subtotal,
                            cgst_amount: row.cgst_amount,
                            sgst_amount: row.sgst_amount,
                            grand_total: row.grand_total,
                            pdf_url: row.pdf_url,
                            credit_applied: row.credit_applied,
                            extra_discount: row.extra_discount,
                            discount_reason: row.discount_reason,
                            paid_amount: row.paid_amount,
                            payment_status: row.payment_status,
                            created_at: row.created_at || new Date()
                        },
                        { upsert: true, new: true }
                    );
                    idMap.invoices[row.invoice_id] = doc._id;
                } else {
                    throw err;
                }
            }
        }
        console.log(`Migrated ${invoices.recordset.length} Invoices.`);

        // 8. Payments
        console.log('\\n--- Migrating Payments ---');
        let payments = await pool.request().query('SELECT * FROM Payments');
        for (const row of payments.recordset) {
            await Models.Payment.findOneAndUpdate(
                { sql_payment_id: row.payment_id },
                {
                    sql_payment_id: row.payment_id,
                    distributor_id: idMap.users[row.distributor_id] || null,
                    invoice_id: idMap.invoices[row.invoice_id] || null,
                    amount: row.amount,
                    payment_mode: row.payment_mode,
                    reference_number: row.reference_no,
                    payment_date: row.payment_date,
                    recorded_by: idMap.users[row.recorded_by] || null,
                    created_at: row.created_at || new Date()
                },
                { upsert: true, new: true }
            );
        }
        console.log(`Migrated ${payments.recordset.length} Payments.`);

        // 9. CreditNotes & CreditNoteItems
        console.log('\\n--- Migrating CreditNotes ---');
        let creditNotes = await pool.request().query('SELECT * FROM CreditNotes');
        let allCNItems = await pool.request().query('SELECT * FROM CreditNoteItems');
        let cnItemsByCN = {};
        for (const item of allCNItems.recordset) {
            if (!cnItemsByCN[item.credit_note_id]) cnItemsByCN[item.credit_note_id] = [];
            cnItemsByCN[item.credit_note_id].push({
                sql_cn_item_id: item.credit_note_item_id,
                variant_id: idMap.variants[item.variant_id] || null,
                quantity: item.quantity,
                pieces_qty: item.pieces_qty,
                reason: item.reason,
                price_at_order: item.price_at_order,
                item_total: item.item_total
            });
        }

        for (const row of creditNotes.recordset) {
            const items = cnItemsByCN[row.credit_note_id] || [];
            await Models.CreditNote.findOneAndUpdate(
                { sql_credit_note_id: row.credit_note_id },
                {
                    sql_credit_note_id: row.credit_note_id,
                    distributor_id: idMap.users[row.distributor_id] || null,
                    invoice_id: idMap.invoices[row.invoice_id] || null,
                    cn_number: row.credit_note_number,
                    total_amount: row.amount,
                    payment_mode: row.payment_mode,
                    is_paid_out: row.is_paid_out,
                    pdf_url: row.pdf_url,
                    applied_details: row.applied_details,
                    created_at: row.created_at || new Date(),
                    items: items
                },
                { upsert: true, new: true }
            );
        }
        console.log(`Migrated ${creditNotes.recordset.length} Credit Notes.`);

        // 10. Claims
        console.log('\\n--- Migrating Claims ---');
        let claims = await pool.request().query('SELECT * FROM Claims');
        for (const row of claims.recordset) {
            await Models.Claim.findOneAndUpdate(
                { sql_claim_id: row.claim_id },
                {
                    sql_claim_id: row.claim_id,
                    distributor_id: idMap.users[row.distributor_id] || null,
                    order_id: idMap.orders[row.order_id] || null,
                    variant_id: idMap.variants[row.variant_id] || null,
                    quantity: row.quantity,
                    pieces_qty: row.pieces_qty,
                    reason: row.reason,
                    status: row.status,
                    created_at: row.created_at || new Date()
                },
                { upsert: true, new: true }
            );
        }
        console.log(`Migrated ${claims.recordset.length} Claims.`);

        // 11. CompanySettings
        console.log('\\n--- Migrating CompanySettings ---');
        let settings = await pool.request().query('SELECT * FROM CompanySettings');
        for (const row of settings.recordset) {
            await Models.CompanySettings.findOneAndUpdate(
                { sql_setting_id: row.setting_id },
                {
                    sql_setting_id: row.setting_id,
                    qr_code_image: row.qr_code_image,
                    qr_code_mimetype: row.qr_code_mimetype,
                    claim_window_days: row.claim_window_days,
                    cgst_rate: row.cgst_rate,
                    sgst_rate: row.sgst_rate,
                    address: row.address,
                    mobile_number: row.mobile_number,
                    state: row.state,
                    gst_number: row.gst_number,
                    fssai_number: row.fssai_number
                },
                { upsert: true, new: true }
            );
        }
        console.log(`Migrated ${settings.recordset.length} Company Settings.`);

        console.log('\\n✅✅ MIGRATION COMPLETED SUCCESSFULLY ✅✅');
        await mongoose.disconnect();
        await pool.close();
        process.exit(0);

    } catch (err) {
        console.error('Migration Error:', err);
        process.exit(1);
    }
}

migrate();
