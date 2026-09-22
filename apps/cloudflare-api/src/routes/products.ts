import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, or, and, ne } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { Env } from '../index';

const router = new Hono<{ Bindings: Env }>();

function parsePiecesFromPackSize(packSize: string) {
    if (!packSize) return 1;
    const match = packSize.match(/(?:(?:\(|\s|^))(\d+)\s*(?:PCS|pcs|pieces)(?:\)|\s|$)/i);
    if (match && match[1]) return parseInt(match[1]);
    const genericMatch = packSize.match(/(\d+)\s*PCS/i);
    if (genericMatch && genericMatch[1]) return parseInt(genericMatch[1]);
    return 1;
}

router.get('/categories', async (c) => {
    try {
        const db = drizzle(c.env.DB, { schema });
        const categories = await db.select().from(schema.categories);
        const formatted = categories.map((cat) => ({
            ...cat,
            category_id: cat.sql_category_id || cat.id
        }));
        return c.json(formatted);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.post('/categories', async (c) => {
    try {
        const { name } = await c.req.json();
        const db = drizzle(c.env.DB, { schema });
        
        const exists = await db.query.categories.findFirst({ where: eq(schema.categories.name, name) });
        if (exists) {
            return c.json({ message: 'Category already exists' }, 400);
        }

        const [newCat] = await db.insert(schema.categories).values({
            id: crypto.randomUUID(),
            name
        }).returning();
        
        return c.json({
            ...newCat,
            category_id: newCat.id
        }, 201);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/', async (c) => {
    try {
        const db = drizzle(c.env.DB, { schema });
        
        const products = await db.select().from(schema.products);
        const categories = await db.select().from(schema.categories);
        const variants = await db.select().from(schema.variants);
        const inventory = await db.select().from(schema.inventory);

        let userRateType = 'distributor';
        let userRateVersion = 'new';
        
        const reqUser = c.get('jwtPayload' as any) as any;
        if (reqUser && reqUser.user_id) {
            const user = await db.query.users.findFirst({
                where: or(eq(schema.users.sql_user_id, parseInt(reqUser.user_id)), eq(schema.users.id, reqUser.user_id))
            });
            if (user) {
                userRateType = (user as any).rate_type || 'distributor';
                userRateVersion = (user as any).rate_version || 'new';
            }
        }
        
        const isRetailer = userRateType === 'retailer';
        const isOld = userRateVersion === 'old';

        const inventoryMap: any = {};
        inventory.forEach((inv) => {
            inventoryMap[inv.variant_id] = inv.stock_quantity;
        });
        
        const categoryMap: any = {};
        categories.forEach((cat) => {
            categoryMap[cat.id] = cat;
        });

        const variantsByProduct: any = {};
        variants.forEach((v: any) => {
            const prodIdStr = v.product_id;
            if (!variantsByProduct[prodIdStr]) variantsByProduct[prodIdStr] = [];
            
            let finalRate = isRetailer ? v.retailer_rate : v.distributor_rate;
            if (isOld) {
                finalRate = isRetailer 
                    ? (v.old_retailer_rate != null ? v.old_retailer_rate : finalRate) 
                    : (v.old_distributor_rate != null ? v.old_distributor_rate : finalRate);
            }

            variantsByProduct[prodIdStr].push({
                variant_id: v.sql_variant_id || v.id,
                pack_size: v.pack_size,
                uom: v.uom || 'Box',
                pieces_per_box: v.pieces_per_box && v.pieces_per_box > 1 ? v.pieces_per_box : parsePiecesFromPackSize(v.pack_size),
                distributor_rate: finalRate,
                retailer_rate: v.retailer_rate,
                old_distributor_rate: v.old_distributor_rate,
                old_retailer_rate: v.old_retailer_rate,
                mrp: v.mrp,
                current_stock: inventoryMap[v.id] || 0
            });
        });

        const productsMap = products.map((p) => {
            const cat = categoryMap[p.category_id];
            return {
                product_id: p.sql_product_id || p.id,
                name: p.name,
                category_id: cat ? (cat.sql_category_id || cat.id) : null,
                category_name: cat ? cat.name : 'Uncategorized',
                hsn_code: p.hsn_code,
                gst_percent: p.gst_percent,
                variants: variantsByProduct[p.id] || []
            };
        });

        return c.json(productsMap);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.post('/', async (c) => {
    try {
        const { category_id, name, hsn_code, gst_percent, variants } = await c.req.json();
        const db = drizzle(c.env.DB, { schema });
        
        const existingProd = await db.query.products.findFirst({ where: eq(schema.products.name, name) });
        if (existingProd) {
            return c.json({ message: 'A product with this name already exists.' }, 400);
        }

        const category = await db.query.categories.findFirst({
            where: or(eq(schema.categories.id, category_id), eq(schema.categories.sql_category_id, parseInt(category_id)))
        });
        if (!category) return c.json({ message: 'Category not found' }, 404);

        const newProductId = crypto.randomUUID();
        await db.insert(schema.products).values({
            id: newProductId,
            category_id: category.id,
            name,
            hsn_code,
            gst_percent: gst_percent || 0
        });

        if (variants && variants.length > 0) {
            const variantDocs = variants.map((v: any) => ({
                id: crypto.randomUUID(),
                product_id: newProductId,
                uom: v.uom || 'Box',
                pack_size: v.pack_size,
                pieces_per_box: v.pieces_per_box ? parseInt(v.pieces_per_box) : 1,
                distributor_rate: v.distributor_rate,
                retailer_rate: v.retailer_rate,
                old_distributor_rate: v.old_distributor_rate,
                old_retailer_rate: v.old_retailer_rate,
                mrp: v.mrp
            }));
            await db.insert(schema.variants).values(variantDocs);
        }

        return c.json({ message: 'Product added successfully', product_id: newProductId }, 201);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Failed to add product' }, 500);
    }
});

router.put('/:variant_id', async (c) => {
    try {
        const variant_id = c.req.param('variant_id');
        const { name, category_name, hsn_code, uom, pack_size, pieces_per_box, distributor_rate, retailer_rate, old_distributor_rate, old_retailer_rate, gst_percent, mrp } = await c.req.json();

        const db = drizzle(c.env.DB, { schema });

        let category = await db.query.categories.findFirst({ where: eq(schema.categories.name, category_name) });
        if (!category) {
            const [newCat] = await db.insert(schema.categories).values({ id: crypto.randomUUID(), name: category_name }).returning();
            category = newCat;
        }

        const variant = await db.query.variants.findFirst({
            where: or(eq(schema.variants.id, variant_id), eq(schema.variants.sql_variant_id, parseInt(variant_id)))
        });
        if (!variant) return c.json({ message: 'Variant not found' }, 404);

        const product = await db.query.products.findFirst({ where: eq(schema.products.id, variant.product_id) });
        if (!product) return c.json({ message: 'Product not found' }, 404);

        const existingName = await db.query.products.findFirst({
            where: and(eq(schema.products.name, name), ne(schema.products.id, product.id))
        });
        if (existingName) {
            return c.json({ message: 'Another product with this name already exists.' }, 400);
        }

        await db.update(schema.products).set({
            category_id: category.id,
            name,
            hsn_code,
            gst_percent: gst_percent || 0
        }).where(eq(schema.products.id, product.id));

        const existingPack = await db.query.variants.findFirst({
            where: and(eq(schema.variants.product_id, product.id), eq(schema.variants.pack_size, pack_size), ne(schema.variants.id, variant.id))
        });
        if (existingPack) {
            return c.json({ message: 'Another variant with this pack size already exists for this product.' }, 400);
        }

        await db.update(schema.variants).set({
            uom: uom || 'Box',
            pack_size,
            pieces_per_box: pieces_per_box ? parseInt(pieces_per_box) : 1,
            distributor_rate,
            retailer_rate,
            old_distributor_rate,
            old_retailer_rate,
            mrp: mrp || 0
        }).where(eq(schema.variants.id, variant.id));

        return c.json({ message: 'Product updated successfully' });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Failed to update product' }, 500);
    }
});

router.delete('/:variant_id', async (c) => {
    try {
        const variant_id = c.req.param('variant_id');
        const db = drizzle(c.env.DB, { schema });
        
        const variant = await db.query.variants.findFirst({
            where: or(eq(schema.variants.id, variant_id), eq(schema.variants.sql_variant_id, parseInt(variant_id)))
        });
        if (!variant) return c.json({ message: 'Variant not found' }, 404);

        await db.delete(schema.variants).where(eq(schema.variants.id, variant.id));

        const remaining = await db.select().from(schema.variants).where(eq(schema.variants.product_id, variant.product_id));
        if (remaining.length === 0) {
            await db.delete(schema.products).where(eq(schema.products.id, variant.product_id));
        }

        return c.json({ message: 'Deleted successfully' });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server error' }, 500);
    }
});

router.post('/bulk', async (c) => {
    try {
        const rows = await c.req.json();
        if (!Array.isArray(rows) || rows.length === 0) {
            return c.json({ message: 'Invalid data format. Expected an array of products.' }, 400);
        }

        const db = drizzle(c.env.DB, { schema });
        let successCount = 0;
        let skipCount = 0;

        for (const row of rows) {
            const category_name = row['PRODUCT CATEGORY'] || row['Category'] || row['category_name'] || null;
            const product_name = row['PRODUCT NAME'] || row['Product Name'] || row['product_name'] || row['name'];
            const hsn_code = row['HSN CODE'] || row['HSN Code'] || row['hsn_code'] || null;
            const uom = row['UOM'] || row['uom'] || 'Box';
            const pack_size = row['Packing'] || row['Pack Size'] || row['pack_size'];
            const distributor_rate = row['DB RATE WITHOUT GST'] || row['Distributor Rate'] || row['distributor_rate'];
            const retailer_rate = row['RT RATE WITHOUT GST'] || row['Retailer Rate'] || row['retailer_rate'];
            const mrp = row['MRP-NEW'] || row['MRP'] || row['mrp'] || 0;
            const gst_rate = row['GST Rate'] || row['GST'] || row['gst_percent'] || 0;
            const pieces_per_box = row['PCS IN Box/Bag'] || row['Pieces Per Box'] || row['pieces_per_box'] || 1;
            
            if (!product_name || !pack_size || distributor_rate == null || retailer_rate == null) {
                skipCount++;
                continue;
            }

            let categoryId = null;
            if (category_name) {
                let cat = await db.query.categories.findFirst({ where: eq(schema.categories.name, category_name) });
                if (!cat) {
                    const [newCat] = await db.insert(schema.categories).values({ id: crypto.randomUUID(), name: category_name }).returning();
                    cat = newCat;
                }
                categoryId = cat.id;
            }

            let prod = await db.query.products.findFirst({ where: eq(schema.products.name, product_name) });
            if (!prod) {
                const [newProd] = await db.insert(schema.products).values({
                    id: crypto.randomUUID(),
                    category_id: categoryId as string,
                    name: product_name,
                    hsn_code,
                    gst_percent: parseFloat(String(gst_rate).replace('%', '')) || 0
                }).returning();
                prod = newProd;
            }

            let variant = await db.query.variants.findFirst({ where: and(eq(schema.variants.product_id, prod.id), eq(schema.variants.pack_size, pack_size)) });
            if (!variant) {
                await db.insert(schema.variants).values({
                    id: crypto.randomUUID(),
                    product_id: prod.id,
                    uom,
                    pack_size,
                    pieces_per_box: parseInt(pieces_per_box),
                    distributor_rate,
                    retailer_rate,
                    mrp
                });
                successCount++;
            } else {
                skipCount++;
            }
        }

        return c.json({ message: 'Bulk upload completed', successCount, skipCount });
    } catch (err) {
        console.error("Bulk Upload Error:", err);
        return c.json({ message: 'Failed to process bulk upload' }, 500);
    }
});

router.post('/variant/:product_id', async (c) => {
    try {
        const product_id = c.req.param('product_id');
        const { pack_size, pieces_per_box, distributor_rate, retailer_rate, old_distributor_rate, old_retailer_rate, mrp } = await c.req.json();
        const db = drizzle(c.env.DB, { schema });

        const prod = await db.query.products.findFirst({
            where: or(eq(schema.products.id, product_id), eq(schema.products.sql_product_id, parseInt(product_id)))
        });
        if (!prod) return c.json({ message: 'Product not found' }, 404);

        const existing = await db.query.variants.findFirst({ where: and(eq(schema.variants.product_id, prod.id), eq(schema.variants.pack_size, pack_size)) });
        if (existing) {
            return c.json({ message: 'This pack size already exists for this product.' }, 400);
        }

        const [variant] = await db.insert(schema.variants).values({
            id: crypto.randomUUID(),
            product_id: prod.id,
            pack_size,
            pieces_per_box: pieces_per_box ? parseInt(pieces_per_box) : 1,
            distributor_rate: distributor_rate || 0,
            retailer_rate: retailer_rate || 0,
            old_distributor_rate: old_distributor_rate || null,
            old_retailer_rate: old_retailer_rate || null,
            mrp: mrp || 0
        }).returning();

        return c.json({
            variant_id: variant.sql_variant_id || variant.id,
            product_id: prod.sql_product_id || prod.id,
            pack_size: variant.pack_size,
            distributor_rate: variant.distributor_rate,
            retailer_rate: variant.retailer_rate,
            mrp: variant.mrp
        }, 201);
    } catch (err) {
        console.error("Add Variant Error:", err);
        return c.json({ message: 'Failed to add variant' }, 500);
    }
});

export default router;
