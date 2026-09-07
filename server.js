'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// ============================================================
// ZAKSH — PART 1/12
// Base Server + Security + Configuration
// ============================================================

const PORT = Number(process.env.PORT || 3000);

const BOT_TOKEN = String(process.env.BOT_TOKEN || '').trim();

const OWNER_ID = String(
process.env.OWNER_ID ||
process.env.OWNER_TELEGRAM_ID ||
''
).trim();

const BOT_USERNAME = String(
process.env.BOT_USERNAME || 'ZAKSH_MiningBot'
).replace(/^@/, '');

const CHANNEL_USERNAME = String(
process.env.CHANNEL_USERNAME || 'ZAKASMINER'
).replace(/^@/, '');

const BASE_URL = String(
process.env.BASE_URL || ''
).replace(/\/+$/, '');

const WEBHOOK_SECRET = String(
process.env.WEBHOOK_SECRET || ''
).trim();

const REACTION_MESSAGE_ID = Number(
process.env.REACTION_MESSAGE_ID || 0
);

const REACTION_EMOJI = String(
process.env.REACTION_EMOJI || '👍'
);

const PRICE_USD = 0.13;

const TASK_REWARD = 4;

const TASK_COOLDOWN_MS =
2 * 60 * 60 * 1000;

const MINING_WINDOW_MS =
6 * 60 * 60 * 1000;

const MAX_MINES =
2;

const MINING_MS =
40 * 1000;

const PROGRAM_MS =
48 * 24 * 60 * 60 * 1000;

// ------------------------------------------------------------
// Database
// ------------------------------------------------------------

const DB_FILE = path.join(
__dirname,
'zaksh-db.json'
);

function now() {
return Date.now();
}

function randomId(bytes = 16) {
return crypto
.randomBytes(bytes)
.toString('hex');
}

function safeNumber(value, fallback = 0) {
const n = Number(value);
return Number.isFinite(n)
? n
: fallback;
}

function safeString(value, fallback = '') {
if (value === undefined || value === null) {
return fallback;
}

return String(value);
}

function loadDB() {
try {
if (!fs.existsSync(DB_FILE)) {
return {
version: 1,
settings: {},
users: {},
logs: [],
campaign: null
};
}

const raw = fs.readFileSync(  
  DB_FILE,  
  'utf8'  
);  

const parsed = JSON.parse(raw);  

return {  
  version: 1,  
  settings: parsed.settings || {},  
  users: parsed.users || {},  
  logs: Array.isArray(parsed.logs)  
    ? parsed.logs  
    : [],  
  campaign: parsed.campaign || null  
};

} catch (err) {
console.error(
'Database load error:',
err.message
);

return {  
  version: 1,  
  settings: {},  
  users: {},  
  logs: [],  
  campaign: null  
};

}
}

const db = loadDB();

function saveDB() {
const tempFile =
DB_FILE + '.tmp';

fs.writeFileSync(
tempFile,
JSON.stringify(db, null, 2),
'utf8'
);

fs.renameSync(
tempFile,
DB_FILE
);
}

// ------------------------------------------------------------
// Campaign
// ------------------------------------------------------------

function ensureCampaign() {
if (
db.campaign &&
db.campaign.startAt &&
db.campaign.endAt
) {
return db.campaign;
}

const startAt = now();

db.campaign = {
id: randomId(12),
startAt,
endAt: startAt + PROGRAM_MS,
createdAt: startAt
};

saveDB();

return db.campaign;
}

ensureCampaign();

// ------------------------------------------------------------
// Logging
// ------------------------------------------------------------

function logEvent(
type,
message,
meta = {}
) {
db.logs.push({
id: randomId(8),
type: safeString(type),
message: safeString(message),
meta,
createdAt: now()
});

if (db.logs.length > 10000) {
db.logs.splice(
0,
db.logs.length - 10000
);
}

saveDB();
}

// ------------------------------------------------------------
// Security helpers
// ------------------------------------------------------------

function timingSafeEqualText(a, b) {
const aa = Buffer.from(
safeString(a)
);

const bb = Buffer.from(
safeString(b)
);

if (aa.length !== bb.length) {
return false;
}

return crypto.timingSafeEqual(
aa,
bb
);
}

function sha256(value) {
return crypto
.createHash('sha256')
.update(String(value))
.digest('hex');
}

// ------------------------------------------------------------
// Telegram initData validation
// ------------------------------------------------------------

function validateTelegramInitData(
initData
) {
if (!BOT_TOKEN) {
return {
ok: false,
error: 'BOT_TOKEN is not configured'
};
}

if (!initData) {
return {
ok: false,
error: 'Telegram initData is missing'
};
}

try {
const params =
new URLSearchParams(initData);

const receivedHash =  
  params.get('hash');  

if (!receivedHash) {  
  return {  
    ok: false,  
    error: 'Telegram hash is missing'  
  };  
}  

params.delete('hash');  

const dataCheckString =  
  Array.from(params.entries())  
    .sort(([a], [b]) =>  
      a.localeCompare(b)  
    )  
    .map(  
      ([key, value]) =>  
        `${key}=${value}`  
    )  
    .join('\n');  

const secretKey =  
  crypto  
    .createHmac(  
      'sha256',  
      'WebAppData'  
    )  
    .update(BOT_TOKEN)  
    .digest();  

const calculatedHash =  
  crypto  
    .createHmac(  
      'sha256',  
      secretKey  
    )  
    .update(dataCheckString)  
    .digest('hex');  

if (  
  !timingSafeEqualText(  
    calculatedHash,  
    receivedHash  
  )  
) {  
  return {  
    ok: false,  
    error: 'Invalid Telegram signature'  
  };  
}  

const authDate =  
  safeNumber(  
    params.get('auth_date'),  
    0  
  );  

if (!authDate) {  
  return {  
    ok: false,  
    error: 'Telegram auth_date is missing'  
  };  
}  

const age =  
  now() -  
  authDate * 1000;  

// 24-hour maximum age  
if (  
  age < 0 ||  
  age > 24 * 60 * 60 * 1000  
) {  
  return {  
    ok: false,  
    error: 'Telegram initData expired'  
  };  
}  

let user = null;  

const userRaw =  
  params.get('user');  

if (userRaw) {  
  try {  
    user = JSON.parse(userRaw);  
  } catch {  
    return {  
      ok: false,  
      error: 'Invalid Telegram user data'  
    };  
  }  
}  

if (  
  !user ||  
  !user.id  
) {  
  return {  
    ok: false,  
    error: 'Telegram user is missing'  
  };  
}  

return {  
  ok: true,  
  user,  
  authDate  
};

} catch (err) {
return {
ok: false,
error: 'Invalid initData'
};
}
}

// ------------------------------------------------------------
// HTTP helpers
// ------------------------------------------------------------

function sendJSON(
res,
status,
data
) {
const body =
JSON.stringify(data);

res.writeHead(
status,
{
'Content-Type':
'application/json; charset=utf-8',

'Cache-Control':  
    'no-store',  

  'X-Content-Type-Options':  
    'nosniff'  
}

);

res.end(body);
}

function sendHTML(
res,
html
) {
res.writeHead(
200,
{
'Content-Type':
'text/html; charset=utf-8',

'Cache-Control':  
    'no-store',  

  'X-Content-Type-Options':  
    'nosniff',  

  'Content-Security-Policy':  
    "default-src 'self' https://telegram.org https://*.telegram.org; script-src 'self' 'unsafe-inline' https://telegram.org https://*.telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:; frame-src https:;"  
}

);

res.end(html);
}

function notFound(res) {
sendJSON(
res,
404,
{
ok: false,
error: 'Not found'
}
);
}

// ------------------------------------------------------------
// Request body
// ------------------------------------------------------------

function readBody(req) {
return new Promise(
(resolve, reject) => {
let body = '';

let size = 0;  

  req.on(  
    'data',  
    chunk => {  
      size += chunk.length;  

      if (  
        size >  
        1024 * 1024  
      ) {  
        reject(  
          new Error(  
            'Request body too large'  
          )  
        );  

        req.destroy();  

        return;  
      }  

      body += chunk.toString(  
        'utf8'  
      );  
    }  
  );  

  req.on(  
    'end',  
    () => resolve(body)  
  );  

  req.on(  
    'error',  
    reject  
  );  
}

);
}

function parseJSONBody(body) {
if (!body) {
return {};
}

try {
return JSON.parse(body);
} catch {
return null;
}
}

// ------------------------------------------------------------
// Basic authorization helpers
// ------------------------------------------------------------

function isOwner(userId) {
return (
OWNER_ID &&
String(userId) === OWNER_ID
);
}

function isAdmin(userId) {
const user =
db.users[String(userId)];

if (!user) {
return false;
}

return (
user.role === 'admin'
);
}

function hasOwnerAccess(userId) {
return (
isOwner(userId) ||
isAdmin(userId)
);
}

// ------------------------------------------------------------
// User session extraction
// ------------------------------------------------------------

function getTelegramUserFromRequest(req) {
const initData =
req.headers['x-telegram-init-data'];

return validateTelegramInitData(
initData
);
}

// ------------------------------------------------------------
// Health information
// ------------------------------------------------------------

function healthData() {
return {
ok: true,
service: 'ZAKSH',
version: 1,
time: now(),
priceUsd: PRICE_USD,
program: {
startAt:
db.campaign.startAt,
endAt:
db.campaign.endAt
}
};
}


