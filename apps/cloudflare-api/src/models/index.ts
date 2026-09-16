import { Schema, model, models } from 'mongoose';

// ==========================================
// 1. Users
// ==========================================
const userSchema = new Schema({
    sql_user_id: { type: Number, unique: true, sparse: true }, // For migration tracking
    phone: { type: String, required: true, unique: true },
    password_hash: { type: String, required: true },
    role: { type: String, enum: ['SD_ADMIN', 'DISTRIBUTOR', 'SALES_REP', 'OFFLINE_CLIENT'], required: true },
    firm_name: { type: String },
    owner_name: { type: String },
    gst_number: { type: String },
    address: { type: String },
    wallet_balance: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// ==========================================
// 2. Categories
// ==========================================
const categorySchema = new Schema({
    sql_category_id: { type: Number, unique: true, sparse: true },
    name: { type: String, required: true, unique: true },
    created_at: { type: Date, default: Date.now }
});

// ==========================================
// 3. Products
// ==========================================
const productSchema = new Schema({
    sql_product_id: { type: Number, unique: true, sparse: true },
    category_id: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    name: { type: String, required: true },
    hsn_code: { type: String },
    gst_percent: { type: Number, default: 18.0 },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// ==========================================
// 4. Product Variants
// ==========================================
const variantSchema = new Schema({
    sql_variant_id: { type: Number, unique: true, sparse: true },
    product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    pack_size: { type: String, required: true },
    distributor_rate: { type: Number, default: 0 },
    retailer_rate: { type: Number, default: 0 },
    mrp: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// ==========================================
// 5. Orders
// ==========================================
const orderItemSchema = new Schema({
    sql_order_item_id: { type: Number, sparse: true },
    product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variant_id: { type: Schema.Types.ObjectId, ref: 'Variant', required: true },
    quantity: { type: Number, required: true },
    executed_qty: { type: Number, default: 0 },
    unit_price: { type: Number, required: true },
    created_at: { type: Date, default: Date.now }
});

const orderSchema = new Schema({
    sql_order_id: { type: Number, unique: true, sparse: true },
    distributor_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['PENDING', 'EXECUTED', 'CANCELLED'], default: 'PENDING' },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    items: [orderItemSchema]
});

// ==========================================
// 6. Invoices
// ==========================================
const invoiceSchema = new Schema({
    sql_invoice_id: { type: Number, unique: true, sparse: true },
    order_id: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    invoice_number: { type: String, required: true, unique: true },
    subtotal: { type: Number, required: true },
    cgst_amount: { type: Number, required: true },
    sgst_amount: { type: Number, required: true },
    grand_total: { type: Number, required: true },
    credit_applied: { type: Number, default: 0 },
    extra_discount: { type: Number, default: 0 },
    discount_reason: { type: String },
    paid_amount: { type: Number, default: 0 },
    payment_status: { type: String, enum: ['UNPAID', 'PARTIAL', 'PAID', 'PENDING'], default: 'UNPAID' },
    created_at: { type: Date, default: Date.now }
});

// ==========================================
// 7. Payments
// ==========================================
const paymentSchema = new Schema({
    sql_payment_id: { type: Number, unique: true, sparse: true },
    distributor_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    invoice_id: { type: Schema.Types.ObjectId, ref: 'Invoice' }, // Can be null if advance payment
    amount: { type: Number, required: true },
    payment_mode: { type: String, required: true },
    reference_number: { type: String },
    notes: { type: String },
    payment_date: { type: Date, default: Date.now },
    created_at: { type: Date, default: Date.now }
});

// ==========================================
// 8. Credit Notes
// ==========================================
const creditNoteItemSchema = new Schema({
    sql_cn_item_id: { type: Number, sparse: true },
    variant_id: { type: Schema.Types.ObjectId, ref: 'Variant' },
    quantity: { type: Number, required: true },
    pieces_qty: { type: Number, default: 0 },
    reason: { type: String },
    price_at_order: { type: Number, required: true },
    item_total: { type: Number, required: true }
});

const creditNoteSchema = new Schema({
    sql_credit_note_id: { type: Number, unique: true, sparse: true },
    distributor_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    cn_number: { type: String }, // Made optional
    total_amount: { type: Number, required: true },
    reason: { type: String },
    created_at: { type: Date, default: Date.now },
    items: [creditNoteItemSchema]
});

// ==========================================
// 9. Company Settings
// ==========================================
const companySettingsSchema = new Schema({
    sql_setting_id: { type: Number, sparse: true },
    address: { type: String },
    mobile_number: { type: String },
    state: { type: String },
    gst_number: { type: String },
    fssai_number: { type: String },
    claim_window_days: { type: Number, default: 7 },
    cgst_rate: { type: Number, default: 2.50 },
    sgst_rate: { type: Number, default: 2.50 },
    qr_code_image: { type: Buffer },
    qr_code_mimetype: { type: String },
    updated_at: { type: Date, default: Date.now }
});

// ==========================================
// ==========================================
// 10. Inventory
// ==========================================
const inventorySchema = new Schema({
    sql_inventory_id: { type: Number, unique: true, sparse: true },
    variant_id: { type: Schema.Types.ObjectId, ref: 'Variant', required: true, unique: true },
    stock_quantity: { type: Number, default: 0 },
    low_stock_threshold: { type: Number, default: 10 },
    updated_at: { type: Date, default: Date.now }
});

// ==========================================
// 11. Claims
// ==========================================
const claimSchema = new Schema({
    sql_claim_id: { type: Number, unique: true, sparse: true },
    distributor_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    order_id: { type: Schema.Types.ObjectId, ref: 'Order' },
    variant_id: { type: Schema.Types.ObjectId, ref: 'Variant', required: true },
    quantity: { type: Number, default: 0 },
    pieces_qty: { type: Number, default: 0 },
    reason: { type: String },
    image_binary: { type: Buffer },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    created_at: { type: Date, default: Date.now }
});

const getModel = (name: string, schema: any) => {
    return models?.[name] || model(name, schema);
};

export const User = getModel('User', userSchema);
export const Category = getModel('Category', categorySchema);
export const Product = getModel('Product', productSchema);
export const Variant = getModel('Variant', variantSchema);
export const Order = getModel('Order', orderSchema);
export const Invoice = getModel('Invoice', invoiceSchema);
export const Payment = getModel('Payment', paymentSchema);
export const CreditNote = getModel('CreditNote', creditNoteSchema);
export const CompanySettings = getModel('CompanySettings', companySettingsSchema);
export const Inventory = getModel('Inventory', inventorySchema);
export const Claim = getModel('Claim', claimSchema);
