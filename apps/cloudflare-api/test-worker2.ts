import mongoose from 'mongoose/lib/index.js';
export default {
  async fetch(request: any, env: any, ctx: any) {
    const m = (mongoose as any).default || mongoose;
    return new Response(JSON.stringify({
      hasConnect: typeof m.connect === 'function',
      type: typeof m.connect,
      keys: Object.keys(m)
    }));
  }
};
