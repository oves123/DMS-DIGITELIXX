const Models = require('../mongoModels/index');
const mongoose = require('mongoose');

function getQueryId(id, sqlField) {
    return isNaN(id) ? { _id: id } : { [sqlField]: parseInt(id) };
}

exports.submitClaim = async (req, res) => {
    try {
        const { order_id, variant_id, quantity, pieces_qty, reason, distributor_id } = req.body;
        const image_binary = req.file ? req.file.buffer : null;

        const dQuery = getQueryId(distributor_id, 'sql_user_id');
        const user = await Models.User.findOne(dQuery);
        if (!user) return res.status(404).json({ message: 'Distributor not found' });

        const vQuery = getQueryId(variant_id, 'sql_variant_id');
        const variant = await Models.Variant.findOne(vQuery);
        if (!variant) return res.status(404).json({ message: 'Variant not found' });

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

        res.status(201).json({ message: 'Claim submitted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getClaimImage = async (req, res) => {
    try {
        const claimId = req.params.claim_id;
        const cQuery = getQueryId(claimId, 'sql_claim_id');
        const claim = await Models.Claim.findOne(cQuery);
        
        if (claim && claim.image_binary) {
            res.setHeader('Content-Type', 'image/jpeg');
            res.send(claim.image_binary);
        } else {
            res.status(404).send('Image not found');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
};

exports.getClaims = async (req, res) => {
    try {
        const claims = await Models.Claim.find().sort({ created_at: -1 })
            .populate('distributor_id')
            .populate({
                path: 'variant_id',
                populate: { path: 'product_id' }
            })
            .lean();

        const formatted = claims.map(c => {
            const variant = c.variant_id || {};
            const product = variant.product_id || {};
            const dist = c.distributor_id || {};
            
            const piecesPerBox = variant.pieces_per_box || 1;
            const distRate = variant.distributor_rate || 0;
            const claimAmount = (c.quantity * distRate) + (c.pieces_qty * (distRate / piecesPerBox));

            return {
                claim_id: c.sql_claim_id || c._id.toString(),
                distributor_id: dist.sql_user_id || dist._id?.toString(),
                distributor_name: dist.firm_name,
                order_id: c.order_id?.toString(), // Could be populated if needed
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

        res.json(formatted);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.updateClaimStatus = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { claim_id } = req.params;
        const { status, amount } = req.body;

        if (status !== 'APPROVED' && status !== 'REJECTED') {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const cQuery = getQueryId(claim_id, 'sql_claim_id');
        const claim = await Models.Claim.findOne(cQuery).session(session);

        if (!claim) {
            await session.abortTransaction();
            return res.status(404).json({ message: 'Claim not found' });
        }
        
        if (claim.status !== 'PENDING') {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Claim is already processed' });
        }

        const user = await Models.User.findById(claim.distributor_id).session(session);

        claim.status = status;
        await claim.save({ session });

        if (status === 'APPROVED') {
            if (!amount || isNaN(amount)) {
                await session.abortTransaction();
                return res.status(400).json({ message: 'Amount is required for approval' });
            }

            const currentDate = new Date();
            const currentMonth = currentDate.getMonth();
            const currentYear = currentDate.getFullYear();
            let startYear = (currentMonth >= 3) ? currentYear : currentYear - 1;
            let endYear = startYear + 1;
            const finYearString = `${startYear}-${endYear}`;

            const lastCN = await Models.CreditNote.findOne({ cn_number: new RegExp(`/${finYearString}$`) })
                .sort({ created_at: -1 })
                .session(session);

            let nextSeq = 1;
            if (lastCN && lastCN.cn_number) {
                const parts = lastCN.cn_number.split('/');
                nextSeq = parseInt(parts[0], 10) + 1;
            }
            if (finYearString === '2026-2027' && nextSeq === 1) nextSeq = 32;
            const creditNoteNumber = `${nextSeq}/${finYearString}`;

            await Models.CreditNote.create([{
                distributor_id: user._id,
                claim_id: claim._id, // Add this relation loosely
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
            }], { session });

            if (user) {
                user.wallet_balance = (user.wallet_balance || 0) + parseFloat(amount);
                await user.save({ session });
            }
        }

        await session.commitTransaction();
        res.json({ message: `Claim ${status.toLowerCase()} successfully` });
    } catch (err) {
        console.error(err);
        await session.abortTransaction();
        res.status(500).json({ message: 'Server Error' });
    } finally {
        session.endSession();
    }
};

exports.getDistributorClaims = async (req, res) => {
    try {
        const distributor_id = req.params.distributor_id;
        const dQuery = getQueryId(distributor_id, 'sql_user_id');
        const user = await Models.User.findOne(dQuery);

        if (!user) return res.status(404).json({ message: 'Distributor not found' });

        const claims = await Models.Claim.find({ distributor_id: user._id })
            .sort({ created_at: -1 })
            .populate({
                path: 'variant_id',
                populate: { path: 'product_id' }
            })
            .lean();

        const formatted = claims.map(c => {
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

        res.json(formatted);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
};
