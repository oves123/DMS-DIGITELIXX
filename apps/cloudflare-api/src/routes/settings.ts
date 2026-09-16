import { Hono } from 'hono';
import Models from '../db/models';

const router = new Hono();

router.get('/company', async (c) => {
    try {
        let settings = await Models.CompanySettings.findOne();
        if (!settings) {
            settings = await Models.CompanySettings.create({});
        }
        return c.json({
            address: settings.address,
            mobile_number: settings.mobile_number,
            state: settings.state,
            gst_number: settings.gst_number,
            fssai_number: settings.fssai_number,
            claim_window_days: settings.claim_window_days,
            cgst_rate: settings.cgst_rate,
            sgst_rate: settings.sgst_rate
        });
    } catch (error: any) {
        console.error('Error fetching settings:', error);
        return c.json({ error: error.message }, 500);
    }
});

router.put('/company', async (c) => {
    try {
        const body = await c.req.parseBody();
        const { address, mobile_number, state, gst_number, fssai_number, claim_window_days, cgst_rate, sgst_rate } = body;
        
        let settings = await Models.CompanySettings.findOne();
        if (!settings) {
            settings = new Models.CompanySettings();
        }

        settings.address = address as string;
        settings.mobile_number = mobile_number as string;
        settings.state = state as string;
        settings.gst_number = gst_number as string;
        settings.fssai_number = fssai_number as string;
        settings.claim_window_days = parseInt(claim_window_days as string) || 7;
        settings.cgst_rate = parseFloat(cgst_rate as string) || 2.50;
        settings.sgst_rate = parseFloat(sgst_rate as string) || 2.50;

        const file = body['file'] as File | undefined;
        if (file) {
            settings.qr_code_image = Buffer.from(await file.arrayBuffer());
            settings.qr_code_mimetype = file.type || 'image/jpeg';
        }

        await settings.save();
        return c.json({ message: 'Settings updated successfully' });
    } catch (error: any) {
        console.error('Error updating settings:', error);
        return c.json({ error: error.message }, 500);
    }
});

router.get('/company/qr', async (c) => {
    try {
        const settings = await Models.CompanySettings.findOne();
        if (settings && settings.qr_code_image) {
            c.header('Content-Type', settings.qr_code_mimetype || 'image/jpeg');
            return c.body(settings.qr_code_image);
        } else {
            return c.text('No QR Code found', 404);
        }
    } catch (error: any) {
        console.error('Error fetching QR code:', error);
        return c.json({ error: error.message }, 500);
    }
});

export default router;
