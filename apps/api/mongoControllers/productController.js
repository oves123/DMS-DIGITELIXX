const Models = require('../mongoModels/index');

function parsePiecesFromPackSize(packSize) {
    if (!packSize) return 1;
    const match = packSize.match(/(?:(?:\(|\s|^))(\d+)\s*(?:PCS|pcs|pieces)(?:\)|\s|$)/i);
    if (match && match[1]) return parseInt(match[1]);
    const genericMatch = packSize.match(/(\d+)\s*PCS/i);
    if (genericMatch && genericMatch[1]) return parseInt(genericMatch[1]);
    return 1;
}

// GET /api/categories
exports.getCategories = async (req, res) => {
    try {
        const categories = await Models.Category.find().lean();
        const formatted = categories.map(c => ({
            ...c,
            category_id: c.sql_category_id || c._id.toString()
        }));
        res.json(formatted);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
};

// POST /api/categories
exports.addCategory = async (req, res) => {
    try {
        const { name } = req.body;
        
        const exists = await Models.Category.findOne({ name });
        if (exists) {
            return res.status(400).json({ message: 'Category already exists' });
        }

        const newCat = await Models.Category.create({ name });
        
        res.status(201).json({
            ...newCat.toObject(),
            category_id: newCat._id.toString()
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
};

// GET /api/products
exports.getProducts = async (req, res) => {
    try {
        // Fetch all data
        const products = await Models.Product.find().populate('category_id').lean();
        const variants = await Models.Variant.find().lean();
        const inventory = await Models.Inventory.find().lean();

        // Determine rate logic
        let userRateType = 'distributor';
        let userRateVersion = 'new';
        
        if (req.user && req.user.user_id) {
            // req.user.user_id might be sql_user_id (number) or mongo _id (string)
            const query = isNaN(req.user.user_id) 
                ? { _id: req.user.user_id } 
                : { sql_user_id: req.user.user_id };
                
            const user = await Models.User.findOne(query).lean();
            if (user) {
                userRateType = user.rate_type || 'distributor';
                userRateVersion = user.rate_version || 'new';
            }
        }
        
        const isRetailer = userRateType === 'retailer';
        const isOld = userRateVersion === 'old';

        // Map inventory by variant
        const inventoryMap = {};
        inventory.forEach(inv => {
            inventoryMap[inv.variant_id.toString()] = inv.stock_quantity;
        });

        // Group variants by product
        const variantsByProduct = {};
        variants.forEach(v => {
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

        const productsMap = products.map(p => ({
            product_id: p.sql_product_id || p._id.toString(),
            name: p.name,
            category_id: p.category_id ? (p.category_id.sql_category_id || p.category_id._id.toString()) : null,
            category_name: p.category_id ? p.category_id.name : 'Uncategorized',
            hsn_code: p.hsn_code,
            gst_percent: p.gst_percent,
            variants: variantsByProduct[p._id.toString()] || []
        }));

        res.json(productsMap);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
};

// POST /api/products
exports.addProduct = async (req, res) => {
    try {
        const { category_id, name, hsn_code, gst_percent, variants } = req.body;
        
        const existingProd = await Models.Product.findOne({ name });
        if (existingProd) {
            return res.status(400).json({ message: 'A product with this name already exists.' });
        }

        // Handle category_id which could be sql_category_id or mongo id
        let catQuery = isNaN(category_id) ? { _id: category_id } : { sql_category_id: category_id };
        const category = await Models.Category.findOne(catQuery);
        if (!category) return res.status(404).json({ message: 'Category not found' });

        const product = await Models.Product.create({
            category_id: category._id,
            name,
            hsn_code,
            gst_percent: gst_percent || 0
        });

        if (variants && variants.length > 0) {
            const variantDocs = variants.map(v => ({
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

        res.status(201).json({ message: 'Product added successfully', product_id: product._id.toString() });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to add product' });
    }
};

// PUT /api/products/:variant_id
exports.updateProductVariant = async (req, res) => {
    try {
        const variant_id = req.params.variant_id;
        const { name, category_name, hsn_code, uom, pack_size, pieces_per_box, distributor_rate, retailer_rate, gst_percent, mrp } = req.body;

        let category = await Models.Category.findOne({ name: category_name });
        if (!category) {
            category = await Models.Category.create({ name: category_name });
        }

        const varQuery = isNaN(variant_id) ? { _id: variant_id } : { sql_variant_id: variant_id };
        const variant = await Models.Variant.findOne(varQuery);
        if (!variant) return res.status(404).json({ message: 'Variant not found' });

        const product = await Models.Product.findById(variant.product_id);
        if (!product) return res.status(404).json({ message: 'Product not found' });

        const existingName = await Models.Product.findOne({ name, _id: { $ne: product._id } });
        if (existingName) {
            return res.status(400).json({ message: 'Another product with this name already exists.' });
        }

        await Models.Product.findByIdAndUpdate(product._id, {
            category_id: category._id,
            name,
            hsn_code,
            gst_percent: gst_percent || 0
        });

        const existingPack = await Models.Variant.findOne({ product_id: product._id, pack_size, _id: { $ne: variant._id } });
        if (existingPack) {
            return res.status(400).json({ message: 'Another variant with this pack size already exists for this product.' });
        }

        await Models.Variant.findByIdAndUpdate(variant._id, {
            uom: uom || 'Box',
            pack_size,
            pieces_per_box: pieces_per_box || parsePiecesFromPackSize(pack_size),
            distributor_rate,
            retailer_rate,
            mrp: mrp || 0
        });

        res.json({ message: 'Product updated successfully' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to update product' });
    }
};

// DELETE /api/products/:variant_id
exports.deleteProductVariant = async (req, res) => {
    try {
        const variant_id = req.params.variant_id;
        const varQuery = isNaN(variant_id) ? { _id: variant_id } : { sql_variant_id: variant_id };
        
        const variant = await Models.Variant.findOne(varQuery);
        if (!variant) return res.status(404).json({ message: 'Variant not found' });

        await Models.Variant.findByIdAndDelete(variant._id);

        const remaining = await Models.Variant.countDocuments({ product_id: variant.product_id });
        if (remaining === 0) {
            await Models.Product.findByIdAndDelete(variant.product_id);
        }

        res.json({ message: 'Deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.bulkUploadProducts = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const rows = req.body;
        if (!Array.isArray(rows) || rows.length === 0) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Invalid data format. Expected an array of products.' });
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
                let cat = await Models.Category.findOne({ name: category_name }).session(session);
                if (!cat) {
                    cat = await Models.Category.create([{ name: category_name }], { session });
                    cat = cat[0];
                }
                categoryId = cat._id;
            }

            let prod = await Models.Product.findOne({ name: product_name }).session(session);
            if (!prod) {
                prod = await Models.Product.create([{
                    category_id: categoryId,
                    name: product_name,
                    hsn_code,
                    uom,
                    gst_percent: parseFloat(String(gst_rate).replace('%', '')) || 0
                }], { session });
                prod = prod[0];
            }

            let variant = await Models.Variant.findOne({ product_id: prod._id, pack_size }).session(session);
            if (!variant) {
                await Models.Variant.create([{
                    product_id: prod._id,
                    pack_size,
                    pieces_per_box,
                    distributor_rate,
                    retailer_rate,
                    mrp
                }], { session });
                successCount++;
            } else {
                skipCount++;
            }
        }

        await session.commitTransaction();
        res.status(200).json({ message: 'Bulk upload completed', successCount, skipCount });
    } catch (err) {
        console.error("Bulk Upload Error:", err);
        await session.abortTransaction();
        res.status(500).json({ message: 'Failed to process bulk upload' });
    } finally {
        session.endSession();
    }
};

exports.addProductVariant = async (req, res) => {
    try {
        const { product_id } = req.params;
        const { pack_size, pieces_per_box, distributor_rate, retailer_rate, mrp } = req.body;

        const pQuery = isNaN(product_id) ? { _id: product_id } : { sql_product_id: product_id };
        const prod = await Models.Product.findOne(pQuery);
        if (!prod) return res.status(404).json({ message: 'Product not found' });

        const existing = await Models.Variant.findOne({ product_id: prod._id, pack_size });
        if (existing) {
            return res.status(400).json({ message: 'This pack size already exists for this product.' });
        }

        const variant = await Models.Variant.create({
            product_id: prod._id,
            pack_size,
            pieces_per_box: pieces_per_box || parsePiecesFromPackSize(pack_size),
            distributor_rate: distributor_rate || 0,
            retailer_rate: retailer_rate || 0,
            mrp: mrp || 0
        });

        res.status(201).json({
            variant_id: variant.sql_variant_id || variant._id.toString(),
            product_id: prod.sql_product_id || prod._id.toString(),
            pack_size: variant.pack_size,
            pieces_per_box: variant.pieces_per_box,
            distributor_rate: variant.distributor_rate,
            retailer_rate: variant.retailer_rate,
            mrp: variant.mrp
        });
    } catch (err) {
        console.error("Add Variant Error:", err);
        res.status(500).json({ message: 'Failed to add variant' });
    }
};
