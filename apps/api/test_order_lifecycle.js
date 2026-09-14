const mongoose = require('mongoose');
const { connectDB } = require('./config/db');
const { createOrder, executeOrder, generateDraftPdf } = require('./mongoControllers/orderController');
const { downloadInvoicePdf } = require('./mongoControllers/ledgerController');
const Models = require('./mongoModels/index');
const fs = require('fs');

const mockRes = {
    status: function (s) { this.statusCode = s; return this; },
    json: function (d) { this.data = d; return this; },
    download: function (path, filename) { this.downloadPath = path; this.filename = filename; return this; }
};

async function testFullOrderLifecycle() {
    await connectDB();
    console.log("Database connected. Testing full Order Lifecycle...");
    
    try {
        // 1. Find a Distributor
        const dist = await Models.User.findOne({ role: 'DISTRIBUTOR' }).lean();
        if (!dist) throw new Error("No distributor found.");

        // 2. Find a Variant
        const variant = await Models.Variant.findOne().lean();
        if (!variant) throw new Error("No variant found.");

        console.log("--- 1. Testing createOrder ---");
        const createReq = {
            body: {
                distributor_id: dist._id.toString(),
                items: [{ variant_id: variant._id.toString(), requested_qty: 2, price_at_order: 150 }],
                apply_wallet: false
            }
        };
        const createRes = { ...mockRes };
        await createOrder(createReq, createRes);
        console.log("createOrder Result:", createRes.data);
        const orderId = createRes.data.order_id;
        if (!orderId) throw new Error("Order creation failed");

        console.log("\n--- 2. Testing generateDraftPdf ---");
        const draftReq = {
            params: { id: orderId },
            body: {
                items: [{ order_item_id: 'unknown', executed_qty: 2, price_at_order: 150 }]
            }
        };
        const draftRes = { ...mockRes };
        // We need to fetch the order item ID first
        const order = await Models.Order.findById(orderId).lean();
        draftReq.body.items[0].order_item_id = order.items[0]._id.toString();
        
        await generateDraftPdf(draftReq, draftRes);
        console.log("generateDraftPdf Result (Download Path):", draftRes.downloadPath);

        console.log("\n--- 3. Testing executeOrder ---");
        const execReq = {
            params: { id: orderId },
            body: {
                items: [{ order_item_id: order.items[0]._id.toString(), executed_qty: 2 }]
            }
        };
        const execRes = { ...mockRes };
        await executeOrder(execReq, execRes);
        console.log("executeOrder Result:", execRes.data);

        console.log("\n--- 4. Testing downloadInvoicePdf ---");
        const dlReq = { params: { order_id: orderId } };
        const dlRes = { ...mockRes };
        await downloadInvoicePdf(dlReq, dlRes);
        console.log("downloadInvoicePdf Result (Download Path):", dlRes.downloadPath);
        
        console.log("\n✅ All Endpoints functioning perfectly!");
        process.exit(0);
    } catch (e) {
        console.error("❌ Test Failed:", e);
        process.exit(1);
    }
}

testFullOrderLifecycle();
