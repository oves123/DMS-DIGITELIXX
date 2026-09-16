import { Hono } from 'hono';
import Models from '../db/models';
import { protect, adminOnly } from '../middleware/auth';

const router = new Hono();

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
        const categories = await Models.Category.find().lean();
        const formatted = categories.map((cat: any) => ({
            ...cat,
            category_id: cat.sql_category_id || cat._id.toString()
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
        
        const exists = await Models.Category.findOne({ name });
        if (exists) {
            return c.json({ message: 'Category already exists' }, 400);
        }

        const newCat = await Models.Category.create({ name });
        
        return c.json({
            ...newCat.toObject(),
            category_id: newCat._id.toString()
        }, 201);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/', async (c) => {
    try {
        const products = await Models.Product.find().populate('category_id').lean();
        const variants = await Models.Variant.find().lean();
        const inventory = await Models.Inventory.find().lean();

        let userRateType = 'distributor';
        let userRateVersion = 'new';
        
        const reqUser = c.get('jwtPayload' as any) as any;
        if (reqUser && reqUser.user_id) {
            const query = isNaN(reqUser.user_id) 
                ? { _id: reqUser.user_id } 
                : { sql_user_id: reqUser.user_id };
                
            const user = await Models.User.findOne(query).lean() as any;
            if (user) {
                userRateType = user.rate_type || 'distributor';
                userRateVersion = user.rate_version || 'new';
            }
        }
        
        const isRetailer = userRateType === 'retailer';
        const isOld = userRateVersion === 'old';

        const inventoryMap: any = {};
        inventory.forEach((inv: any) => {
            inventoryMap[inv.variant_id.toString()] = inv.stock_quantity;
        });

        const variantsByProduct: any = {};
        variants.forEach((v: any) => {
            const prodIdStr = v.product_id.toString();
            if (!variantsByProduct[prodIdStr]) variantsByProduct[prodIdStr] = [];
            
            let finalRate = isRetailer ? v.retailer_rate : v.distributor_rate;
            if (isOld) {
                finalRate = isRetailer 
                    ? (v.old_retailer_rate != null ? v.old_retailer_rate : finalRate) 
                    : (v.old_distributor_rate != null ? v.old_distributor_rate : finalRate);
            }

            variantsByProduct[prodIdStr].push({
                variant_id: v.sql_variant_id || v._id.toString(),
                pack_size: v.pack_size,
                uom: v.uom || 'Box',
                pieces_per_box: v.pieces_per_box || parsePiecesFromPackSize(v.pack_size),
                distributor_rate: finalRate,
                retailer_rate: v.retailer_rate,
                old_distributor_rate: v.old_distributor_rate,
                old_retailer_rate: v.old_retailer_rate,
                mrp: v.mrp,
                current_stock: inventoryMap[v._id.toString()] || 0
            });
        });

        const productsMap = products.map((p: any) => ({
            product_id: p.sql_product_id || p._id.toString(),
            name: p.name,
            category_id: p.category_id ? (p.category_id.sql_category_id || p.category_id._id.toString()) : null,
            category_name: p.category_id ? p.category_id.name : 'Uncategorized',
            hsn_code: p.hsn_code,
            gst_percent: p.gst_percent,
            variants: variantsByProduct[p._id.toString()] || []
        }));

        return c.json(productsMap);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.post('/', async (c) => {
    try {
        const { category_id, name, hsn_code, gst_percent, variants } = await c.req.json();
        
        const existingProd = await Models.Product.findOne({ name });
        if (existingProd) {
            return c.json({ message: 'A product with this name already exists.' }, 400);
        }

        let catQuery = isNaN(Number(category_id)) ? { _id: category_id } : { sql_category_id: category_id };
        const category = await Models.Category.findOne(catQuery);
        if (!category) return c.json({ message: 'Category not found' }, 404);

        const product = await Models.Product.create({
            category_id: category._id,
            name,
            hsn_code,
            gst_percent: gst_percent || 0
        });

        if (variants && variants.length > 0) {
            const variantDocs = variants.map((v: any) => ({
                product_id: product._id,
                uom: v.uom || 'Box',
                pack_size: v.pack_size,
                pieces_per_box: v.pieces_per_box || parsePiecesFromPackSize(v.pack_size),
                distributor_rate: v.distributor_rate,
                retailer_rate: v.retailer_rate,
                mrp: v.mrp
            }));
            await Models.Variant.insertMany(variantDocs);
        }

        return c.json({ message: 'Product added successfully', product_id: product._id.toString() }, 201);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Failed to add product' }, 500);
    }
});

router.put('/:variant_id', async (c) => {
    try {
        const variant_id = c.req.param('variant_id');
        const { name, category_name, hsn_code, uom, pack_size, pieces_per_box, distributor_rate, retailer_rate, gst_percent, mrp } = await c.req.json();

        let category = await Models.Category.findOne({ name: category_name });
        if (!category) {
            category = await Models.Category.create({ name: category_name });
        }

        const varQuery = isNaN(Number(variant_id)) ? { _id: variant_id } : { sql_variant_id: variant_id };
        const variant = await Models.Variant.findOne(varQuery) as any;
        if (!variant) return c.json({ message: 'Variant not found' }, 404);

        const product = await Models.Product.findById(variant.product_id);
        if (!product) return c.json({ message: 'Product not found' }, 404);

        const existingName = await Models.Product.findOne({ name, _id: { $ne: product._id } });
        if (existingName) {
            return c.json({ message: 'Another product with this name already exists.' }, 400);
        }

        await Models.Product.findByIdAndUpdate(product._id, {
            category_id: category._id,
            name,
            hsn_code,
            gst_percent: gst_percent || 0
        });

        const existingPack = await Models.Variant.findOne({ product_id: product._id, pack_size, _id: { $ne: variant._id } });
        if (existingPack) {
            return c.json({ message: 'Another variant with this pack size already exists for this product.' }, 400);
        }

        await Models.Variant.findByIdAndUpdate(variant._id, {
            uom: uom || 'Box',
            pack_size,
            pieces_per_box: pieces_per_box || parsePiecesFromPackSize(pack_size),
            distributor_rate,
            retailer_rate,
            mrp: mrp || 0
        });

        return c.json({ message: 'Product updated successfully' });
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Failed to update product' }, 500);
    }
});

router.delete('/:variant_id', async (c) => {
    try {
        const variant_id = c.req.param('variant_id');
        const varQuery = isNaN(Number(variant_id)) ? { _id: variant_id } : { sql_variant_id: variant_id };
        
        const variant = await Models.Variant.findOne(varQuery) as any;
        if (!variant) return c.json({ message: 'Variant not found' }, 404);

        await Models.Variant.findByIdAndDelete(variant._id);

        const remaining = await Models.Variant.countDocuments({ product_id: variant.product_id });
        if (remaining === 0) {
            await Models.Product.findByIdAndDelete(variant.product_id);
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

        let successCount = 0;
        let skipCount = 0;

        for (const row of rows) {
            const category_name = row['PRODUCT CATEGORY'] || row['Category'] || row['category_name'] || null;
            const product_name = row['PRODUCT NAME'] || row['Product Name'] || row['product_name'] || row['name'];
            const hsn_code = row['HSN CODE'] || row['HSN Code'] || row['hsn_code'] || null;
            const uom = row['UOM'] || row['uom'] || 'Box';
            const pack_size = row['Packing'] || row['Pack Size'] || row['pack_size'];
            const pieces_per_box = row['PCS IN Box/Bag'] || row['Pieces Per Box'] || row['pieces_per_box'] || parsePiecesFromPackSize(pack_size);
            const distributor_rate = row['DB RATE WITHOUT GST'] || row['Distributor Rate'] || row['distributor_rate'];
            const retailer_rate = row['RT RATE WITHOUT GST'] || row['Retailer Rate'] || row['retailer_rate'];
            const mrp = row['MRP-NEW'] || row['MRP'] || row['mrp'] || 0;
            const gst_rate = row['GST Rate'] || row['GST'] || row['gst_percent'] || 0;
            
            if (!product_name || !pack_size || distributor_rate == null || retailer_rate == null) {
                skipCount++;
                continue;
            }

            let categoryId = null;
            if (category_name) {
                let cat = await Models.Category.findOne({ name: category_name }) as any;
                if (!cat) {
                    cat = await Models.Category.create({ name: category_name });
                }
                categoryId = cat._id;
            }

            let prod = await Models.Product.findOne({ name: product_name }) as any;
            if (!prod) {
                prod = await Models.Product.create({
                    category_id: categoryId,
                    name: product_name,
                    hsn_code,
                    uom,
                    gst_percent: parseFloat(String(gst_rate).replace('%', '')) || 0
                });
            }

            let variant = await Models.Variant.findOne({ product_id: prod._id, pack_size });
            if (!variant) {
                await Models.Variant.create({
                    product_id: prod._id,
                    pack_size,
                    pieces_per_box,
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
        const { pack_size, pieces_per_box, distributor_rate, retailer_rate, mrp } = await c.req.json();

        const pQuery = isNaN(Number(product_id)) ? { _id: product_id } : { sql_product_id: product_id };
        const prod = await Models.Product.findOne(pQuery) as any;
        if (!prod) return c.json({ message: 'Product not found' }, 404);

        const existing = await Models.Variant.findOne({ product_id: prod._id, pack_size });
        if (existing) {
            return c.json({ message: 'This pack size already exists for this product.' }, 400);
        }

        const variant = await Models.Variant.create({
            product_id: prod._id,
            pack_size,
            pieces_per_box: pieces_per_box || parsePiecesFromPackSize(pack_size),
            distributor_rate: distributor_rate || 0,
            retailer_rate: retailer_rate || 0,
            mrp: mrp || 0
        });

        return c.json({
            variant_id: variant.sql_variant_id || variant._id.toString(),
            product_id: prod.sql_product_id || prod._id.toString(),
            pack_size: variant.pack_size,
            pieces_per_box: variant.pieces_per_box,
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
