import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { R2Bucket } from '@cloudflare/workers-types'
import { connectDB } from './db/mongo'
import auth from './routes/auth'
import products from './routes/products'
import orders from './routes/orders'
import claims from './routes/claims'
import reports from './routes/reports'

export type Env = {
  MY_BUCKET: R2Bucket;
  MONGO_URI: string;
  JWT_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors())

// Connect to MongoDB before processing any route
app.use('*', async (c, next) => {
  if (c.env.MONGO_URI) {
    await connectDB(c.env.MONGO_URI);
  }
  await next();
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
  return c.text('Cloudflare Worker API Running with MongoDB')
})

export default app
