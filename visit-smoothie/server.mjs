import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { Accounts, SESSION_SECONDS } from './server/accounts.mjs';
import { HttpError, fields, profile, timezone } from './server/validation.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const COOKIE = 'visit_smoothie_session';
const ASSETS = new Map([
  ['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
  ['/app.js', ['app.js', 'text/javascript']], ['/views.js', ['views.js', 'text/javascript']],
  ['/profile-model.js', ['profile-model.js', 'text/javascript']], ['/styles.css', ['styles.css', 'text/css']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
function tokenFrom(req) {
  const values = (req.headers.cookie || '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${COOKIE}=`));
  return values.length === 1 ? values[0].slice(COOKIE.length + 1) : null;
}
function cookie(res, token, secure = false) {
  res.setHeader('Set-Cookie', `${COOKIE}=${token || ''}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${token ? SESSION_SECONDS : 0}${secure ? '; Secure' : ''}`);
}
async function readBody(req) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(req.headers['content-type'] || '')) throw new HttpError(415, '请使用 JSON 请求。');
  if (req.headers['content-encoding'] || Number(req.headers['content-length']) > 65536) throw new HttpError(413, '请求内容过大。');
  if (req.headers['x-app-request'] !== 'VisitSmoothie') throw new HttpError(403, '请求来源不正确。');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) throw new HttpError(413, '请求内容过大。');
    chunks.push(chunk);
  }
  try { const input = JSON.parse(Buffer.concat(chunks).toString('utf8')); fields(input, Object.keys(input)); return input; }
  catch { throw new HttpError(400, '请求内容不正确。'); }
}

export function createServer({ dbPath = path.join(ROOT, '.data', 'accounts.sqlite'), now, secureCookies = false } = {}) {
  const accounts = new Accounts(dbPath, { ...(now ? { now } : {}) });
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    try {
      const port = server.address()?.port;
      if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(req.headers.host)) throw new HttpError(403, '只允许本机服务地址。');
      if (req.headers.origin && req.headers.origin !== `${secureCookies ? 'https' : 'http'}://${req.headers.host}`) throw new HttpError(403, '请求来源不正确。');
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, '请求来源不正确。');
      const pathname = (req.url || '/').split('?')[0];
      if (!pathname.startsWith('/api/')) {
        const asset = ASSETS.get(pathname);
        if (!asset || !['GET', 'HEAD'].includes(req.method)) throw new HttpError(404, '页面不存在。', 'NOT_FOUND');
        const data = await readFile(path.join(ROOT, 'public', asset[0]));
        res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` });
        return res.end(req.method === 'HEAD' ? undefined : data);
      }
      const route = `${req.method} ${pathname}`;
      const token = tokenFrom(req);
      if (route === 'GET /api/session') { const user = accounts.session(token); return json(res, 200, user ? accounts.payload(user) : { account: null }); }
      const input = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : null;
      const user = accounts.session(token);
      if (['POST /api/register', 'POST /api/login'].includes(route)) {
        if (user) throw new HttpError(409, '请先退出当前账号，再登录或注册其他账号。', 'ACCOUNT_CHANGED');
        let result;
        if (route === 'POST /api/register') {
          fields(input, ['profile', 'password', 'timeZone']);
          const timeZone = timezone(input.timeZone ?? 'UTC');
          const details = profile(input.profile, { timeZone, ...(now ? { now: new Date(now()) } : {}) });
          result = await accounts.register(details, input.password, req.socket.remoteAddress || 'local');
        } else {
          fields(input, ['name', 'password']);
          result = await accounts.login(input.name, input.password, req.socket.remoteAddress || 'local');
        }
        // An invalidated browser request must never receive a late session cookie.
        if (res.destroyed) { accounts.logout(result.token); return; }
        cookie(res, result.token, secureCookies);
        const { token: ignored, ...payload } = result;
        return json(res, route.endsWith('register') ? 201 : 200, payload);
      }
      if (!user) throw new HttpError(401, '请先登录。', 'AUTH_REQUIRED');
      if (req.headers['x-account-id'] !== user.id) throw new HttpError(409, '登录账号已变化，请重新打开个人档案。', 'ACCOUNT_CHANGED');
      if (route === 'POST /api/logout') {
        fields(input, []);
        accounts.logout(token);
        cookie(res, null, secureCookies);
        return json(res, 200, { account: null });
      }
      if (route === 'GET /api/profile') return json(res, 200, accounts.payload(user));
      if (route === 'PUT /api/profile') {
        fields(input, ['profile', 'revision', 'timeZone']);
        const timeZone = timezone(input.timeZone ?? 'UTC');
        return json(res, 200, accounts.update(user, profile(input.profile, { timeZone, ...(now ? { now: new Date(now()) } : {}) }), input.revision));
      }
      throw new HttpError(404, '接口不存在。', 'NOT_FOUND');
    } catch (error) {
      if (!res.headersSent) json(res, error instanceof HttpError ? error.status : 500, { error: error instanceof HttpError ? error.message : '暂时无法完成请求，请稍后重试。', code: error instanceof HttpError ? error.code : 'INTERNAL_ERROR' });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.on('close', () => accounts.close());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 4190);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const server = createServer({ ...(process.env.SMOOTHIE_DB ? { dbPath: process.env.SMOOTHIE_DB } : {}) });
  server.listen(port, '127.0.0.1', () => console.log(`Visit Smoothie: http://127.0.0.1:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
}
