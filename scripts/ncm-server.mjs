import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ncm from 'NeteaseCloudMusicApi';

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const cookieFile = process.env.BANGUMI_PLUS_NCM_COOKIE_FILE
  || path.join(os.homedir(), '.bangumi-plus', 'ncm-cookie.json');

let storedCookies = readCookies();

const allowedOrigins = new Set([
  'http://bgm.tv',
  'https://bgm.tv',
  'http://www.bgm.tv',
  'https://www.bgm.tv',
  'http://bangumi.tv',
  'https://bangumi.tv',
  'http://www.bangumi.tv',
  'https://www.bangumi.tv',
  'http://chii.in',
  'https://chii.in',
  'http://www.chii.in',
  'https://www.chii.in',
]);

function isLocalOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.has(origin) || isLocalOrigin(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

function readCookies() {
  try {
    const value = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function saveCookies() {
  fs.mkdirSync(path.dirname(cookieFile), { recursive: true });
  fs.writeFileSync(cookieFile, JSON.stringify(storedCookies, null, 2), { mode: 0o600 });
}

function parseCookieString(value) {
  const cookies = {};
  for (const part of value.split(/;\s+/)) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const item = part.slice(separator + 1).trim();
    if (key && item) cookies[key] = item;
  }
  return cookies;
}

function updateCookies(response) {
  const values = Array.isArray(response?.cookie)
    ? response.cookie
    : typeof response?.cookie === 'string' ? [response.cookie] : [];
  let changed = false;

  for (const value of values) {
    for (const [key, item] of Object.entries(parseCookieString(value))) {
      if (storedCookies[key] !== item) {
        storedCookies[key] = item;
        changed = true;
      }
    }
  }

  if (changed) saveCookies();
}

function cookieHeader() {
  return Object.entries(storedCookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

function hasLoginCookie() {
  return Boolean(storedCookies.MUSIC_U);
}

function accountProfile(body) {
  return body?.data?.profile ?? body?.profile ?? null;
}

async function requestAccount() {
  const result = await ncm.login_status({ cookie: cookieHeader() });
  updateCookies(result);
  return accountProfile(result.body);
}

async function send(res, operation) {
  try {
    res.json(await operation());
  } catch (reason) {
    const status = Number.isFinite(reason?.status) ? reason.status : 500;
    console.error('[bangumi-plus ncm]', reason);
    res.status(status).json({
      code: status,
      message: reason instanceof Error ? reason.message : '本地 NCM API 请求失败',
    });
  }
}

app.get('/health', (_req, res) => {
  res.json({ code: 200, loggedIn: hasLoginCookie() });
});

app.get('/login/status', (_req, res) => {
  void send(res, async () => {
    if (!hasLoginCookie()) return { code: 200, profile: null };
    const profile = await requestAccount();
    return { code: 200, profile };
  });
});

app.get('/login/qr/key', (_req, res) => {
  void send(res, async () => {
    const result = await ncm.login_qr_key({ noCookie: true });
    return result.body;
  });
});

app.get('/login/qr/create', (req, res) => {
  void send(res, async () => {
    const result = await ncm.login_qr_create({
      key: String(req.query.key ?? ''),
      qrimg: 'true',
      platform: 'web',
      noCookie: true,
    });
    return result.body;
  });
});

app.get('/login/qr/check', (req, res) => {
  void send(res, async () => {
    const result = await ncm.login_qr_check({
      key: String(req.query.key ?? ''),
      noCookie: true,
    });
    const code = Number(result.body?.code);
    if (code === 803) {
      updateCookies(result);
      const profile = await requestAccount();
      return { code, message: '登录成功', profile };
    }
    return { code, message: result.body?.message ?? '等待扫码' };
  });
});

app.post('/logout', (_req, res) => {
  storedCookies = {};
  try {
    fs.rmSync(cookieFile, { force: true });
  } catch (reason) {
    console.error('[bangumi-plus ncm] 登录态删除失败', reason);
  }
  res.json({ code: 200, profile: null });
});

app.get('/cloudsearch', (req, res) => {
  void send(res, async () => {
    const result = await ncm.cloudsearch({
      keywords: String(req.query.keywords ?? ''),
      type: 1,
      offset: Number(req.query.offset ?? 0),
      total: true,
      limit: Number(req.query.limit ?? 100),
      cookie: cookieHeader(),
    });
    updateCookies(result);
    return result.body;
  });
});

app.get('/album', (req, res) => {
  void send(res, async () => {
    const result = await ncm.album({
      id: Number(req.query.id ?? 0),
      cookie: cookieHeader(),
    });
    updateCookies(result);
    return result.body;
  });
});

app.get('/song/url/v1', (req, res) => {
  void send(res, async () => {
    const result = await ncm.song_url_v1({
      id: Number(req.query.id ?? 0),
      level: String(req.query.level ?? 'standard'),
      encodeType: String(req.query.encodeType ?? 'mp3'),
      cookie: cookieHeader(),
    });
    updateCookies(result);
    return result.body;
  });
});

app.listen(port, host, () => {
  console.info(`Bangumi+ 本地 NCM 服务: http://${host}:${port}`);
  console.info(`登录态文件: ${cookieFile}`);
});
