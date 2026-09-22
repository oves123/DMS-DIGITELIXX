import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import bcrypt from 'bcryptjs';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { Env } from '../index';

const router = new Hono<{ Bindings: Env }>();

router.post('/login', async (c) => {
    try {
        const body = await c.req.json();
        const { phone_number, password } = body;

        if (!phone_number || !password) {
            return c.json({ message: 'Please provide phone number and password' }, 400);
        }

        const db = drizzle(c.env.DB, { schema });
        const user = await db.query.users.findFirst({
            where: eq(schema.users.phone, phone_number)
        });

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
                mongo_id: user.id,
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
                mongo_id: user.id,
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

        const db = drizzle(c.env.DB, { schema });
        await db.update(schema.users)
            .set({ password_hash: hashedPassword })
            .where(eq(schema.users.sql_user_id, parseInt(user_id)));

        return c.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Reset Password Error:', error);
        return c.json({ message: 'Server error during password reset' }, 500);
    }
});

export default router;
