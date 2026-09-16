const mongoose = require('mongoose'); 
const Models = require('../apps/api/mongoModels/index'); 
mongoose.connect('mongodb+srv://client_admin:mwB3r23ehlW0Lvmd@cluster0.zylwuu6.mongodb.net/DMS').then(async () => { 
    console.log('Products:', await Models.Product.countDocuments()); 
    console.log('Orders (PENDING):', await Models.Order.countDocuments({ status: 'PENDING' })); 
    const inventory = await Models.Inventory.find({ $expr: { $lte: ['$stock_quantity', '$low_stock_threshold'] } }); 
    console.log('Low Stock:', inventory.length); 
    process.exit(0); 
});
