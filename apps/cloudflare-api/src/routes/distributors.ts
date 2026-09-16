import { Hono } from 'hono';
import Models from '../db/models';
import bcrypt from 'bcryptjs';

const router = new Hono();

function getQueryId(id: string, sqlField: string) {
    return isNaN(Number(id)) ? { _id: id } : { [sqlField]: parseInt(id) };
}

router.get('/', async (c) => {
    try {
        const users = await Models.User.find({ role: { $in: ['DISTRIBUTOR', 'ND', 'OFFLINE_CLIENT'] } }).sort({ created_at: -1 }).lean();
        
        const formatted = users.map((u: any) => ({
            user_id: u.sql_user_id || u._id.toString(),
            firm_name: u.firm_name,
            gst_number: u.gst_number,
            address: u.address,
            phone_number: u.phone_number,
            created_at: u.created_at,
            owner_name: u.owner_name,
            fssai_number: u.fssai_number,
            wallet_balance: u.wallet_balance || 0,
            rate_type: u.rate_type,
            rate_version: u.rate_version,
            role: u.role,
            has_pan: u.pan_card ? 1 : 0,
            has_aadhar: u.aadhar_card ? 1 : 0,
            has_photo: u.photo ? 1 : 0
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
        const query = getQueryId(user_id, 'sql_user_id');
        const u: any = await Models.User.findOne({ ...query, role: { $in: ['DISTRIBUTOR', 'ND', 'OFFLINE_CLIENT'] } }).lean();
        
        if (!u) {
            return c.json({ message: 'Distributor not found' }, 404);
        }

        return c.json({
            user_id: u.sql_user_id || u._id.toString(),
            firm_name: u.firm_name,
            gst_number: u.gst_number,
            address: u.address,
            phone_number: u.phone_number,
            created_at: u.created_at,
            owner_name: u.owner_name,
            fssai_number: u.fssai_number,
            wallet_balance: u.wallet_balance || 0,
            rate_type: u.rate_type,
            rate_version: u.rate_version,
            role: u.role,
            has_pan: u.pan_card ? 1 : 0,
            has_aadhar: u.aadhar_card ? 1 : 0,
            has_photo: u.photo ? 1 : 0
        });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/:id/wallet', async (c) => {
    try {
        const user_id = c.req.param('id');
        const query = getQueryId(user_id, 'sql_user_id');
        const user = await Models.User.findOne(query);
        
        if (!user) {
            return c.json({ message: 'User not found' }, 404);
        }
        return c.json({ wallet_balance: user.wallet_balance || 0 });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/:id/file/:type', async (c) => {
    try {
        const user_id = c.req.param('id');
        const type = c.req.param('type');
        
        const query = getQueryId(user_id, 'sql_user_id');
        const user = await Models.User.findOne(query);
        
        if (!user) {
            return c.json({ message: 'User not found' }, 404);
        }

        let fileData = null;
        if (type === 'pan') fileData = user.pan_card;
        else if (type === 'aadhar') fileData = user.aadhar_card;
        else if (type === 'photo') fileData = user.photo;
        else return c.json({ message: 'Invalid file type' }, 400);

        if (!fileData) {
            return c.json({ message: 'File not found' }, 404);
        }
        
        c.header('Content-Type', 'image/jpeg');
        return c.body(fileData);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.post('/', async (c) => {
    try {
        const body = await c.req.parseBody();
        const { firm_name, gst_number, address, phone_number, password, owner_name, fssai_number, rate_type, rate_version } = body;

        const panFile = body['panFile'] as File | undefined;
        const aadharFile = body['aadharFile'] as File | undefined;
        const photoFile = body['photoFile'] as File | undefined;

        const pan_card_buffer = panFile ? Buffer.from(await panFile.arrayBuffer()) : null;
        const aadhar_card_buffer = aadharFile ? Buffer.from(await aadharFile.arrayBuffer()) : null;
        const photo_buffer = photoFile ? Buffer.from(await photoFile.arrayBuffer()) : null;

        const existing = await Models.User.findOne({ phone_number });
        if (existing) {
            return c.json({ message: 'Phone number already registered' }, 400);
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password as string, salt);

        await Models.User.create({
            role: 'DISTRIBUTOR',
            firm_name,
            gst_number,
            address,
            phone_number,
            password_hash: hashedPassword,
            owner_name,
            fssai_number,
            rate_type: rate_type || 'distributor',
            rate_version: rate_version || 'new',
            pan_card: pan_card_buffer,
            aadhar_card: aadhar_card_buffer,
            photo: photo_buffer,
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
        const { firm_name, gst_number, address, phone_number, owner_name, fssai_number, password, rate_type, rate_version, deletePan, deleteAadhar, deletePhoto } = body;

        const query = getQueryId(user_id, 'sql_user_id');
        const user = await Models.User.findOne({ ...query, role: { $in: ['DISTRIBUTOR', 'ND', 'OFFLINE_CLIENT'] } });

        if (!user) return c.json({ message: 'Distributor not found' }, 404);

        if (phone_number !== user.phone_number) {
            const existing = await Models.User.findOne({ phone_number });
            if (existing) {
                return c.json({ message: 'Phone number already registered' }, 400);
            }
        }

        user.firm_name = firm_name as string;
        user.gst_number = gst_number as string;
        user.address = address as string;
        user.phone_number = phone_number as string;
        user.owner_name = owner_name as string;
        user.fssai_number = fssai_number as string;
        user.rate_type = (rate_type as string) || user.rate_type;
        user.rate_version = (rate_version as string) || user.rate_version;

        if (password) {
            const salt = await bcrypt.genSalt(10);
            user.password_hash = await bcrypt.hash(password as string, salt);
        }

        const panFile = body['panFile'] as File | undefined;
        const aadharFile = body['aadharFile'] as File | undefined;
        const photoFile = body['photoFile'] as File | undefined;

        if (panFile) {
            user.pan_card = Buffer.from(await panFile.arrayBuffer());
        } else if (deletePan === 'true') {
            user.pan_card = null;
        }

        if (aadharFile) {
            user.aadhar_card = Buffer.from(await aadharFile.arrayBuffer());
        } else if (deleteAadhar === 'true') {
            user.aadhar_card = null;
        }

        if (photoFile) {
            user.photo = Buffer.from(await photoFile.arrayBuffer());
        } else if (deletePhoto === 'true') {
            user.photo = null;
        }

        await user.save();
        return c.json({ message: 'Distributor updated successfully' });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Failed to update distributor' }, 500);
    }
});

router.delete('/:id', async (c) => {
    try {
        const user_id = c.req.param('id');
        const query = getQueryId(user_id, 'sql_user_id');
        const user = await Models.User.findOne(query);
        
        if (!user || !['DISTRIBUTOR', 'ND', 'OFFLINE_CLIENT'].includes(user.role)) {
            return c.json({ message: 'Invalid operation' }, 400);
        }

        await Models.User.deleteOne({ _id: user._id });
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

        let successCount = 0;
        let skipCount = 0;

        for (const dist of distributors) {
            const firm_name = dist['Firm Name'] || dist.firm_name;
            const phone_number = dist['Mobile No'] || dist.phone_number;
            const password = dist['Password'] || dist.password || phone_number;
            const gst_number = dist['GST no'] || dist['GST No.'] || dist.gst_number;
            const address = dist['Address'] || dist.address;
            const owner_name = dist['Owner Name'] || dist.owner_name;
            const fssai_number = dist['FSSAI Number'] || dist.fssai_number;
            
            if (!firm_name || !phone_number || !password) {
                skipCount++;
                continue; 
            }

            try {
                const existing = await Models.User.findOne({ phone_number });
                if (existing) {
                    skipCount++;
                    continue; 
                }

                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(password, salt);

                await Models.User.create({
                    role: 'DISTRIBUTOR',
                    firm_name,
                    gst_number,
                    address,
                    phone_number,
                    password_hash: hashedPassword,
                    owner_name,
                    fssai_number,
                    wallet_balance: 0
                });
                
                successCount++;
            } catch (innerErr) {
                console.error("Row insert error:", innerErr);
                skipCount++;
            }
        }

        return c.json({ 
            message: 'Bulk upload completed', 
            successCount, 
            skipCount 
        }, 200);
    } catch (err) {
        console.error("Bulk Upload Error:", err);
        return c.json({ message: 'Failed to process bulk upload' }, 500);
    }
});

export default router;
