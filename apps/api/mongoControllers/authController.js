const Models = require('../mongoModels/index');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// @desc    Login user (SD or ND)
// @route   POST /api/auth/login
const loginUser = async (req, res) => {
    try {
        const { phone_number, password } = req.body;

        if (!phone_number || !password) {
            return res.status(400).json({ message: 'Please provide phone number and password' });
        }

        // Check if user exists using Mongoose
        const user = await Models.User.findOne({ phone: phone_number });

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password_hash).catch(() => false);
        if (!isMatch && password !== user.password_hash) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Generate JWT Token (We keep user_id as sql_user_id for now to avoid breaking frontend tokens, or _id if needed)
        // Since frontend expects user_id to be an integer based on old system, we will use sql_user_id for backward compatibility
        const token = jwt.sign(
            { 
                user_id: user.sql_user_id, 
                mongo_id: user._id, // Add mongo ID for future use
                role: user.role, 
                firm_name: user.firm_name 
            },
            process.env.JWT_SECRET,
            { expiresIn: '30d' } 
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                user_id: user.sql_user_id,
                mongo_id: user._id,
                role: user.role,
                firm_name: user.firm_name,
                phone_number: user.phone,
                wallet_balance: user.wallet_balance || 0
            }
        });

    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
};

// @desc    Reset Password directly (Logged in user)
// @route   PUT /api/auth/reset-password
const resetPassword = async (req, res) => {
    try {
        const { user_id, new_password } = req.body;

        if (!user_id || !new_password) {
            return res.status(400).json({ message: 'Please provide user id and new password' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(new_password, salt);

        // Update password using Mongoose (using sql_user_id for backward compatibility from frontend)
        await Models.User.findOneAndUpdate(
            { sql_user_id: user_id }, 
            { password_hash: hashedPassword }
        );

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(500).json({ message: 'Server error during password reset' });
    }
};

module.exports = {
    loginUser,
    resetPassword
};
