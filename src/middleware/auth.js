import crypto from 'node:crypto';

const COOKIE_NAME = 'cm_session';

function expectedToken() {
  const password = process.env.ACCESS_PASSWORD;
  if (!password) {
    throw new Error('ACCESS_PASSWORD environment variable is not set');
  }
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function checkPassword(candidate) {
  return candidate === process.env.ACCESS_PASSWORD;
}

export function sessionCookieValue() {
  return expectedToken();
}

export function requireAuth(req, res, next) {
  // /style.css must also be exempt: login.html itself loads it via
  // <link rel="stylesheet">, and that request hits this middleware
  // before express.static — without this, the login page would load
  // with no styling for anyone who isn't already authenticated.
  if (req.path === '/login' || req.path === '/login.html' || req.path === '/style.css') {
    return next();
  }
  const token = req.cookies?.[COOKIE_NAME];
  if (token === expectedToken()) {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  res.redirect('/login.html');
}

export { COOKIE_NAME };
