import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, or, inArray, ne } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as schema from '../db/schema';
import type { Env } from '../index';

const router = new Hono<{ Bindings: Env }>();

router.get('/', async (c) => {
    try {
        const db = drizzle(c.env.DB, { schema });
        const users = await db.query.users.findMany({
            where: inArray(schema.users.role, ['DISTRIBUTOR', 'ND', 'OFFLINE_CLIENT'])
        });
        
        const formatted = users.map((u: any) => ({
            user_id: u.sql_user_id || u.id,
            firm_name: u.firm_name,
            gst_number: u.gst_number,
            address: u.address,
            phone_number: u.phone,
            created_at: u.created_at,
            owner_name: u.owner_name,
            wallet_balance: u.wallet_balance || 0,
            role: u.role
        }));

        return c.json(formatted);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/:id', async (c) => {
    try {
        const user_id = c.req.param('id');
        const db = drizzle(c.env.DB, { schema });
        const u = await db.query.users.findFirst({
            where: or(eq(schema.users.id, user_id), eq(schema.users.sql_user_id, parseInt(user_id)))
        });
        
        if (!u || !['DISTRIBUTOR', 'ND', 'OFFLINE_CLIENT'].includes(u.role)) {
            return c.json({ message: 'Distributor not found' }, 404);
        }

        return c.json({
            user_id: u.sql_user_id || u.id,
            firm_name: u.firm_name,
            gst_number: u.gst_number,
            address: u.address,
            phone_number: u.phone,
            created_at: u.created_at,
            owner_name: u.owner_name,
            wallet_balance: u.wallet_balance || 0,
            role: u.role
        });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/:id/wallet', async (c) => {
    try {
        const user_id = c.req.param('id');
        const db = drizzle(c.env.DB, { schema });
        const user = await db.query.users.findFirst({
            where: or(eq(schema.users.id, user_id), eq(schema.users.sql_user_id, parseInt(user_id)))
        });
        
        if (!user) {
            return c.json({ message: 'User not found' }, 404);
        }
        return c.json({ wallet_balance: user.wallet_balance || 0 });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

// GET /:id/file/:type omitted because we aren't migrating binary blobs to D1 (SQLite has limits for big files, R2 should be used).
// The user prompt indicated "Keep Cloudflare R2 for file storage; don't store large files in D1".
// We will just return 404 for now until we build the R2 upload logic.

router.post('/', async (c) => {
    try {
        const body = await c.req.parseBody();
        const { firm_name, gst_number, address, phone_number, password, owner_name } = body;
        const db = drizzle(c.env.DB, { schema });

        const existing = await db.query.users.findFirst({ where: eq(schema.users.phone, phone_number as string) });
        if (existing) {
            return c.json({ message: 'Phone number already registered' }, 400);
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password as string, salt);

        await db.insert(schema.users).values({
            id: crypto.randomUUID(),
            role: 'DISTRIBUTOR',
            firm_name: firm_name as string,
            gst_number: gst_number as string,
            address: address as string,
            phone: phone_number as string,
            password_hash: hashedPassword,
            owner_name: owner_name as string,
            wallet_balance: 0
        });

        return c.json({ message: 'Distributor created successfully' }, 201);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Failed to create distributor' }, 500);
    }
});

router.put('/:id', async (c) => {
    try {
        const user_id = c.req.param('id');
        const body = await c.req.parseBody();
        const { firm_name, gst_number, address, phone_number, owner_name, password } = body;
        const db = drizzle(c.env.DB, { schema });

        const user = await db.query.users.findFirst({
            where: or(eq(schema.users.id, user_id), eq(schema.users.sql_user_id, parseInt(user_id)))
        });

        if (!user || !['DISTRIBUTOR', 'ND', 'OFFLINE_CLIENT'].includes(user.role)) {
            return c.json({ message: 'Distributor not found' }, 404);
        }

        if (phone_number !== user.phone) {
            const existing = await db.query.users.findFirst({ where: eq(schema.users.phone, phone_number as string) });
            if (existing) {
                return c.json({ message: 'Phone number already registered' }, 400);
            }
        }

        const updateData: any = {
            firm_name: firm_name as string,
            gst_number: gst_number as string,
            address: address as string,
            phone: phone_number as string,
            owner_name: owner_name as string
        };

        if (password) {
            const salt = await bcrypt.genSalt(10);
            updateData.password_hash = await bcrypt.hash(password as string, salt);
        }

        await db.update(schema.users).set(updateData).where(eq(schema.users.id, user.id));

        return c.json({ message: 'Distributor updated successfully' });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Failed to update distributor' }, 500);
    }
});

router.delete('/:id', async (c) => {
    try {
        const user_id = c.req.param('id');
        const db = drizzle(c.env.DB, { schema });
        
        const user = await db.query.users.findFirst({
            where: or(eq(schema.users.id, user_id), eq(schema.users.sql_user_id, parseInt(user_id)))
        });
        
        if (!user || !['DISTRIBUTOR', 'ND', 'OFFLINE_CLIENT'].includes(user.role)) {
            return c.json({ message: 'Invalid operation' }, 400);
        }

        await db.delete(schema.users).where(eq(schema.users.id, user.id));
        return c.json({ message: 'Distributor deleted successfully' });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Failed to delete distributor' }, 500);
    }
});

router.post('/bulk', async (c) => {
    try {
        const distributors = await c.req.json();
        
        if (!Array.isArray(distributors) || distributors.length === 0) {
            return c.json({ message: 'Invalid data format. Expected a non-empty array.' }, 400);
        }

        const db = drizzle(c.env.DB, { schema });
        let successCount = 0;
        let skipCount = 0;

        for (const dist of distributors) {
            const firm_name = dist['Firm Name'] || dist.firm_name;
            const phone_number = dist['Mobile No'] || dist.phone_number;
            const password = dist['Password'] || dist.password || phone_number;
            const gst_number = dist['GST no'] || dist['GST No.'] || dist.gst_number;
            const address = dist['Address'] || dist.address;
            const owner_name = dist['Owner Name'] || dist.owner_name;
            
            if (!firm_name || !phone_number || !password) {
                skipCount++;
                continue; 
            }

            try {
                const existing = await db.query.users.findFirst({ where: eq(schema.users.phone, phone_number) });
                if (existing) {
                    skipCount++;
                    continue; 
                }

                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(password, salt);

                await db.insert(schema.users).values({
                    id: crypto.randomUUID(),
                    role: 'DISTRIBUTOR',
                    firm_name,
                    gst_number,
                    address,
                    phone: phone_number,
                    password_hash: hashedPassword,
                    owner_name,
                    wallet_balance: 0
                });
                
                successCount++;
            } catch (innerErr) {
                console.error("Row insert error:", innerErr);
                skipCount++;
            }
        }

        return c.json({ message: 'Bulk upload completed', successCount, skipCount }, 200);
    } catch (err) {
        console.error("Bulk Upload Error:", err);
        return c.json({ message: 'Failed to process bulk upload' }, 500);
    }
});

export default router;
