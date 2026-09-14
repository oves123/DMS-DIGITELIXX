const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = 'mongodb://client_admin:mwB3r23ehlW0Lvmd@ac-wiv8wxz-shard-00-00.zylwuu6.mongodb.net:27017,ac-wiv8wxz-shard-00-01.zylwuu6.mongodb.net:27017,ac-wiv8wxz-shard-00-02.zylwuu6.mongodb.net:27017/DMS?ssl=true&replicaSet=atlas-22cj8k-shard-0&authSource=admin';

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
