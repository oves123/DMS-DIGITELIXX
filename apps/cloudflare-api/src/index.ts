import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { R2Bucket, D1Database } from '@cloudflare/workers-types'
import auth from './routes/auth'
import products from './routes/products'
import orders from './routes/orders'
import claims from './routes/claims'
import reports from './routes/reports'

export type Env = {
  MY_BUCKET: R2Bucket;
  DB: D1Database;
  JWT_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors())

app.onError((err, c) => {
  console.error("Global Error:", err);
  return c.json({ error: err.message, stack: err.stack }, 500);
})

import dashboard from './routes/dashboard'
import distributors from './routes/distributors'
import inventory from './routes/inventory'
import settings from './routes/settings'
import ledger from './routes/ledger'

app.route('/api/auth', auth)
app.route('/api/products', products)
app.route('/api/orders', orders)
app.route('/api/claims', claims)
app.route('/api/reports', reports)
app.route('/api/dashboard', dashboard)
app.route('/api/distributors', distributors)
app.route('/api/inventory', inventory)
app.route('/api/settings', settings)
app.route('/api/ledger', ledger)

app.get('/', (c) => {
  return c.text('Cloudflare Worker API Running with D1')
})

export default app
