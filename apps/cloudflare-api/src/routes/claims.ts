import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, or, desc, inArray, like } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { Env } from '../index';

const router = new Hono<{ Bindings: Env }>();

router.post('/submit', async (c) => {
    try {
        const body = await c.req.parseBody();
        const distributor_id = body.distributor_id as string;
        const order_id = body.order_id as string;
        const variant_id = body.variant_id as string;
        const quantity = body.quantity as string;
        const pieces_qty = body.pieces_qty as string;
        const reason = body.reason as string;
        const image = body.image as File | undefined;

        let image_binary: Buffer | null = null;
        if (image) {
            const buffer = await image.arrayBuffer();
            image_binary = Buffer.from(buffer);
        }

        const db = drizzle(c.env.DB, { schema });
        const user = await db.query.users.findFirst({
            where: or(eq(schema.users.id, distributor_id), eq(schema.users.sql_user_id, parseInt(distributor_id)))
        });
        if (!user) return c.json({ message: 'Distributor not found' }, 404);

        const variant = await db.query.variants.findFirst({
            where: or(eq(schema.variants.id, variant_id), eq(schema.variants.sql_variant_id, parseInt(variant_id)))
        });
        if (!variant) return c.json({ message: 'Variant not found' }, 404);

        let oId = null;
        if (order_id) {
            const order = await db.query.orders.findFirst({
                where: or(eq(schema.orders.id, order_id), eq(schema.orders.sql_order_id, parseInt(order_id)))
            });
            if (order) oId = order.id;
        }

        await db.insert(schema.claims).values({
            id: crypto.randomUUID(),
            distributor_id: user.id,
            order_id: oId,
            variant_id: variant.id,
            quantity: parseInt(quantity) || 0,
            pieces_qty: parseInt(pieces_qty) || 0,
            reason,
            image_binary,
            status: 'PENDING'
        });

        return c.json({ message: 'Claim submitted successfully' }, 201);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/distributor/:distributor_id', async (c) => {
    try {
        const distId = c.req.param('distributor_id');
        const db = drizzle(c.env.DB, { schema });

        const user = await db.query.users.findFirst({
            where: or(eq(schema.users.id, distId), eq(schema.users.sql_user_id, parseInt(distId)))
        });
        if (!user) return c.json({ message: 'Distributor not found' }, 404);

        const claims = await db.select().from(schema.claims).where(eq(schema.claims.distributor_id, user.id)).orderBy(desc(schema.claims.created_at));
        
        const variantIds = claims.map(cl => cl.variant_id);
        let variants: any[] = [];
        let products: any[] = [];
        if (variantIds.length > 0) {
            variants = await db.select().from(schema.variants).where(inArray(schema.variants.id, variantIds));
            const prodIds = variants.map(v => v.product_id);
            if (prodIds.length > 0) products = await db.select().from(schema.products).where(inArray(schema.products.id, prodIds));
        }

        const formatted = claims.map((cl: any) => {
            const variant = variants.find(v => v.id === cl.variant_id) || {};
            const product = products.find(p => p.id === variant.product_id) || {};
            
            const piecesPerBox = parseInt(variant.pack_size) || 1;
            const distRate = variant.distributor_rate || 0;
            const claimAmount = (cl.quantity * distRate) + (cl.pieces_qty * (distRate / piecesPerBox));

            return {
                claim_id: cl.sql_claim_id || cl.id,
                distributor_id: user.sql_user_id || user.id,
                order_id: cl.order_id,
                variant_id: variant.sql_variant_id || variant.id,
                product_name: product.name,
                pack_size: variant.pack_size,
                pieces_per_box: piecesPerBox,
                quantity: cl.quantity,
                pieces_qty: cl.pieces_qty,
                reason: cl.reason,
                status: cl.status,
                created_at: cl.created_at,
                has_image: cl.image_binary ? 1 : 0,
                claim_amount: claimAmount
            };
        });

        return c.json(formatted);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/', async (c) => {
    try {
        const db = drizzle(c.env.DB, { schema });
        const claims = await db.select().from(schema.claims).orderBy(desc(schema.claims.created_at));
        
        const variantIds = claims.map(cl => cl.variant_id);
        const userIds = claims.map(cl => cl.distributor_id);
        
        let variants: any[] = [];
        let products: any[] = [];
        let users: any[] = [];

        if (variantIds.length > 0) {
            variants = await db.select().from(schema.variants).where(inArray(schema.variants.id, variantIds));
            const prodIds = variants.map(v => v.product_id);
            if (prodIds.length > 0) products = await db.select().from(schema.products).where(inArray(schema.products.id, prodIds));
        }

        if (userIds.length > 0) {
            users = await db.select().from(schema.users).where(inArray(schema.users.id, userIds));
        }

        const formatted = claims.map((cl: any) => {
            const variant = variants.find(v => v.id === cl.variant_id) || {};
            const product = products.find(p => p.id === variant.product_id) || {};
            const dist = users.find(u => u.id === cl.distributor_id) || {};
            
            const piecesPerBox = parseInt(variant.pack_size) || 1;
            const distRate = variant.distributor_rate || 0;
            const claimAmount = (cl.quantity * distRate) + (cl.pieces_qty * (distRate / piecesPerBox));

            return {
                claim_id: cl.sql_claim_id || cl.id,
                distributor_id: dist.sql_user_id || dist.id,
                distributor_name: dist.firm_name,
                order_id: cl.order_id,
                variant_id: variant.sql_variant_id || variant.id,
                product_name: product.name,
                pack_size: variant.pack_size,
                pieces_per_box: piecesPerBox,
                quantity: cl.quantity,
                pieces_qty: cl.pieces_qty,
                reason: cl.reason,
                status: cl.status,
                created_at: cl.created_at,
                has_image: cl.image_binary ? 1 : 0,
                claim_amount: claimAmount
            };
        });

        return c.json(formatted);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/:claim_id/image', async (c) => {
    try {
        const claimId = c.req.param('claim_id');
        const db = drizzle(c.env.DB, { schema });
        
        const claim = await db.query.claims.findFirst({
            where: or(eq(schema.claims.id, claimId), eq(schema.claims.sql_claim_id, parseInt(claimId)))
        });
        
        if (claim && claim.image_binary) {
            c.header('Content-Type', 'image/jpeg');
            return c.body(claim.image_binary as any);
        } else {
            return c.text('Image not found', 404);
        }
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server error' }, 500);
    }
});

router.put('/:claim_id/status', async (c) => {
    try {
        const claimId = c.req.param('claim_id');
        const { status, amount } = await c.req.json();

        if (status !== 'APPROVED' && status !== 'REJECTED') {
            return c.json({ message: 'Invalid status' }, 400);
        }

        const db = drizzle(c.env.DB, { schema });
        const claim = await db.query.claims.findFirst({
            where: or(eq(schema.claims.id, claimId), eq(schema.claims.sql_claim_id, parseInt(claimId)))
        });

        if (!claim) return c.json({ message: 'Claim not found' }, 404);
        if (claim.status !== 'PENDING') return c.json({ message: 'Claim is already processed' }, 400);

        const user = await db.query.users.findFirst({ where: eq(schema.users.id, claim.distributor_id) });

        await db.update(schema.claims).set({ status }).where(eq(schema.claims.id, claim.id));

        if (status === 'APPROVED') {
            if (!amount || isNaN(amount)) {
                return c.json({ message: 'Amount is required for approval' }, 400);
            }

            const currentDate = new Date();
            const currentMonth = currentDate.getMonth();
            const currentYear = currentDate.getFullYear();
            let startYear = (currentMonth >= 3) ? currentYear : currentYear - 1;
            let endYear = startYear + 1;
            const finYearString = `${startYear}-${endYear}`;

            const lastCNs = await db.select().from(schema.creditNotes).where(like(schema.creditNotes.cn_number, `%/${finYearString}`));
            let nextSeq = 1;
            if (lastCNs.length > 0) {
                lastCNs.sort((a, b) => b.created_at!.getTime() - a.created_at!.getTime());
                const parts = lastCNs[0].cn_number!.split('/');
                nextSeq = parseInt(parts[0], 10) + 1;
            }
            
            const creditNoteNumber = `${nextSeq}/${finYearString}`;
            const cnId = crypto.randomUUID();

            await db.insert(schema.creditNotes).values({
                id: cnId,
                distributor_id: user!.id,
                cn_number: creditNoteNumber,
                total_amount: parseFloat(amount),
                reason: 'Claim Refund'
            });

            await db.insert(schema.creditNoteItems).values({
                id: crypto.randomUUID(),
                credit_note_id: cnId,
                variant_id: claim.variant_id,
                quantity: claim.quantity || 0,
                pieces_qty: claim.pieces_qty || 0,
                reason: claim.reason,
                price_at_order: parseFloat(amount),
                item_total: parseFloat(amount)
            });

            if (user) {
                await db.update(schema.users).set({ wallet_balance: (user.wallet_balance || 0) + parseFloat(amount) }).where(eq(schema.users.id, user.id));
            }
        }

        return c.json({ message: `Claim ${status.toLowerCase()} successfully` });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

export default router;
