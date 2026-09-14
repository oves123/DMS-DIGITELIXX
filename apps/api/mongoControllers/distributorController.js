const Models = require('../mongoModels/index');
const bcrypt = require('bcryptjs');

function getQueryId(id, sqlField) {
    return isNaN(id) ? { _id: id } : { [sqlField]: parseInt(id) };
}

exports.getDistributors = async (req, res) => {
    try {
        const users = await Models.User.find({ role: { $in: ['DISTRIBUTOR', 'ND', 'OFFLINE_CLIENT'] } }).sort({ created_at: -1 }).lean();
        
        const formatted = users.map(u => ({
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

        res.json(formatted);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getDistributorById = async (req, res) => {
    try {
        const user_id = req.params.id;
        const query = getQueryId(user_id, 'sql_user_id');
        const u = await Models.User.findOne({ ...query, role: { $in: ['DISTRIBUTOR', 'ND', 'OFFLINE_CLIENT'] } }).lean();
        
        if (!u) {
            return res.status(404).json({ message: 'Distributor not found' });
        }

        res.json({
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
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getWalletBalance = async (req, res) => {
    try {
        const user_id = req.params.id;
        const query = getQueryId(user_id, 'sql_user_id');
        const user = await Models.User.findOne(query);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ wallet_balance: user.wallet_balance || 0 });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getFile = async (req, res) => {
    try {
        const user_id = req.params.id;
        const type = req.params.type;
        
        const query = getQueryId(user_id, 'sql_user_id');
        const user = await Models.User.findOne(query);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        let fileData = null;
        if (type === 'pan') fileData = user.pan_card;
        else if (type === 'aadhar') fileData = user.aadhar_card;
        else if (type === 'photo') fileData = user.photo;
        else return res.status(400).json({ message: 'Invalid file type' });

        if (!fileData) {
            return res.status(404).json({ message: 'File not found' });
        }
        
        res.set('Content-Type', 'image/jpeg');
        res.send(fileData);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.addDistributor = async (req, res) => {
    try {
        const { firm_name, gst_number, address, phone_number, password, owner_name, fssai_number, rate_type, rate_version } = req.body;

        const pan_card_buffer = req.files && req.files.panFile ? req.files.panFile[0].buffer : null;
        const aadhar_card_buffer = req.files && req.files.aadharFile ? req.files.aadharFile[0].buffer : null;
        const photo_buffer = req.files && req.files.photoFile ? req.files.photoFile[0].buffer : null;

        const existing = await Models.User.findOne({ phone_number });
        if (existing) {
            return res.status(400).json({ message: 'Phone number already registered' });
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
            rate_type: rate_type || 'distributor',
            rate_version: rate_version || 'new',
            pan_card: pan_card_buffer,
            aadhar_card: aadhar_card_buffer,
            photo: photo_buffer,
            wallet_balance: 0
        });

        res.status(201).json({ message: 'Distributor created successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to create distributor' });
    }
};

exports.bulkUploadDistributors = async (req, res) => {
    try {
        const distributors = req.body; 
        
        if (!Array.isArray(distributors) || distributors.length === 0) {
            return res.status(400).json({ message: 'Invalid data format. Expected a non-empty array.' });
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

        res.status(200).json({ 
            message: 'Bulk upload completed', 
            successCount, 
            skipCount 
        });
    } catch (err) {
        console.error("Bulk Upload Error:", err);
        res.status(500).json({ message: 'Failed to process bulk upload' });
    }
};

exports.updateDistributor = async (req, res) => {
    try {
        const user_id = req.params.id;
        const { firm_name, gst_number, address, phone_number, owner_name, fssai_number, password, rate_type, rate_version, deletePan, deleteAadhar, deletePhoto } = req.body;

        const query = getQueryId(user_id, 'sql_user_id');
        const user = await Models.User.findOne({ ...query, role: { $in: ['DISTRIBUTOR', 'ND', 'OFFLINE_CLIENT'] } });

        if (!user) return res.status(404).json({ message: 'Distributor not found' });

        if (phone_number !== user.phone_number) {
            const existing = await Models.User.findOne({ phone_number });
            if (existing) {
                return res.status(400).json({ message: 'Phone number already registered' });
            }
        }

        user.firm_name = firm_name;
        user.gst_number = gst_number;
        user.address = address;
        user.phone_number = phone_number;
        user.owner_name = owner_name;
        user.fssai_number = fssai_number;
        user.rate_type = rate_type || user.rate_type;
        user.rate_version = rate_version || user.rate_version;

        if (password) {
            const salt = await bcrypt.genSalt(10);
            user.password_hash = await bcrypt.hash(password, salt);
        }

        if (req.files && req.files.panFile) {
            user.pan_card = req.files.panFile[0].buffer;
        } else if (deletePan === 'true') {
            user.pan_card = null;
        }

        if (req.files && req.files.aadharFile) {
            user.aadhar_card = req.files.aadharFile[0].buffer;
        } else if (deleteAadhar === 'true') {
            user.aadhar_card = null;
        }

        if (req.files && req.files.photoFile) {
            user.photo = req.files.photoFile[0].buffer;
        } else if (deletePhoto === 'true') {
            user.photo = null;
        }

        await user.save();
        res.json({ message: 'Distributor updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to update distributor' });
    }
};

exports.deleteDistributor = async (req, res) => {
    try {
        const user_id = req.params.id;
        const query = getQueryId(user_id, 'sql_user_id');
        const user = await Models.User.findOne(query);
        
        if (!user || !['DISTRIBUTOR', 'ND', 'OFFLINE_CLIENT'].includes(user.role)) {
            return res.status(400).json({ message: 'Invalid operation' });
        }

        await Models.User.deleteOne({ _id: user._id });
        res.json({ message: 'Distributor deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to delete distributor' });
    }
};
