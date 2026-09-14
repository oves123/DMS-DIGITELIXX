const mongoose = require('mongoose');
const { connectDB } = require('./config/db');

// Mock req and res
const mockRes = {
    status: function (s) { this.statusCode = s; return this; },
    json: function (d) { this.data = d; return this; },
    send: function (d) { this.data = d; return this; },
    setHeader: function () {},
    set: function () {}
};

async function testAll() {
    await connectDB();
    console.log("Database connected. Testing controllers...");

    const controllers = [
        { name: 'Dashboard.getMetrics', fn: require('./mongoControllers/dashboardController').getMetrics, req: { user: { user_id: 1, role: 'SD_ADMIN' } } },
        { name: 'Product.getProducts', fn: require('./mongoControllers/productController').getProducts, req: { user: { user_id: 1, role: 'SD_ADMIN' } } },
        { name: 'Product.getCategories', fn: require('./mongoControllers/productController').getCategories, req: {} },
        { name: 'Inventory.getInventory', fn: require('./mongoControllers/inventoryController').getInventory, req: {} },
        { name: 'Order.getAdminOrders', fn: require('./mongoControllers/orderController').getAdminOrders, req: {} },
        { name: 'Distributor.getDistributors', fn: require('./mongoControllers/distributorController').getDistributors, req: {} },
        { name: 'Claim.getClaims', fn: require('./mongoControllers/claimsController').getClaims, req: {} },
        { name: 'Ledger.getInvoices', fn: require('./mongoControllers/ledgerController').getInvoices, req: { query: {} } },
        { name: 'Ledger.getCreditNoteStats', fn: require('./mongoControllers/ledgerController').getCreditNoteStats, req: {} },
        { name: 'Report.getAdminSales', fn: require('./mongoControllers/reportsController').getAdminSales, req: { query: {} } },
        { name: 'Report.getAdminTopProducts', fn: require('./mongoControllers/reportsController').getAdminTopProducts, req: { query: {} } },
        { name: 'Report.getAdminTopDistributors', fn: require('./mongoControllers/reportsController').getAdminTopDistributors, req: { query: {} } },
        { name: 'Report.getDetailedTransactions', fn: require('./mongoControllers/reportsController').getDetailedTransactions, req: { query: {} } },
        { name: 'Settings.getCompanySettings', fn: require('./mongoControllers/settingsController').getCompanySettings, req: {} }
    ];

    let allPassed = true;
    for (const test of controllers) {
        try {
            const res = { ...mockRes };
            await test.fn(test.req, res);
            if (res.statusCode === 500) {
                console.error(`❌ ${test.name} FAILED with 500:`, res.data);
                allPassed = false;
            } else if (res.statusCode === 404) {
                console.log(`⚠️ ${test.name} returned 404 (Expected if no data):`, res.data);
            } else {
                console.log(`✅ ${test.name} PASSED. Data items:`, Array.isArray(res.data) ? res.data.length : (res.data ? Object.keys(res.data).length : 'None'));
            }
        } catch (e) {
            console.error(`❌ ${test.name} THREW ERROR:`, e);
            allPassed = false;
        }
    }

    console.log(allPassed ? "\n🎉 ALL TESTS PASSED!" : "\n💥 SOME TESTS FAILED.");
    process.exit(allPassed ? 0 : 1);
}

testAll();
