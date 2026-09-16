import { Hono } from 'hono';
import Models from '../db/models';

const router = new Hono();

function getQueryId(id: string, sqlField: string) {
    return isNaN(Number(id)) ? { _id: id } : { [sqlField]: parseInt(id) };
}

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

        const dQuery = getQueryId(distributor_id, 'sql_user_id');
        const user = await Models.User.findOne(dQuery);
        if (!user) return c.json({ message: 'Distributor not found' }, 404);

        const vQuery = getQueryId(variant_id, 'sql_variant_id');
        const variant = await Models.Variant.findOne(vQuery);
        if (!variant) return c.json({ message: 'Variant not found' }, 404);

        let oId = null;
        if (order_id) {
            const oQuery = getQueryId(order_id, 'sql_order_id');
            const order = await Models.Order.findOne(oQuery);
            if (order) oId = order._id;
        }

        await Models.Claim.create({
            distributor_id: user._id,
            order_id: oId,
            variant_id: variant._id,
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
        const distributor_id = c.req.param('distributor_id');
        const dQuery = getQueryId(distributor_id, 'sql_user_id');
        const user = await Models.User.findOne(dQuery) as any;

        if (!user) return c.json({ message: 'Distributor not found' }, 404);

        const claims = await Models.Claim.find({ distributor_id: user._id })
            .sort({ created_at: -1 })
            .populate({
                path: 'variant_id',
                populate: { path: 'product_id' }
            })
            .lean();

        const formatted = claims.map((c: any) => {
            const variant = c.variant_id || {};
            const product = variant.product_id || {};
            
            const piecesPerBox = variant.pieces_per_box || 1;
            const distRate = variant.distributor_rate || 0;
            const claimAmount = (c.quantity * distRate) + (c.pieces_qty * (distRate / piecesPerBox));

            return {
                claim_id: c.sql_claim_id || c._id.toString(),
                distributor_id: user.sql_user_id || user._id.toString(),
                order_id: c.order_id?.toString(),
                variant_id: variant.sql_variant_id || variant._id?.toString(),
                product_name: product.name,
                pack_size: variant.pack_size,
                pieces_per_box: variant.pieces_per_box,
                quantity: c.quantity,
                pieces_qty: c.pieces_qty,
                reason: c.reason,
                status: c.status,
                created_at: c.created_at,
                has_image: c.image_binary ? 1 : 0,
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
        const claims = await Models.Claim.find().sort({ created_at: -1 })
            .populate('distributor_id')
            .populate({
                path: 'variant_id',
                populate: { path: 'product_id' }
            })
            .lean();

        const formatted = claims.map((claim: any) => {
            const variant = claim.variant_id || {};
            const product = variant.product_id || {};
            const dist = claim.distributor_id || {};
            
            const piecesPerBox = variant.pieces_per_box || 1;
            const distRate = variant.distributor_rate || 0;
            const claimAmount = (claim.quantity * distRate) + (claim.pieces_qty * (distRate / piecesPerBox));

            return {
                claim_id: claim.sql_claim_id || claim._id.toString(),
                distributor_id: dist.sql_user_id || dist._id?.toString(),
                distributor_name: dist.firm_name,
                order_id: claim.order_id?.toString(),
                variant_id: variant.sql_variant_id || variant._id?.toString(),
                product_name: product.name,
                pack_size: variant.pack_size,
                pieces_per_box: variant.pieces_per_box,
                quantity: claim.quantity,
                pieces_qty: claim.pieces_qty,
                reason: claim.reason,
                status: claim.status,
                created_at: claim.created_at,
                has_image: claim.image_binary ? 1 : 0,
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
        const cQuery = getQueryId(claimId, 'sql_claim_id');
        const claim = await Models.Claim.findOne(cQuery);
        
        if (claim && claim.image_binary) {
            c.header('Content-Type', 'image/jpeg');
            return c.body(claim.image_binary);
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
        const { claim_id } = c.req.param();
        const { status, amount } = await c.req.json();

        if (status !== 'APPROVED' && status !== 'REJECTED') {
            return c.json({ message: 'Invalid status' }, 400);
        }

        const cQuery = getQueryId(claim_id, 'sql_claim_id');
        const claim = await Models.Claim.findOne(cQuery) as any;

        if (!claim) {
            return c.json({ message: 'Claim not found' }, 404);
        }
        
        if (claim.status !== 'PENDING') {
            return c.json({ message: 'Claim is already processed' }, 400);
        }

        const user = await Models.User.findById(claim.distributor_id) as any;

        claim.status = status;
        await claim.save();

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

            const lastCN = await Models.CreditNote.findOne({ cn_number: new RegExp(`/${finYearString}$`) })
                .sort({ created_at: -1 });

            let nextSeq = 1;
            if (lastCN && lastCN.cn_number) {
                const parts = lastCN.cn_number.split('/');
                nextSeq = parseInt(parts[0], 10) + 1;
            }
            if (finYearString === '2026-2027' && nextSeq === 1) nextSeq = 32;
            const creditNoteNumber = `${nextSeq}/${finYearString}`;

            await Models.CreditNote.create({
                distributor_id: user._id,
                claim_id: claim._id,
                cn_number: creditNoteNumber,
                total_amount: parseFloat(amount),
                reason: 'Claim Refund',
                items: [{
                    variant_id: claim.variant_id,
                    quantity: claim.quantity,
                    pieces_qty: claim.pieces_qty,
                    reason: claim.reason,
                    price_at_order: parseFloat(amount),
                    item_total: parseFloat(amount)
                }]
            });

            if (user) {
                user.wallet_balance = (user.wallet_balance || 0) + parseFloat(amount);
                await user.save();
            }
        }

        return c.json({ message: `Claim ${status.toLowerCase()} successfully` });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

export default router;
