'use strict';

/*
 * ZAKSH Mining
 * Part 2 — Configuration
 *
 * همه تنظیمات مرکزی پروژه در این فایل قرار دارد.
 * اطلاعات حساس مثل BOT_TOKEN فقط از Environment Variables خوانده می‌شوند.
 */

const path = require('path');

/* =========================
   ENVIRONMENT
========================= */

const ENV = String(process.env.NODE_ENV || 'production').toLowerCase();

const IS_PRODUCTION = ENV === 'production';
const IS_DEVELOPMENT = ENV === 'development';

/* =========================
   SERVER
========================= */

const PORT = Number(process.env.PORT || 3000);

const HOST = String(
  process.env.HOST || '0.0.0.0'
);

/* =========================
   TELEGRAM
========================= */

const BOT_TOKEN = String(
  process.env.BOT_TOKEN || ''
).trim();

const BOT_USERNAME = String(
  process.env.BOT_USERNAME || 'ZAKSH_MiningBot'
).replace(/^@/, '').trim();

const CHANNEL_USERNAME = String(
  process.env.CHANNEL_USERNAME || 'ZAKASMINER'
).replace(/^@/, '').trim();

/*
 * Telegram webhook secret
 * باید در Environment Variables هاست تنظیم شود.
 */
const TELEGRAM_WEBHOOK_SECRET = String(
  process.env.TELEGRAM_WEBHOOK_SECRET || ''
).trim();

/* =========================
   APPLICATION
========================= */

const APP_NAME = 'ZAKSH';

const TOKEN_NAME = 'ZAKSH';

const TOKEN_SYMBOL = 'ZKO';

const TOKEN_PRICE_USD = 0.13;

/* =========================
   48 DAY PROGRAM
========================= */

const PROGRAM_DAYS = 48;

const PROGRAM_MS =
  PROGRAM_DAYS *
  24 *
  60 *
  60 *
  1000;

/*
 * اگر CAMPAIGN_START_MS تنظیم نشده باشد،
 * server.js باید شروع کمپین را یک‌بار ایجاد
 * و در دیتابیس ذخیره کند.
 */
const CAMPAIGN_START_MS = Number(
  process.env.CAMPAIGN_START_MS || 0
);

/* =========================
   MINING
========================= */

const MINING_DURATION_SECONDS = 40;

const MINING_DURATION_MS =
  MINING_DURATION_SECONDS * 1000;

const MINING_MAX_ROUNDS = 2;

const MINING_COOLDOWN_HOURS = 6;

const MINING_COOLDOWN_MS =
  MINING_COOLDOWN_HOURS *
  60 *
  60 *
  1000;

/*
 * پاداش Mining توسط سرور تعیین می‌شود.
 * کاربر نباید بتواند مقدار آن را از Frontend تغییر دهد.
 */
const MINING_REWARD_MIN = 60;

const MINING_REWARD_MAX = 160;

/* =========================
   TASKS
========================= */

const TASK_REWARD = 4;

const TASK_COOLDOWN_HOURS = 2;

const TASK_COOLDOWN_MS =
  TASK_COOLDOWN_HOURS *
  60 *
  60 *
  1000;

/*
 * مدت مشاهده تبلیغ قبل از امکان Claim
 */
const AD_WATCH_SECONDS = 10;

const AD_WATCH_MS =
  AD_WATCH_SECONDS * 1000;

/* =========================
   TASK TYPES
========================= */

const TASK_TYPES = Object.freeze({
  JOIN_CHANNEL: 'join_channel',
  REACT_CHANNEL: 'react_channel',
  WATCH_AD: 'watch_ad',
  INVITE_FRIENDS: 'invite_friends'
});

/* =========================
   WALLET
========================= */

const WITHDRAWALS_LOCKED = true;

/*
 * در زمان فعلی بلاکچین متصل نیست.
 * بعداً پس از مشخص شدن قرارداد Jetton و سیستم
 * تسویه، این گزینه به‌صورت کنترل‌شده فعال می‌شود.
 */
const TON_WITHDRAWALS_ENABLED = false;

/* =========================
   DATABASE
========================= */

const DATA_DIR = String(
  process.env.DATA_DIR ||
  path.join(__dirname, 'data')
);

const DB_FILE = String(
  process.env.DB_FILE ||
  path.join(DATA_DIR, 'zaksh-db.json')
);

/* =========================
   SECURITY
========================= */

const INIT_DATA_MAX_AGE_SECONDS = 86400;

/*
 * برای جلوگیری از درخواست‌های بسیار زیاد
 * از یک کاربر.
 */
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

const RATE_LIMIT_MAX_REQUESTS = 120;

/*
 * حداقل طول nonce برای عملیات حساس
 */
const NONCE_LENGTH = 32;

/* =========================
   ADMIN
========================= */

const MAX_ADMINS = 1;

/*
 * فقط یک Owner اصلی وجود دارد.
 * شناسه Owner باید در Environment Variables تنظیم شود.
 */
const OWNER_TELEGRAM_ID = String(
  process.env.OWNER_TELEGRAM_ID || ''
).trim();

/* =========================
   STATISTICS
========================= */

const STATISTICS_PERIODS = Object.freeze({
  TODAY: 'today',
  WEEK: 'week',
  MONTH: 'month',
  ALL: 'all'
});

/* =========================
   UI
========================= */

const UI = Object.freeze({
  TOKEN_DECIMALS: 2,
  PRICE_DECIMALS: 2,
  DATE_LOCALE: 'en-US',
  CURRENCY: 'USD'
});

/* =========================
   VALIDATION
========================= */

function isValidConfig() {
  const errors = [];

  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    errors.push('Invalid PORT');
  }

  if (!Number.isFinite(TOKEN_PRICE_USD) || TOKEN_PRICE_USD <= 0) {
    errors.push('Invalid TOKEN_PRICE_USD');
  }

  if (!Number.isInteger(PROGRAM_DAYS) || PROGRAM_DAYS <= 0) {
    errors.push('Invalid PROGRAM_DAYS');
  }

  if (
    !Number.isInteger(MINING_DURATION_SECONDS) ||
    MINING_DURATION_SECONDS <= 0
  ) {
    errors.push('Invalid MINING_DURATION_SECONDS');
  }

  if (
    !Number.isInteger(MINING_MAX_ROUNDS) ||
    MINING_MAX_ROUNDS <= 0
  ) {
    errors.push('Invalid MINING_MAX_ROUNDS');
  }

  if (
    !Number.isInteger(TASK_REWARD) ||
    TASK_REWARD <= 0
  ) {
    errors.push('Invalid TASK_REWARD');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/* =========================
   EXPORT
========================= */

module.exports = Object.freeze({
  ENV,
  IS_PRODUCTION,
  IS_DEVELOPMENT,

  PORT,
  HOST,

  BOT_TOKEN,
  BOT_USERNAME,
  CHANNEL_USERNAME,
  TELEGRAM_WEBHOOK_SECRET,

  APP_NAME,
  TOKEN_NAME,
  TOKEN_SYMBOL,
  TOKEN_PRICE_USD,

  PROGRAM_DAYS,
  PROGRAM_MS,
  CAMPAIGN_START_MS,

  MINING_DURATION_SECONDS,
  MINING_DURATION_MS,
  MINING_MAX_ROUNDS,
  MINING_COOLDOWN_HOURS,
  MINING_COOLDOWN_MS,
  MINING_REWARD_MIN,
  MINING_REWARD_MAX,

  TASK_REWARD,
  TASK_COOLDOWN_HOURS,
  TASK_COOLDOWN_MS,
  AD_WATCH_SECONDS,
  AD_WATCH_MS,

  TASK_TYPES,

  WITHDRAWALS_LOCKED,
  TON_WITHDRAWALS_ENABLED,

  DATA_DIR,
  DB_FILE,

  INIT_DATA_MAX_AGE_SECONDS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
  NONCE_LENGTH,

  MAX_ADMINS,
  OWNER_TELEGRAM_ID,

  STATISTICS_PERIODS,
  UI,

  isValidConfig
});
