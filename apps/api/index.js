const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const { connectDB } = require('./config/db');

const app = express();

// Trust reverse proxy (Nginx, Cloudflare, etc.) so rate limiter uses real client IP
app.set('trust proxy', 'loopback');

// Middleware
// Restrict CORS to specific origins
const corsOptions = {
    origin: '*',
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rate Limiting for Login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 login requests per windowMs
    message: { message: 'Too many login attempts from this IP, please try again after 15 minutes' }
});

// Initialize Database Connection
connectDB();

// Routes
app.use('/api/auth/login', loginLimiter); // Apply limiter specifically to login
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/inventory', require('./routes/inventoryRoutes'));
app.use('/api/distributors', require('./routes/distributorRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/ledger', require('./routes/ledgerRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/claims', require('./routes/claimsRoutes'));

// Basic Test Route
app.get('/', (req, res) => {
    res.send('DMS Backend API is Running!');
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
