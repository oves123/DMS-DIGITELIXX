import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import type { Env } from '../index';

const router = new Hono<{ Bindings: Env }>();

router.get('/company', async (c) => {
    try {
        const db = drizzle(c.env.DB, { schema });
        let settings = await db.query.companySettings.findFirst();
        
        if (!settings) {
            const newSettings = await db.insert(schema.companySettings).values({ id: crypto.randomUUID() }).returning();
            settings = newSettings[0];
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
        
        const db = drizzle(c.env.DB, { schema });
        let settings = await db.query.companySettings.findFirst();
        
        const updateData: any = {
            address: address as string,
            mobile_number: mobile_number as string,
            state: state as string,
            gst_number: gst_number as string,
            fssai_number: fssai_number as string,
            claim_window_days: parseInt(claim_window_days as string) || 7,
            cgst_rate: parseFloat(cgst_rate as string) || 2.50,
            sgst_rate: parseFloat(sgst_rate as string) || 2.50
        };

        const file = body['qr_code_image'] as File | undefined;
        if (file) {
            updateData.qr_code_image = Buffer.from(await file.arrayBuffer());
            updateData.qr_code_mimetype = file.type || 'image/jpeg';
        }

        if (!settings) {
            await db.insert(schema.companySettings).values({ id: crypto.randomUUID(), ...updateData });
        } else {
            await db.update(schema.companySettings).set(updateData);
        }

        return c.json({ message: 'Settings updated successfully' });
    } catch (error: any) {
        console.error('Error updating settings:', error);
        return c.json({ error: error.message }, 500);
    }
});

router.get('/company/qr', async (c) => {
    try {
        const db = drizzle(c.env.DB, { schema });
        const settings = await db.query.companySettings.findFirst();
        
        if (settings && settings.qr_code_image) {
            c.header('Content-Type', settings.qr_code_mimetype || 'image/jpeg');
            return c.body(settings.qr_code_image as any);
        } else {
            return c.text('No QR Code found', 404);
        }
    } catch (error: any) {
        console.error('Error fetching QR code:', error);
        return c.json({ error: error.message }, 500);
    }
});

export default router;
