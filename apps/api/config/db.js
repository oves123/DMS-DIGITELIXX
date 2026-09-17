const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://login_db_user:ZCptqugt1GofEQSi@cluster0.b5wi4hl.mongodb.net/DMS?retryWrites=true&w=majority';

const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB Atlas Database: DMS');
    } catch (err) {
        console.error('❌ Database Connection Failed!', err);
        process.exit(1);
    }
};

module.exports = { connectDB };
