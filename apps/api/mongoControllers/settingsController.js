const Models = require('../mongoModels/index');

const getCompanySettings = async (req, res) => {
    try {
        let settings = await Models.CompanySettings.findOne();
        if (!settings) {
            settings = new Models.CompanySettings();
            await settings.save();
        }
        res.json({
            address: settings.address,
            mobile_number: settings.mobile_number,
            state: settings.state,
            gst_number: settings.gst_number,
            fssai_number: settings.fssai_number,
            claim_window_days: settings.claim_window_days,
            cgst_rate: settings.cgst_rate,
            sgst_rate: settings.sgst_rate
        });
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: error.message });
    }
};

const updateCompanySettings = async (req, res) => {
    try {
        const { address, mobile_number, state, gst_number, fssai_number, claim_window_days, cgst_rate, sgst_rate } = req.body;
        const file = req.file;

        let settings = await Models.CompanySettings.findOne();
        if (!settings) {
            settings = new Models.CompanySettings();
        }

        settings.address = address;
        settings.mobile_number = mobile_number;
        settings.state = state;
        settings.gst_number = gst_number;
        settings.fssai_number = fssai_number;
        settings.claim_window_days = parseInt(claim_window_days) || 7;
        settings.cgst_rate = parseFloat(cgst_rate) || 2.50;
        settings.sgst_rate = parseFloat(sgst_rate) || 2.50;

        if (file) {
            settings.qr_code_image = file.buffer;
            settings.qr_code_mimetype = file.mimetype;
        }

        await settings.save();
        res.json({ message: 'Settings updated successfully' });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: error.message });
    }
};

const getQRCode = async (req, res) => {
    try {
        const settings = await Models.CompanySettings.findOne();
        if (settings && settings.qr_code_image) {
            res.set('Content-Type', settings.qr_code_mimetype || 'image/jpeg');
            res.send(settings.qr_code_image);
        } else {
            res.status(404).send('No QR Code found');
        }
    } catch (error) {
        console.error('Error fetching QR code:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getCompanySettings,
    updateCompanySettings,
    getQRCode
};
