import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
    id: text('id').primaryKey(),
    sql_user_id: integer('sql_user_id').unique(),
    phone: text('phone').notNull().unique(),
    password_hash: text('password_hash').notNull(),
    role: text('role').notNull(),
    firm_name: text('firm_name'),
    owner_name: text('owner_name'),
    gst_number: text('gst_number'),
    address: text('address'),
    wallet_balance: real('wallet_balance').default(0),
    created_at: integer('created_at', { mode: 'timestamp_ms' }),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' })
});

export const categories = sqliteTable('categories', {
    id: text('id').primaryKey(),
    sql_category_id: integer('sql_category_id').unique(),
    name: text('name').notNull().unique(),
    created_at: integer('created_at', { mode: 'timestamp_ms' })
});

export const products = sqliteTable('products', {
    id: text('id').primaryKey(),
    sql_product_id: integer('sql_product_id').unique(),
    category_id: text('category_id').notNull().references(() => categories.id),
    name: text('name').notNull(),
    hsn_code: text('hsn_code'),
    gst_percent: real('gst_percent').default(18.0),
    created_at: integer('created_at', { mode: 'timestamp_ms' }),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' })
});

export const variants = sqliteTable('variants', {
    id: text('id').primaryKey(),
    sql_variant_id: integer('sql_variant_id').unique(),
    product_id: text('product_id').notNull().references(() => products.id),
    pack_size: text('pack_size').notNull(),
    uom: text('uom'),
    distributor_rate: real('distributor_rate').default(0),
    retailer_rate: real('retailer_rate').default(0),
    old_distributor_rate: real('old_distributor_rate'),
    old_retailer_rate: real('old_retailer_rate'),
    mrp: real('mrp').default(0),
    pieces_per_box: integer('pieces_per_box').default(1),
    created_at: integer('created_at', { mode: 'timestamp_ms' }),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' })
});

export const orders = sqliteTable('orders', {
    id: text('id').primaryKey(),
    sql_order_id: integer('sql_order_id').unique(),
    distributor_id: text('distributor_id').notNull().references(() => users.id),
    status: text('status').default('PENDING'),
    apply_wallet: integer('apply_wallet', { mode: 'boolean' }).default(false),
    order_date: integer('order_date', { mode: 'timestamp_ms' }),
    execution_date: integer('execution_date', { mode: 'timestamp_ms' }),
    created_at: integer('created_at', { mode: 'timestamp_ms' }),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' })
});

export const orderItems = sqliteTable('order_items', {
    id: text('id').primaryKey(),
    sql_order_item_id: integer('sql_order_item_id'),
    order_id: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    product_id: text('product_id').notNull().references(() => products.id),
    variant_id: text('variant_id').notNull().references(() => variants.id),
    quantity: integer('quantity').notNull(),
    executed_qty: integer('executed_qty').default(0),
    unit_price: real('unit_price').notNull(),
    created_at: integer('created_at', { mode: 'timestamp_ms' })
});

export const invoices = sqliteTable('invoices', {
    id: text('id').primaryKey(),
    sql_invoice_id: integer('sql_invoice_id').unique(),
    order_id: text('order_id').notNull().references(() => orders.id),
    invoice_number: text('invoice_number').notNull().unique(),
    subtotal: real('subtotal').notNull(),
    cgst_amount: real('cgst_amount').notNull(),
    sgst_amount: real('sgst_amount').notNull(),
    grand_total: real('grand_total').notNull(),
    credit_applied: real('credit_applied').default(0),
    extra_discount: real('extra_discount').default(0),
    discount_reason: text('discount_reason'),
    paid_amount: real('paid_amount').default(0),
    payment_status: text('payment_status').default('UNPAID'),
    pdf_url: text('pdf_url'),
    created_at: integer('created_at', { mode: 'timestamp_ms' })
});

export const payments = sqliteTable('payments', {
    id: text('id').primaryKey(),
    sql_payment_id: integer('sql_payment_id').unique(),
    distributor_id: text('distributor_id').notNull().references(() => users.id),
    invoice_id: text('invoice_id').references(() => invoices.id),
    amount: real('amount').notNull(),
    payment_mode: text('payment_mode').notNull(),
    reference_number: text('reference_number'),
    notes: text('notes'),
    payment_date: integer('payment_date', { mode: 'timestamp_ms' }),
    created_at: integer('created_at', { mode: 'timestamp_ms' })
});

export const creditNotes = sqliteTable('credit_notes', {
    id: text('id').primaryKey(),
    sql_credit_note_id: integer('sql_credit_note_id').unique(),
    distributor_id: text('distributor_id').notNull().references(() => users.id),
    cn_number: text('cn_number'),
    total_amount: real('total_amount').notNull(),
    reason: text('reason'),
    applied_details: text('applied_details'),
    created_at: integer('created_at', { mode: 'timestamp_ms' })
});

export const creditNoteItems = sqliteTable('credit_note_items', {
    id: text('id').primaryKey(),
    sql_cn_item_id: integer('sql_cn_item_id'),
    credit_note_id: text('credit_note_id').notNull().references(() => creditNotes.id, { onDelete: 'cascade' }),
    variant_id: text('variant_id').references(() => variants.id),
    quantity: integer('quantity').notNull(),
    pieces_qty: integer('pieces_qty').default(0),
    reason: text('reason'),
    price_at_order: real('price_at_order').notNull(),
    item_total: real('item_total').notNull()
});

export const companySettings = sqliteTable('company_settings', {
    id: text('id').primaryKey(),
    sql_setting_id: integer('sql_setting_id'),
    address: text('address'),
    mobile_number: text('mobile_number'),
    state: text('state'),
    gst_number: text('gst_number'),
    fssai_number: text('fssai_number'),
    claim_window_days: integer('claim_window_days').default(7),
    cgst_rate: real('cgst_rate').default(2.50),
    sgst_rate: real('sgst_rate').default(2.50),
    qr_code_image: blob('qr_code_image', { mode: 'buffer' }),
    qr_code_mimetype: text('qr_code_mimetype'),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' })
});

export const inventory = sqliteTable('inventory', {
    id: text('id').primaryKey(),
    sql_inventory_id: integer('sql_inventory_id').unique(),
    variant_id: text('variant_id').notNull().unique().references(() => variants.id),
    stock_quantity: integer('stock_quantity').default(0),
    low_stock_threshold: integer('low_stock_threshold').default(10),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' })
});

export const claims = sqliteTable('claims', {
    id: text('id').primaryKey(),
    sql_claim_id: integer('sql_claim_id').unique(),
    distributor_id: text('distributor_id').notNull().references(() => users.id),
    order_id: text('order_id').references(() => orders.id),
    variant_id: text('variant_id').notNull().references(() => variants.id),
    quantity: integer('quantity').default(0),
    pieces_qty: integer('pieces_qty').default(0),
    reason: text('reason'),
    image_binary: blob('image_binary', { mode: 'buffer' }),
    status: text('status').default('PENDING'),
    created_at: integer('created_at', { mode: 'timestamp_ms' })
});
