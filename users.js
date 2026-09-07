'use strict';

/*
 * ZAKSH Mining
 * Part 4 — Users
 *
 * مسئولیت این فایل:
 * - ایجاد کاربر
 * - دریافت کاربر
 * - به‌روزرسانی کاربر
 * - مدیریت موجودی ZKO
 * - ثبت فعالیت کاربر
 * - مدیریت آمار Mining و Task
 *
 * این فایل منطق کاربر را نگه می‌دارد.
 * دسترسی Owner/Admin در admin.js مدیریت خواهد شد.
 */

const crypto = require('crypto');

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_BALANCE = 0;

const DEFAULT_MINING_ROUNDS = 0;

const DEFAULT_TASKS_COMPLETED = 0;

const MAX_USERNAME_LENGTH = 64;

const MAX_FIRST_NAME_LENGTH = 128;

const MAX_LAST_NAME_LENGTH = 128;

const MAX_REFERRAL_CODE_LENGTH = 64;

/* =========================================================
   INTERNAL HELPERS
========================================================= */

function now() {
  return Date.now();
}

function cleanString(value, maxLength = 255) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value)
    .trim()
    .slice(0, maxLength);
}

function normalizeTelegramId(id) {
  if (
    id === undefined ||
    id === null
  ) {
    return '';
  }

  return String(id).trim();
}

function createReferralCode(telegramId) {
  const random = crypto
    .randomBytes(8)
    .toString('hex');

  const base = normalizeTelegramId(
    telegramId
  );

  return `ZKO_${base}_${random}`.slice(
    0,
    MAX_REFERRAL_CODE_LENGTH
  );
}

/* =========================================================
   USER FACTORY
========================================================= */

function createUserData(telegramUser = {}) {
  const telegramId =
    normalizeTelegramId(
      telegramUser.id
    );

  if (!telegramId) {
    throw new Error(
      'Telegram user ID is required'
    );
  }

  const timestamp = now();

  return {
    id: telegramId,

    telegramId,

    username: cleanString(
      telegramUser.username,
      MAX_USERNAME_LENGTH
    ),

    firstName: cleanString(
      telegramUser.first_name,
      MAX_FIRST_NAME_LENGTH
    ),

    lastName: cleanString(
      telegramUser.last_name,
      MAX_LAST_NAME_LENGTH
    ),

    languageCode: cleanString(
      telegramUser.language_code,
      20
    ),

    isPremium:
      telegramUser.is_premium === true,

    balance: DEFAULT_BALANCE,

    lockedBalance: 0,

    totalEarned: 0,

    totalMined: 0,

    totalTaskEarned: 0,

    miningRounds: DEFAULT_MINING_ROUNDS,

    tasksCompleted: DEFAULT_TASKS_COMPLETED,

    referralsCount: 0,

    qualifiedReferrals: 0,

    referralCode:
      createReferralCode(
        telegramId
      ),

    referredBy: null,

    referralQualified: false,

    walletAddress: null,

    walletConnected: false,

    lastMiningAt: 0,

    miningRoundsInWindow: 0,

    miningWindowStartedAt: 0,

    lastTaskAt: 0,

    lastActiveAt: timestamp,

    lastLoginAt: timestamp,

    createdAt: timestamp,

    updatedAt: timestamp,

    isBanned: false,

    banReason: '',

    role: 'user',

    nonce: null,

    adSessions: {},

    taskHistory: [],

    miningHistory: [],

    rewardHistory: []
  };
}

/* =========================================================
   DATABASE HELPERS
========================================================= */

/*
 * db باید توسط server.js ساخته شود.
 *
 * انتظار:
 *
 * db = {
 *   users: {},
 *   ...
 * }
 */

function ensureUsersStore(db) {
  if (!db || typeof db !== 'object') {
    throw new Error(
      'Database object is required'
    );
  }

  if (
    !db.users ||
    typeof db.users !== 'object' ||
    Array.isArray(db.users)
  ) {
    db.users = {};
  }

  return db.users;
}

/* =========================================================
   GET USER
========================================================= */

function getUser(db, telegramId) {
  const users =
    ensureUsersStore(db);

  const id =
    normalizeTelegramId(
      telegramId
    );

  if (!id) {
    return null;
  }

  return users[id] || null;
}

/* =========================================================
   REQUIRE USER
========================================================= */

function requireUser(
  db,
  telegramId
) {
  const user =
    getUser(
      db,
      telegramId
    );

  if (!user) {
    throw new Error(
      'User not found'
    );
  }

  return user;
}

/* =========================================================
   CREATE USER
========================================================= */

function createUser(
  db,
  telegramUser
) {
  const users =
    ensureUsersStore(db);

  const id =
    normalizeTelegramId(
      telegramUser?.id
    );

  if (!id) {
    throw new Error(
      'Telegram user ID is required'
    );
  }

  if (users[id]) {
    return {
      user: users[id],
      created: false
    };
  }

  const user =
    createUserData(
      telegramUser
    );

  users[id] = user;

  return {
    user,
    created: true
  };
}

/* =========================================================
   GET OR CREATE
========================================================= */

function getOrCreateUser(
  db,
  telegramUser
) {
  const id =
    normalizeTelegramId(
      telegramUser?.id
    );

  if (!id) {
    throw new Error(
      'Telegram user ID is required'
    );
  }

  const existing =
    getUser(
      db,
      id
    );

  if (existing) {
    updateTelegramProfile(
      existing,
      telegramUser
    );

    return {
      user: existing,
      created: false
    };
  }

  return createUser(
    db,
    telegramUser
  );
}

/* =========================================================
   UPDATE TELEGRAM PROFILE
========================================================= */

function updateTelegramProfile(
  user,
  telegramUser = {}
) {
  if (!user) {
    throw new Error(
      'User is required'
    );
  }

  if (
    telegramUser.username !== undefined
  ) {
    user.username =
      cleanString(
        telegramUser.username,
        MAX_USERNAME_LENGTH
      );
  }

  if (
    telegramUser.first_name !== undefined
  ) {
    user.firstName =
      cleanString(
        telegramUser.first_name,
        MAX_FIRST_NAME_LENGTH
      );
  }

  if (
    telegramUser.last_name !== undefined
  ) {
    user.lastName =
      cleanString(
        telegramUser.last_name,
        MAX_LAST_NAME_LENGTH
      );
  }

  if (
    telegramUser.language_code !== undefined
  ) {
    user.languageCode =
      cleanString(
        telegramUser.language_code,
        20
      );
  }

  if (
    telegramUser.is_premium !== undefined
  ) {
    user.isPremium =
      telegramUser.is_premium === true;
  }

  user.lastActiveAt = now();

  user.lastLoginAt = now();

  user.updatedAt = now();

  return user;
}

/* =========================================================
   UPDATE USER
========================================================= */

function updateUser(
  db,
  telegramId,
  changes
) {
  const user =
    requireUser(
      db,
      telegramId
    );

  if (
    !changes ||
    typeof changes !== 'object'
  ) {
    throw new Error(
      'Invalid user changes'
    );
  }

  const allowedFields = [
    'username',
    'firstName',
    'lastName',
    'languageCode',
    'isPremium',
    'walletAddress',
    'walletConnected',
    'referredBy',
    'referralQualified',
    'role',
    'isBanned',
    'banReason'
  ];

  for (
    const field of allowedFields
  ) {
    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        field
      )
    ) {
      user[field] =
        changes[field];
    }
  }

  user.updatedAt = now();

  return user;
}

/* =========================================================
   ACTIVE USER
========================================================= */

function touchUser(
  db,
  telegramId
) {
  const user =
    requireUser(
      db,
      telegramId
    );

  user.lastActiveAt = now();

  user.updatedAt = now();

  return user;
}

/* =========================================================
   BALANCE
========================================================= */

function getBalance(
  db,
  telegramId
) {
  const user =
    requireUser(
      db,
      telegramId
    );

  return Number(
    user.balance || 0
  );
}

/* =========================================================
   ADD BALANCE
========================================================= */

function addBalance(
  db,
  telegramId,
  amount,
  reason = 'reward'
) {
  const user =
    requireUser(
      db,
      telegramId
    );

  const value =
    Number(amount);

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error(
      'Invalid reward amount'
    );
  }

  user.balance =
    Number(user.balance || 0) +
    value;

  user.totalEarned =
    Number(user.totalEarned || 0) +
    value;

  user.rewardHistory.push({
    id: crypto
      .randomBytes(12)
      .toString('hex'),

    amount: value,

    reason: cleanString(
      reason,
      100
    ),

    createdAt: now()
  });

  if (
    user.rewardHistory.length > 100
  ) {
    user.rewardHistory =
      user.rewardHistory.slice(-100);
  }

  user.updatedAt = now();

  return user;
}

/* =========================================================
   LOCK BALANCE
========================================================= */

function lockBalance(
  db,
  telegramId,
  amount
) {
  const user =
    requireUser(
      db,
      telegramId
    );

  const value =
    Number(amount);

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error(
      'Invalid lock amount'
    );
  }

  if (
    Number(user.balance || 0) <
    value
  ) {
    throw new Error(
      'Insufficient balance'
    );
  }

  user.balance =
    Number(user.balance || 0) -
    value;

  user.lockedBalance =
    Number(user.lockedBalance || 0) +
    value;

  user.updatedAt = now();

  return user;
}

/* =========================================================
   UNLOCK BALANCE
========================================================= */

function unlockBalance(
  db,
  telegramId,
  amount
) {
  const user =
    requireUser(
      db,
      telegramId
    );

  const value =
    Number(amount);

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error(
      'Invalid unlock amount'
    );
  }

  if (
    Number(user.lockedBalance || 0) <
    value
  ) {
    throw new Error(
      'Insufficient locked balance'
    );
  }

  user.lockedBalance =
    Number(user.lockedBalance || 0) -
    value;

  user.balance =
    Number(user.balance || 0) +
    value;

  user.updatedAt = now();

  return user;
}

/* =========================================================
   MINING STATISTICS
========================================================= */

function recordMiningReward(
  db,
  telegramId,
  amount,
  metadata = {}
) {
  const user =
    requireUser(
      db,
      telegramId
    );

  const value =
    Number(amount);

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error(
      'Invalid mining reward'
    );
  }

  user.totalMined =
    Number(user.totalMined || 0) +
    value;

  user.miningRounds =
    Number(user.miningRounds || 0) +
    1;

  user.lastMiningAt = now();

  user.miningHistory.push({
    id: crypto
      .randomBytes(12)
      .toString('hex'),

    amount: value,

    durationSeconds:
      Number(
        metadata.durationSeconds || 0
      ),

    nonce:
      metadata.nonce || null,

    createdAt: now()
  });

  if (
    user.miningHistory.length > 100
  ) {
    user.miningHistory =
      user.miningHistory.slice(-100);
  }

  user.updatedAt = now();

  return user;
}

/* =========================================================
   TASK STATISTICS
========================================================= */

function recordTaskReward(
  db,
  telegramId,
  amount,
  taskType
) {
  const user =
    requireUser(
      db,
      telegramId
    );

  const value =
    Number(amount);

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error(
      'Invalid task reward'
    );
  }

  user.totalTaskEarned =
    Number(user.totalTaskEarned || 0) +
    value;

  user.tasksCompleted =
    Number(user.tasksCompleted || 0) +
    1;

  user.lastTaskAt = now();

  user.taskHistory.push({
    id: crypto
      .randomBytes(12)
      .toString('hex'),

    type: cleanString(
      taskType,
      100
    ),

    amount: value,

    createdAt: now()
  });

  if (
    user.taskHistory.length > 100
  ) {
    user.taskHistory =
      user.taskHistory.slice(-100);
  }

  user.updatedAt = now();

  return user;
}

/* =========================================================
   REFERRAL
========================================================= */

function setReferrer(
  db,
  telegramId,
  referrerId
) {
  const user =
    requireUser(
      db,
      telegramId
    );

  const referrer =
    getUser(
      db,
      referrerId
    );

  if (!referrer) {
    throw new Error(
      'Referrer not found'
    );
  }

  const target =
    normalizeTelegramId(
      referrerId
    );

  if (
    user.telegramId === target
  ) {
    throw new Error(
      'Self referral is not allowed'
    );
  }

  /*
   * Referrer را فقط یک‌بار می‌توان تعیین کرد.
   */
  if (user.referredBy) {
    return user;
  }

  user.referredBy = target;

  user.updatedAt = now();

  referrer.referralsCount =
    Number(
      referrer.referralsCount || 0
    ) + 1;

  referrer.updatedAt = now();

  return user;
}

/* =========================================================
   WALLET
========================================================= */

function setWalletAddress(
  db,
  telegramId,
  address
) {
  const user =
    requireUser(
      db,
      telegramId
    );

  const wallet =
    cleanString(
      address,
      128
    );

  if (!wallet) {
    throw new Error(
      'Wallet address is required'
    );
  }

  user.walletAddress =
    wallet;

  user.walletConnected = true;

  user.updatedAt = now();

  return user;
}

/* =========================================================
   BAN / UNBAN
========================================================= */

function banUser(
  db,
  telegramId,
  reason = ''
) {
  const user =
    requireUser(
      db,
      telegramId
    );

  user.isBanned = true;

  user.banReason =
    cleanString(
      reason,
      500
    );

  user.updatedAt = now();

  return user;
}

function unbanUser(
  db,
  telegramId
) {
  const user =
    requireUser(
      db,
      telegramId
    );

  user.isBanned = false;

  user.banReason = '';

  user.updatedAt = now();

  return user;
}

/* =========================================================
   LIST USERS
========================================================= */

function listUsers(
  db,
  options = {}
) {
  const users =
    ensureUsersStore(db);

  let result =
    Object.values(users);

  if (
    options.activeSince !== undefined
  ) {
    const since =
      Number(
        options.activeSince
      );

    result =
      result.filter(
        (user) =>
          Number(
            user.lastActiveAt || 0
          ) >= since
      );
  }

  if (
    options.banned !== undefined
  ) {
    result =
      result.filter(
        (user) =>
          Boolean(
            user.isBanned
          ) ===
          Boolean(options.banned)
      );
  }

  result.sort(
    (a, b) =>
      Number(
        b.lastActiveAt || 0
      ) -
      Number(
        a.lastActiveAt || 0
      )
  );

  const limit =
    Number(
      options.limit || 0
    );

  if (
    Number.isInteger(limit) &&
    limit > 0
  ) {
    return result.slice(
      0,
      Math.min(limit, 1000)
    );
  }

  return result;
}

/* =========================================================
   USER COUNT
========================================================= */

function countUsers(db) {
  return Object.keys(
    ensureUsersStore(db)
  ).length;
}

/* =========================================================
   PUBLIC USER VIEW
========================================================= */

function publicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,

    telegramId:
      user.telegramId,

    username:
      user.username,

    firstName:
      user.firstName,

    lastName:
      user.lastName,

    balance:
      Number(user.balance || 0),

    lockedBalance:
      Number(user.lockedBalance || 0),

    totalEarned:
      Number(user.totalEarned || 0),

    totalMined:
      Number(user.totalMined || 0),

    totalTaskEarned:
      Number(user.totalTaskEarned || 0),

    miningRounds:
      Number(user.miningRounds || 0),

    tasksCompleted:
      Number(user.tasksCompleted || 0),

    referralsCount:
      Number(user.referralsCount || 0),

    qualifiedReferrals:
      Number(
        user.qualifiedReferrals || 0
      ),

    referralCode:
      user.referralCode,

    walletAddress:
      user.walletAddress,

    walletConnected:
      Boolean(user.walletConnected),

    lastActiveAt:
      Number(user.lastActiveAt || 0),

    createdAt:
      Number(user.createdAt || 0),

    role:
      user.role || 'user',

    isBanned:
      Boolean(user.isBanned)
  };
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  createUserData,

  getUser,

  requireUser,

  createUser,

  getOrCreateUser,

  updateTelegramProfile,

  updateUser,

  touchUser,

  getBalance,

  addBalance,

  lockBalance,

  unlockBalance,

  recordMiningReward,

  recordTaskReward,

  setReferrer,

  setWalletAddress,

  banUser,

  unbanUser,

  listUsers,

  countUsers,

  publicUser
};
