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
  // /style.css, /manifest.json, and everything under /assets/ must also be
  // exempt: login.html itself loads all of these (stylesheet, favicon,
  // manifest icons), and those requests hit this middleware before
  // express.static — without this, an unauthenticated visitor's login page
  // would load unstyled/iconless, and Edge/Chrome's "install as app" check
  // (which fetches manifest.json directly, unauthenticated, before any
  // login happens) would get a redirect-to-login response instead of the
  // real manifest and refuse to offer installation.
  if (
    req.path === '/login' ||
    req.path === '/login.html' ||
    req.path === '/style.css' ||
    req.path === '/manifest.json' ||
    req.path.startsWith('/assets/')
  ) {
    return next();
  }
  const token = req.cookies?.[COOKIE_NAME];
  if (token === expectedToken()) {
    // Without this, Vercel's edge CDN caches the first successful response
    // (e.g. index.html, served with express.static's default "public"
    // Cache-Control) and then serves that SAME cached copy to every later
    // visitor — including ones with no cookie at all — because a CDN cache
    // hit never reaches this middleware to be checked. `private, no-store`
    // tells any shared/CDN cache never to store this response.
    res.set('Cache-Control', 'private, no-store');
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  res.redirect('/login.html');
}

export { COOKIE_NAME };
