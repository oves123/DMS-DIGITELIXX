import { Context, Next } from 'hono';
import { verify } from 'hono/jwt';

export const protect = async (c: Context, next: Next) => {
  let token;

  if (c.req.header('Authorization')?.startsWith('Bearer')) {
    token = c.req.header('Authorization')?.split(' ')[1];
  }

  if (!token) {
    return c.json({ message: 'Not authorized, no token' }, 401);
  }

  try {
    const decoded = await verify(token, c.env.JWT_SECRET || 'fallback_secret', "HS256");
    c.set('jwtPayload', decoded);
    await next();
  } catch (error) {
    return c.json({ message: 'Not authorized, token failed' }, 401);
  }
};

export const adminOnly = async (c: Context, next: Next) => {
  const user = c.get('jwtPayload') as any;
  if (user && user.role === 'SD_ADMIN') {
    await next();
  } else {
    return c.json({ message: 'Not authorized as an admin' }, 403);
  }
};
