import mongoose from 'mongoose';
import * as fs from 'fs';
import { User, Category, Product, Variant, Order, Invoice, Payment, CreditNote, CompanySettings, Inventory, Claim } from './src/models';

const MONGO_URI = "mongodb+srv://login_db_user:ZCptqugt1GofEQSi@cluster0.b5wi4hl.mongodb.net/DMS?retryWrites=true&w=majority";

// Helper to escape strings for SQL
function escape(val: any): string {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (val instanceof Date) return String(Math.floor(val.getTime() / 1000)); // Store as unix timestamp
    // Escape single quotes by doubling them
    return `'${String(val).replace(/'/g, "''")}'`;
}

async function run() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected.');

    const sqlFile = fs.createWriteStream('import.sql');
    
    // We will batch inserts to avoid huge statements, but D1 supports reasonably large statements.
    function writeInsert(table: string, columns: string[], rows: any[][]) {
        if (rows.length === 0) return;
        const colStr = columns.join(', ');
        const valsStr = rows.map(r => `(${r.map(escape).join(', ')})`).join(',\n');
        sqlFile.write(`INSERT OR IGNORE INTO ${table} (${colStr}) VALUES\n${valsStr};\n\n`);
    }

    // 1. Users
    console.log('Migrating Users...');
    const users = await User.find().lean();
    writeInsert('users', ['id', 'sql_user_id', 'phone', 'password_hash', 'role', 'firm_name', 'owner_name', 'gst_number', 'address', 'wallet_balance', 'created_at', 'updated_at'], users.map((u: any) => [
        u._id.toString(), u.sql_user_id, u.phone, u.password_hash, u.role, u.firm_name, u.owner_name, u.gst_number, u.address, u.wallet_balance, u.created_at, u.updated_at
    ]));

    // 2. Categories
    console.log('Migrating Categories...');
    const cats = await Category.find().lean();
    writeInsert('categories', ['id', 'sql_category_id', 'name', 'created_at'], cats.map((c: any) => [
        c._id.toString(), c.sql_category_id, c.name, c.created_at
    ]));

    // 3. Products
    console.log('Migrating Products...');
    const prods = await Product.find().lean();
    writeInsert('products', ['id', 'sql_product_id', 'category_id', 'name', 'hsn_code', 'gst_percent', 'created_at', 'updated_at'], prods.map((p: any) => [
        p._id.toString(), p.sql_product_id, p.category_id?.toString(), p.name, p.hsn_code, p.gst_percent, p.created_at, p.updated_at
    ]));

    // 4. Variants
    console.log('Migrating Variants...');
    const vars = await Variant.find().lean();
    writeInsert('variants', ['id', 'sql_variant_id', 'product_id', 'pack_size', 'uom', 'distributor_rate', 'retailer_rate', 'mrp', 'created_at', 'updated_at'], vars.map((v: any) => [
        v._id.toString(), v.sql_variant_id, v.product_id?.toString(), v.pack_size, v.uom, v.distributor_rate, v.retailer_rate, v.mrp, v.created_at, v.updated_at
    ]));

    // 5. Orders & Order Items
    console.log('Migrating Orders...');
    const orders = await Order.find().lean();
    writeInsert('orders', ['id', 'sql_order_id', 'distributor_id', 'status', 'apply_wallet', 'order_date', 'execution_date', 'created_at', 'updated_at'], orders.map((o: any) => [
        o._id.toString(), o.sql_order_id, o.distributor_id?.toString(), o.status, o.apply_wallet ? 1 : 0, o.order_date, o.execution_date, o.created_at, o.updated_at
    ]));

    const orderItems: any[][] = [];
    orders.forEach((o: any) => {
        if(o.items) {
            o.items.forEach((i: any) => {
                orderItems.push([
                    i._id.toString(), i.sql_order_item_id, o._id.toString(), i.product_id?.toString(), i.variant_id?.toString(), i.quantity, i.executed_qty, i.unit_price, i.created_at
                ]);
            });
        }
    });
    // Chunk order items just in case
    for(let i=0; i<orderItems.length; i+=500) {
        writeInsert('order_items', ['id', 'sql_order_item_id', 'order_id', 'product_id', 'variant_id', 'quantity', 'executed_qty', 'unit_price', 'created_at'], orderItems.slice(i, i+500));
    }

    // 6. Invoices
    console.log('Migrating Invoices...');
    const invs = await Invoice.find().lean();
    writeInsert('invoices', ['id', 'sql_invoice_id', 'order_id', 'invoice_number', 'subtotal', 'cgst_amount', 'sgst_amount', 'grand_total', 'credit_applied', 'extra_discount', 'discount_reason', 'paid_amount', 'payment_status', 'pdf_url', 'created_at'], invs.map((i: any) => [
        i._id.toString(), i.sql_invoice_id, i.order_id?.toString(), i.invoice_number, i.subtotal, i.cgst_amount, i.sgst_amount, i.grand_total, i.credit_applied, i.extra_discount, i.discount_reason, i.paid_amount, i.payment_status, i.pdf_url, i.created_at
    ]));

    // 7. Payments
    console.log('Migrating Payments...');
    const pays = await Payment.find().lean();
    writeInsert('payments', ['id', 'sql_payment_id', 'distributor_id', 'invoice_id', 'amount', 'payment_mode', 'reference_number', 'notes', 'payment_date', 'created_at'], pays.map((p: any) => [
        p._id.toString(), p.sql_payment_id, p.distributor_id?.toString(), p.invoice_id?.toString(), p.amount, p.payment_mode, p.reference_number, p.notes, p.payment_date, p.created_at
    ]));

    // 8. Credit Notes & Items
    console.log('Migrating Credit Notes...');
    const cns = await CreditNote.find().lean();
    writeInsert('credit_notes', ['id', 'sql_credit_note_id', 'distributor_id', 'cn_number', 'total_amount', 'reason', 'created_at'], cns.map((c: any) => [
        c._id.toString(), c.sql_credit_note_id, c.distributor_id?.toString(), c.cn_number, c.total_amount, c.reason, c.created_at
    ]));

    const cnItems: any[][] = [];
    cns.forEach((c: any) => {
        if(c.items) {
            c.items.forEach((i: any) => {
                cnItems.push([
                    i._id.toString(), i.sql_cn_item_id, c._id.toString(), i.variant_id?.toString(), i.quantity, i.pieces_qty, i.reason, i.price_at_order, i.item_total
                ]);
            });
        }
    });
    for(let i=0; i<cnItems.length; i+=500) {
        writeInsert('credit_note_items', ['id', 'sql_cn_item_id', 'credit_note_id', 'variant_id', 'quantity', 'pieces_qty', 'reason', 'price_at_order', 'item_total'], cnItems.slice(i, i+500));
    }

    // 9. Company Settings
    console.log('Migrating Company Settings...');
    const settings = await CompanySettings.find().lean();
    writeInsert('company_settings', ['id', 'sql_setting_id', 'address', 'mobile_number', 'state', 'gst_number', 'fssai_number', 'claim_window_days', 'cgst_rate', 'sgst_rate', 'qr_code_mimetype', 'updated_at'], settings.map((s: any) => [
        s._id.toString(), s.sql_setting_id, s.address, s.mobile_number, s.state, s.gst_number, s.fssai_number, s.claim_window_days, s.cgst_rate, s.sgst_rate, s.qr_code_mimetype, s.updated_at
    ]));
    // Note: skipping qr_code_image (binary) for now, can be added later if needed.

    // 10. Inventory
    console.log('Migrating Inventory...');
    const invData = await Inventory.find().lean();
    writeInsert('inventory', ['id', 'sql_inventory_id', 'variant_id', 'stock_quantity', 'low_stock_threshold', 'updated_at'], invData.map((i: any) => [
        i._id.toString(), i.sql_inventory_id, i.variant_id?.toString(), i.stock_quantity, i.low_stock_threshold, i.updated_at
    ]));

    // 11. Claims
    console.log('Migrating Claims...');
    const claims = await Claim.find().lean();
    writeInsert('claims', ['id', 'sql_claim_id', 'distributor_id', 'order_id', 'variant_id', 'quantity', 'pieces_qty', 'reason', 'status', 'created_at'], claims.map((c: any) => [
        c._id.toString(), c.sql_claim_id, c.distributor_id?.toString(), c.order_id?.toString(), c.variant_id?.toString(), c.quantity, c.pieces_qty, c.reason, c.status, c.created_at
    ]));

    sqlFile.end();
    console.log('Finished writing import.sql');
    process.exit(0);
}

run().catch(console.error);
