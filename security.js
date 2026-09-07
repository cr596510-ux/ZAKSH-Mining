'use strict';

const crypto = require('crypto');

/*
 * ZAKSH Mining
 * Part 3 — Security
 *
 * مسئولیت‌های این فایل:
 * - اعتبارسنجی Telegram Mini App initData
 * - بررسی زمان initData
 * - ساخت و بررسی nonce
 * - مقایسه امن مقادیر حساس
 * - Rate Limit
 * - اعتبارسنجی Telegram User
 * - جلوگیری از دستکاری داده‌های حساس سمت کاربر
 */

const config = require('./config');

/* =========================================================
   CONSTANTS
========================================================= */

const INIT_DATA_MAX_AGE_SECONDS =
  Number(config.INIT_DATA_MAX_AGE_SECONDS || 86400);

const RATE_LIMIT_WINDOW_MS =
  Number(config.RATE_LIMIT_WINDOW_MS || 60000);

const RATE_LIMIT_MAX_REQUESTS =
  Number(config.RATE_LIMIT_MAX_REQUESTS || 120);

const NONCE_LENGTH =
  Number(config.NONCE_LENGTH || 32);

/* =========================================================
   INTERNAL RATE LIMIT STORAGE
========================================================= */

const rateLimitStore = new Map();

/*
 * پاک‌سازی دوره‌ای IP/Userهای قدیمی
 */
const RATE_LIMIT_CLEANUP_INTERVAL = setInterval(() => {
  const now = Date.now();

  for (const [key, entry] of rateLimitStore.entries()) {
    if (
      !entry ||
      now - entry.startedAt > RATE_LIMIT_WINDOW_MS * 2
    ) {
      rateLimitStore.delete(key);
    }
  }
}, RATE_LIMIT_WINDOW_MS * 2);

if (
  RATE_LIMIT_CLEANUP_INTERVAL &&
  typeof RATE_LIMIT_CLEANUP_INTERVAL.unref === 'function'
) {
  RATE_LIMIT_CLEANUP_INTERVAL.unref();
}

/* =========================================================
   BASIC HELPERS
========================================================= */

function sha256(value) {
  return crypto
    .createHash('sha256')
    .update(String(value), 'utf8')
    .digest('hex');
}

function hmacSha256(key, value, encoding = 'hex') {
  return crypto
    .createHmac('sha256', key)
    .update(String(value), 'utf8')
    .digest(encoding);
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');

  if (aa.length !== bb.length) {
    return false;
  }

  return crypto.timingSafeEqual(aa, bb);
}

function randomNonce() {
  return crypto
    .randomBytes(NONCE_LENGTH)
    .toString('hex');
}

/* =========================================================
   TELEGRAM INIT DATA
========================================================= */

/*
 * Telegram Mini App:
 *
 * data_check_string =
 * auth_date=<...>
 * query_id=<...>
 * user=<...>
 *
 * مرتب‌سازی بر اساس نام پارامترها.
 */

function parseInitData(initData) {
  if (
    typeof initData !== 'string' ||
    !initData.trim()
  ) {
    return null;
  }

  const params = new URLSearchParams(initData);

  const result = {};

  for (const [key, value] of params.entries()) {
    result[key] = value;
  }

  return result;
}

function buildDataCheckString(params) {
  const keys = Object.keys(params)
    .filter((key) => key !== 'hash')
    .sort();

  return keys
    .map((key) => `${key}=${params[key]}`)
    .join('\n');
}

/*
 * Telegram Mini App validation
 *
 * secret_key =
 * HMAC-SHA256("WebAppData", BOT_TOKEN)
 *
 * expected_hash =
 * HMAC-SHA256(secret_key, data_check_string)
 */
function validateTelegramInitData(
  initData,
  botToken = config.BOT_TOKEN
) {
  if (
    typeof initData !== 'string' ||
    !initData.trim()
  ) {
    return {
      valid: false,
      error: 'Missing initData'
    };
  }

  if (
    typeof botToken !== 'string' ||
    !botToken
  ) {
    return {
      valid: false,
      error: 'BOT_TOKEN is not configured'
    };
  }

  const params = parseInitData(initData);

  if (!params) {
    return {
      valid: false,
      error: 'Invalid initData'
    };
  }

  const receivedHash = String(
    params.hash || ''
  ).toLowerCase();

  if (
    !/^[a-f0-9]{64}$/i.test(receivedHash)
  ) {
    return {
      valid: false,
      error: 'Invalid Telegram hash'
    };
  }

  const dataCheckString =
    buildDataCheckString(params);

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken, 'utf8')
    .digest();

  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString, 'utf8')
    .digest('hex')
    .toLowerCase();

  if (
    !safeEqual(
      calculatedHash,
      receivedHash
    )
  ) {
    return {
      valid: false,
      error: 'Telegram signature verification failed'
    };
  }

  /* =======================================================
     AUTH DATE
  ======================================================= */

  const authDate = Number(
    params.auth_date || 0
  );

  if (
    !Number.isInteger(authDate) ||
    authDate <= 0
  ) {
    return {
      valid: false,
      error: 'Invalid auth_date'
    };
  }

  const nowSeconds =
    Math.floor(Date.now() / 1000);

  const age =
    nowSeconds - authDate;

  /*
   * آینده بودن auth_date نیز غیرمجاز است.
   */
  if (age < -60) {
    return {
      valid: false,
      error: 'Invalid auth_date'
    };
  }

  if (
    age >
    INIT_DATA_MAX_AGE_SECONDS
  ) {
    return {
      valid: false,
      error: 'Telegram initData expired'
    };
  }

  /* =======================================================
     USER
  ======================================================= */

  let user = null;

  if (params.user) {
    try {
      user = JSON.parse(params.user);
    } catch {
      return {
        valid: false,
        error: 'Invalid Telegram user data'
      };
    }
  }

  if (
    !user ||
    !user.id
  ) {
    return {
      valid: false,
      error: 'Telegram user is missing'
    };
  }

  if (
    !/^\d+$/.test(
      String(user.id)
    )
  ) {
    return {
      valid: false,
      error: 'Invalid Telegram user ID'
    };
  }

  return {
    valid: true,
    user,
    authDate,
    queryId: params.query_id || null,
    raw: params
  };
}

/* =========================================================
   REQUEST AUTHENTICATION
========================================================= */

function getTelegramInitDataFromRequest(req) {
  if (!req || !req.headers) {
    return '';
  }

  /*
   * اول Authorization Bearer
   */
  const authorization =
    String(
      req.headers.authorization || ''
    );

  if (
    authorization
      .toLowerCase()
      .startsWith('bearer ')
  ) {
    return authorization
      .slice(7)
      .trim();
  }

  /*
   * سپس Telegram-Web-App-Init-Data
   */
  const header =
    req.headers['telegram-web-app-init-data'];

  if (header) {
    return String(header);
  }

  /*
   * سپس X-Telegram-Init-Data
   */
  const legacy =
    req.headers['x-telegram-init-data'];

  if (legacy) {
    return String(legacy);
  }

  return '';
}

function authenticateTelegramRequest(req) {
  const initData =
    getTelegramInitDataFromRequest(req);

  return validateTelegramInitData(
    initData,
    config.BOT_TOKEN
  );
}

/* =========================================================
   TELEGRAM USER VALIDATION
========================================================= */

function isValidTelegramUser(user) {
  if (
    !user ||
    user.id === undefined ||
    user.id === null
  ) {
    return false;
  }

  const id = String(user.id);

  if (!/^\d+$/.test(id)) {
    return false;
  }

  if (id.length < 1 || id.length > 20) {
    return false;
  }

  return true;
}

/* =========================================================
   OWNER VALIDATION
========================================================= */

function isOwner(userId) {
  const ownerId =
    String(config.OWNER_TELEGRAM_ID || '');

  if (!ownerId) {
    return false;
  }

  return safeEqual(
    String(userId),
    ownerId
  );
}

/* =========================================================
   ADMIN ID VALIDATION
========================================================= */

function isValidAdminId(userId) {
  return isValidTelegramUser({
    id: userId
  });
}

/* =========================================================
   RATE LIMIT
========================================================= */

function rateLimit(
  identifier,
  maxRequests = RATE_LIMIT_MAX_REQUESTS,
  windowMs = RATE_LIMIT_WINDOW_MS
) {
  const key =
    sha256(String(identifier));

  const now = Date.now();

  let entry =
    rateLimitStore.get(key);

  if (
    !entry ||
    now - entry.startedAt >= windowMs
  ) {
    entry = {
      startedAt: now,
      count: 0
    };

    rateLimitStore.set(
      key,
      entry
    );
  }

  entry.count += 1;

  if (
    entry.count > maxRequests
  ) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs:
        Math.max(
          0,
          windowMs -
          (now - entry.startedAt)
        )
    };
  }

  return {
    allowed: true,
    remaining:
      Math.max(
        0,
        maxRequests - entry.count
      ),
    retryAfterMs: 0
  };
}

/* =========================================================
   REQUEST IDENTIFIER
========================================================= */

function getClientIdentifier(req) {
  if (!req || !req.headers) {
    return 'unknown';
  }

  const forwarded =
    req.headers['x-forwarded-for'];

  if (forwarded) {
    return String(
      forwarded
        .split(',')[0]
        .trim()
    );
  }

  const realIp =
    req.headers['x-real-ip'];

  if (realIp) {
    return String(realIp);
  }

  return String(
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/* =========================================================
   INPUT VALIDATION
========================================================= */

function isSafeString(
  value,
  maxLength = 500
) {
  if (
    typeof value !== 'string'
  ) {
    return false;
  }

  if (
    value.length === 0 ||
    value.length > maxLength
  ) {
    return false;
  }

  return true;
}

function isSafeInteger(
  value,
  min,
  max
) {
  if (
    typeof value === 'number'
  ) {
    if (!Number.isInteger(value)) {
      return false;
    }

    return (
      value >= min &&
      value <= max
    );
  }

  if (
    typeof value === 'string' &&
    /^-?\d+$/.test(value)
  ) {
    const number =
      Number(value);

    return (
      Number.isSafeInteger(number) &&
      number >= min &&
      number <= max
    );
  }

  return false;
}

/* =========================================================
   NONCE VALIDATION
========================================================= */

function isValidNonce(nonce) {
  if (
    typeof nonce !== 'string'
  ) {
    return false;
  }

  /*
   * randomBytes(...).toString('hex')
   * دو کاراکتر برای هر بایت تولید می‌کند.
   */
  const expectedLength =
    NONCE_LENGTH * 2;

  if (
    nonce.length !==
    expectedLength
  ) {
    return false;
  }

  return /^[a-f0-9]+$/i.test(
    nonce
  );
}

/* =========================================================
   WEBHOOK SECRET
========================================================= */

function validateWebhookSecret(
  receivedSecret
) {
  const configuredSecret =
    String(
      config.TELEGRAM_WEBHOOK_SECRET ||
      ''
    );

  if (
    !configuredSecret ||
    !receivedSecret
  ) {
    return false;
  }

  return safeEqual(
    configuredSecret,
    String(receivedSecret)
  );
}

/* =========================================================
   WALLET ADDRESS BASIC VALIDATION
========================================================= */

function isValidTonWalletAddress(
  address
) {
  if (
    typeof address !== 'string'
  ) {
    return false;
  }

  const value =
    address.trim();

  /*
   * TON user-friendly addresses
   * معمولاً با EQ یا UQ شروع می‌شوند.
   */
  if (
    !/^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(
      value
    )
  ) {
    return false;
  }

  return true;
}

/* =========================================================
   EXPORT
========================================================= */

module.exports = Object.freeze({
  sha256,
  hmacSha256,
  safeEqual,
  randomNonce,

  parseInitData,
  buildDataCheckString,

  validateTelegramInitData,
  getTelegramInitDataFromRequest,
  authenticateTelegramRequest,

  isValidTelegramUser,
  isOwner,
  isValidAdminId,

  rateLimit,
  getClientIdentifier,

  isSafeString,
  isSafeInteger,

  isValidNonce,
  validateWebhookSecret,

  isValidTonWalletAddress
});
