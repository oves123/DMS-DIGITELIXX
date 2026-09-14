const mongoose = require('mongoose');
const { connectDB } = require('./config/db');
const { updateStock } = require('./mongoControllers/inventoryController');

const mockRes = {
    status: function (s) { this.statusCode = s; return this; },
    json: function (d) { this.data = d; return this; }
};

async function testCRUD() {
    await connectDB();
    console.log("Database connected. Testing CRUD...");
    
    // Test updating stock
    const variant = await mongoose.model('Variant').findOne().lean();
    if (!variant) {
        console.error("No variants found to update stock.");
        process.exit(1);
    }

    console.log(`Updating stock for variant ${variant._id}...`);
    const req = {
        body: { variant_id: variant._id.toString(), added_qty: 100 }
    };
    const res = { ...mockRes };

    await updateStock(req, res);

    if (res.statusCode === 200 || !res.statusCode) {
        console.log("✅ Stock update successful:", res.data);
    } else {
        console.error("❌ Stock update failed:", res.data);
    }

    process.exit(0);
}

testCRUD();
