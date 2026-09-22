import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, or, desc, inArray, gte, lte, and } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { Env } from '../index';

const router = new Hono<{ Bindings: Env }>();

async function fetchInChunks<T>(ids: any[], chunkSize: number, fetcher: (chunk: any[]) => Promise<T[]>): Promise<T[]> {
    let results: T[] = [];
    for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        results = results.concat(await fetcher(chunk));
    }
    return results;
}


router.get('/admin/sales', async (c) => {
    try {
        const startDate = c.req.query('startDate');
        const endDate = c.req.query('endDate');
        const db = drizzle(c.env.DB, { schema });

        let conditions: any[] = [eq(schema.orders.status, 'EXECUTED')];
        if (startDate && endDate) {
            conditions.push(gte(schema.orders.order_date, new Date(startDate)));
            conditions.push(lte(schema.orders.order_date, new Date(endDate + 'T23:59:59.999Z')));
        }

        const orders = await db.select().from(schema.orders).where(and(...conditions));
        const orderIds = orders.map(o => o.id);
        
        let invoices: any[] = [];
        if (orderIds.length > 0) {
            invoices = await fetchInChunks(orderIds, 90, chunk => db.select().from(schema.invoices).where(inArray(schema.invoices.order_id, chunk)));
        }

        const invMap: any = {};
        invoices.forEach(i => invMap[i.order_id] = i.grand_total);

        const salesByDate: any = {};

        orders.forEach(o => {
            if (!o.order_date) return;
            const dateStr = new Date(o.order_date).toISOString().split('T')[0];
            if (!salesByDate[dateStr]) {
                salesByDate[dateStr] = { total_orders: 0, total_revenue: 0 };
            }
            salesByDate[dateStr].total_orders += 1;
            salesByDate[dateStr].total_revenue += invMap[o.id] || 0;
        });

        const sales = Object.keys(salesByDate).sort().map(date => ({
            date,
            total_orders: salesByDate[date].total_orders,
            total_revenue: salesByDate[date].total_revenue
        }));

        return c.json(sales);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/admin/products', async (c) => {
    try {
        const startDate = c.req.query('startDate');
        const endDate = c.req.query('endDate');
        const db = drizzle(c.env.DB, { schema });

        let conditions: any[] = [eq(schema.orders.status, 'EXECUTED')];
        if (startDate && endDate) {
            conditions.push(gte(schema.orders.order_date, new Date(startDate)));
            conditions.push(lte(schema.orders.order_date, new Date(endDate + 'T23:59:59.999Z')));
        }

        const orders = await db.select().from(schema.orders).where(and(...conditions));
        const orderIds = orders.map(o => o.id);

        let orderItems: any[] = [];
        if (orderIds.length > 0) {
            orderItems = await fetchInChunks(orderIds, 90, chunk => db.select().from(schema.orderItems).where(inArray(schema.orderItems.order_id, chunk)));
        }

        const variantIds = Array.from(new Set(orderItems.map(i => i.variant_id)));
        let variants: any[] = [];
        let products: any[] = [];
        
        if (variantIds.length > 0) {
            variants = await fetchInChunks(variantIds, 90, chunk => db.select().from(schema.variants).where(inArray(schema.variants.id, chunk)));
            const prodIds = Array.from(new Set(variants.map(v => v.product_id)));
            if (prodIds.length > 0) {
                products = await fetchInChunks(prodIds, 90, chunk => db.select().from(schema.products).where(inArray(schema.products.id, chunk)));
            }
        }

        const varToProd: any = {};
        variants.forEach(v => {
            const prod = products.find(p => p.id === v.product_id);
            if (prod) varToProd[v.id] = prod.name;
        });

        const productSales: any = {};
        orderItems.forEach(item => {
            const prodName = varToProd[item.variant_id];
            if (prodName) {
                if (!productSales[prodName]) productSales[prodName] = 0;
                productSales[prodName] += (item.executed_qty || 0);
            }
        });

        const topProducts = Object.keys(productSales).map(name => ({
            product_name: name,
            total_sold: productSales[name]
        })).sort((a, b) => b.total_sold - a.total_sold).slice(0, 15);

        return c.json(topProducts);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/admin/distributors', async (c) => {
    try {
        const startDate = c.req.query('startDate');
        const endDate = c.req.query('endDate');
        const db = drizzle(c.env.DB, { schema });

        let conditions: any[] = [eq(schema.orders.status, 'EXECUTED')];
        if (startDate && endDate) {
            conditions.push(gte(schema.orders.order_date, new Date(startDate)));
            conditions.push(lte(schema.orders.order_date, new Date(endDate + 'T23:59:59.999Z')));
        }

        const orders = await db.select().from(schema.orders).where(and(...conditions));
        const orderIds = orders.map(o => o.id);

        let invoices: any[] = [];
        if (orderIds.length > 0) {
            invoices = await fetchInChunks(orderIds, 90, chunk => db.select().from(schema.invoices).where(inArray(schema.invoices.order_id, chunk)));
        }
        
        const distIds = Array.from(new Set(orders.map(o => o.distributor_id)));
        let users: any[] = [];
        if (distIds.length > 0) {
            users = await fetchInChunks(distIds, 90, chunk => db.select().from(schema.users).where(inArray(schema.users.id, chunk)));
        }

        const distMap: any = {};
        users.forEach(u => distMap[u.id] = u.firm_name);

        const invMap: any = {};
        invoices.forEach(i => invMap[i.order_id] = i.grand_total);

        const distSales: any = {};
        orders.forEach(o => {
            const distName = distMap[o.distributor_id];
            if (distName) {
                if (!distSales[distName]) distSales[distName] = { total_orders: 0, total_spent: 0 };
                distSales[distName].total_orders += 1;
                distSales[distName].total_spent += (invMap[o.id] || 0);
            }
        });

        const topDistributors = Object.keys(distSales).map(name => ({
            distributor_name: name,
            total_orders: distSales[name].total_orders,
            total_spent: distSales[name].total_spent
        })).sort((a, b) => b.total_spent - a.total_spent).slice(0, 10);

        return c.json(topDistributors);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/admin/inventory', async (c) => {
    try {
        const db = drizzle(c.env.DB, { schema });
        const inv = await db.select().from(schema.inventory);
        const alertsRaw = inv.filter(i => (i.stock_quantity || 0) <= (i.low_stock_threshold || 0));

        const varIds = alertsRaw.map(i => i.variant_id);
        let variants: any[] = [];
        let products: any[] = [];
        if (varIds.length > 0) {
            variants = await fetchInChunks(varIds, 90, chunk => db.select().from(schema.variants).where(inArray(schema.variants.id, chunk)));
            const prodIds = variants.map(v => v.product_id);
            if(prodIds.length > 0) {
                products = await fetchInChunks(prodIds, 90, chunk => db.select().from(schema.products).where(inArray(schema.products.id, chunk)));
            }
        }

        const alerts = alertsRaw.map(i => {
            const v = variants.find(v => v.id === i.variant_id) || {} as any;
            const p = products.find(p => p.id === v.product_id) || {} as any;
            return {
                product_name: p.name,
                pack_size: v.pack_size,
                current_stock_qty: i.stock_quantity
            };
        }).sort((a, b) => (a.current_stock_qty || 0) - (b.current_stock_qty || 0));

        return c.json(alerts);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/admin/transactions', async (c) => {
    try {
        const startDate = c.req.query('startDate');
        const endDate = c.req.query('endDate');
        const month = c.req.query('month');
        const year = c.req.query('year');
        const db = drizzle(c.env.DB, { schema });

        let conditions: any[] = [];
        if (startDate && endDate) {
            conditions.push(gte(schema.invoices.created_at, new Date(startDate)));
            conditions.push(lte(schema.invoices.created_at, new Date(endDate + 'T23:59:59.999Z')));
        } else if (month && year) {
            const start = new Date(Number(year), Number(month) - 1, 1);
            const end = new Date(Number(year), Number(month), 0, 23, 59, 59, 999);
            conditions.push(gte(schema.invoices.created_at, start));
            conditions.push(lte(schema.invoices.created_at, end));
        }

        const invoicesList = conditions.length > 0 
            ? await db.select().from(schema.invoices).where(and(...conditions))
            : await db.select().from(schema.invoices);
            
        const orderIds = Array.from(new Set(invoicesList.map(i => i.order_id)));
        let ordersList: any[] = [];
        if (orderIds.length > 0) {
            ordersList = await fetchInChunks(orderIds, 90, chunk => db.select().from(schema.orders).where(inArray(schema.orders.id, chunk)));
        }

        const distIds = Array.from(new Set(ordersList.map(o => o.distributor_id)));
        let users: any[] = [];
        if (distIds.length > 0) {
            users = await fetchInChunks(distIds, 90, chunk => db.select().from(schema.users).where(inArray(schema.users.id, chunk)));
        }

        const transactions = invoicesList.map(i => {
            const order = ordersList.find(o => o.id === i.order_id);
            const u = order ? users.find(u => u.id === order.distributor_id) : null;
            return {
                date: i.created_at ? new Date(i.created_at).toISOString() : new Date().toISOString(),
                invoice_number: i.invoice_number,
                firm_name: u?.firm_name || 'Unknown',
                town: u?.address || '-',
                taxable_amount: i.subtotal,
                gst_amount: i.cgst_amount + i.sgst_amount,
                total_amount: i.grand_total
            };
        });

        return c.json(transactions);
    } catch (err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/distributor/:id/purchases', async (c) => {
    try {
        const id = c.req.param('id');
        const startDate = c.req.query('startDate');
        const endDate = c.req.query('endDate');
        const db = drizzle(c.env.DB, { schema });

        const user = await db.query.users.findFirst({
            where: or(eq(schema.users.id, id), eq(schema.users.sql_user_id, parseInt(id)))
        });
        if (!user) return c.json({ message: 'User not found' }, 404);

        let conditions: any[] = [eq(schema.orders.status, 'EXECUTED'), eq(schema.orders.distributor_id, user.id)];
        if (startDate && endDate) {
            conditions.push(gte(schema.orders.order_date, new Date(startDate)));
            conditions.push(lte(schema.orders.order_date, new Date(endDate + 'T23:59:59.999Z')));
        }

        const orders = await db.select().from(schema.orders).where(and(...conditions));
        const orderIds = orders.map(o => o.id);
        
        let invoices: any[] = [];
        if (orderIds.length > 0) {
            invoices = await fetchInChunks(orderIds, 90, chunk => db.select().from(schema.invoices).where(inArray(schema.invoices.order_id, chunk)));
        }
        const invMap: any = {};
        invoices.forEach(i => invMap[i.order_id] = i.grand_total);

        const salesByDate: any = {};
        orders.forEach(o => {
            if (!o.order_date) return;
            const dateStr = new Date(o.order_date).toISOString().split('T')[0];
            if (!salesByDate[dateStr]) salesByDate[dateStr] = { total_orders: 0, amount_spent: 0 };
            salesByDate[dateStr].total_orders += 1;
            salesByDate[dateStr].amount_spent += invMap[o.id] || 0;
        });

        const sales = Object.keys(salesByDate).sort().map(date => ({
            date,
            total_orders: salesByDate[date].total_orders,
            amount_spent: salesByDate[date].amount_spent
        }));

        return c.json(sales);
    } catch(err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

router.get('/distributor/:id/products', async (c) => {
    try {
        const id = c.req.param('id');
        const startDate = c.req.query('startDate');
        const endDate = c.req.query('endDate');
        const db = drizzle(c.env.DB, { schema });

        const user = await db.query.users.findFirst({
            where: or(eq(schema.users.id, id), eq(schema.users.sql_user_id, parseInt(id)))
        });
        if (!user) return c.json({ message: 'User not found' }, 404);

        let conditions: any[] = [eq(schema.orders.status, 'EXECUTED'), eq(schema.orders.distributor_id, user.id)];
        if (startDate && endDate) {
            conditions.push(gte(schema.orders.order_date, new Date(startDate)));
            conditions.push(lte(schema.orders.order_date, new Date(endDate + 'T23:59:59.999Z')));
        }

        const orders = await db.select().from(schema.orders).where(and(...conditions));
        const orderIds = orders.map(o => o.id);

        let orderItems: any[] = [];
        if (orderIds.length > 0) {
            orderItems = await fetchInChunks(orderIds, 90, chunk => db.select().from(schema.orderItems).where(inArray(schema.orderItems.order_id, chunk)));
        }

        const variantIds = Array.from(new Set(orderItems.map(i => i.variant_id)));
        let variants: any[] = [];
        let products: any[] = [];
        if (variantIds.length > 0) {
            variants = await fetchInChunks(variantIds, 90, chunk => db.select().from(schema.variants).where(inArray(schema.variants.id, chunk)));
            const prodIds = Array.from(new Set(variants.map(v => v.product_id)));
            if (prodIds.length > 0) {
                products = await fetchInChunks(prodIds, 90, chunk => db.select().from(schema.products).where(inArray(schema.products.id, chunk)));
            }
        }
        const varToProd: any = {};
        variants.forEach(v => {
            const prod = products.find(p => p.id === v.product_id);
            if (prod) varToProd[v.id] = prod.name;
        });

        const productSales: any = {};
        orderItems.forEach(item => {
            const prodName = varToProd[item.variant_id];
            if (prodName) {
                if (!productSales[prodName]) productSales[prodName] = 0;
                productSales[prodName] += (item.executed_qty || 0);
            }
        });

        const topProducts = Object.keys(productSales).map(name => ({
            product_name: name,
            total_bought: productSales[name]
        })).sort((a, b) => b.total_bought - a.total_bought).slice(0, 15);

        return c.json(topProducts);
    } catch(err) {
        console.error(err);
        return c.json({ message: 'Server Error' }, 500);
    }
});

export default router;
