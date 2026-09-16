import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import bcrypt from 'bcryptjs';
import Models from '../db/models';

const router = new Hono<{ Bindings: { JWT_SECRET: string } }>();

router.post('/login', async (c) => {
    try {
        const body = await c.req.json();
        const { phone_number, password } = body;

        if (!phone_number || !password) {
            return c.json({ message: 'Please provide phone number and password' }, 400);
        }

        const user = await Models.User.findOne({ phone: phone_number }) as any;

        if (!user) {
            return c.json({ message: 'Invalid credentials' }, 401);
        }

        const isMatch = await bcrypt.compare(password, user.password_hash).catch(() => false);
        if (!isMatch && password !== user.password_hash) {
            return c.json({ message: 'Invalid credentials' }, 401);
        }

        const token = await sign(
            { 
                user_id: user.sql_user_id, 
                mongo_id: user._id,
                role: user.role, 
                firm_name: user.firm_name,
                exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 days
            },
            c.env.JWT_SECRET || 'fallback_secret'
        );

        return c.json({
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
        return c.json({ message: 'Server error during login' }, 500);
    }
});

router.put('/reset-password', async (c) => {
    try {
        const body = await c.req.json();
        const { user_id, new_password } = body;

        if (!user_id || !new_password) {
            return c.json({ message: 'Please provide user id and new password' }, 400);
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(new_password, salt);

        await Models.User.findOneAndUpdate(
            { sql_user_id: user_id }, 
            { password_hash: hashedPassword }
        );

        return c.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Reset Password Error:', error);
        return c.json({ message: 'Server error during password reset' }, 500);
    }
});

export default router;
