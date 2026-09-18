import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import bcrypt from 'bcryptjs';
import Models from '../db/models';
import { hashPassword } from '../utils/hash';
const router = new Hono<{ Bindings: { JWT_SECRET: string } }>();

router.post('/login', async (c) => {
    try {
        const body = await c.req.json();
        const { phone_number, password } = body;

        if (!phone_number || !password) {
            return c.json({ message: 'Please provide phone number and password' }, 400);
        }

        const user = await Models.User.findOne({ phone: phone_number }).lean() as any;

        if (!user) {
            return c.json({ message: 'Invalid credentials' }, 401);
        }

        // Check if the hash matches using SHA-256 (new method) or if it's plaintext
        let isMatch = false;
        const hashedInput = await hashPassword(password);
        
        // We accept both the SHA-256 hash or plaintext password for smooth transition
        if (hashedInput === user.password_hash || password === user.password_hash) {
            isMatch = true;
        } else {
            // Also accept bcrypt if we haven't hit the CPU limit yet (fallback)
            if (user.password_hash && user.password_hash.startsWith('$2')) {
                try {
                    isMatch = bcrypt.compareSync(password, user.password_hash);
                } catch (e) {
                    console.error('Bcrypt Error:', e);
                }
            }
        }
        
        if (!isMatch) {
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

    } catch (error: any) {
        console.error('Login Error:', error);
        return c.json({ message: 'Server error during login', error: error?.message, stack: error?.stack }, 500);
    }
});

router.put('/reset-password', async (c) => {
    try {
        const body = await c.req.json();
        const { user_id, new_password } = body;

        if (!user_id || !new_password) {
            return c.json({ message: 'Please provide user id and new password' }, 400);
        }

        const hashedPassword = await hashPassword(new_password);

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
