// admin.js
'use strict';

/*
  ZAKSH Mining
  Admin / Owner management module

  Responsibilities:
  - Owner authorization
  - Admin authorization
  - Exactly one active admin
  - User management
  - User details
  - Admin promotion / demotion
  - Referral qualification
  - Admin logs
  - Dashboard summary
  - Telegram webhook management
*/

const https = require('https');
const crypto = require('crypto');

function now() {
  return Date.now();
}

function ensureDb(db) {
  if (!db || typeof db !== 'object') {
    throw new Error('DATABASE_REQUIRED');
  }

  if (!Array.isArray(db.users)) {
    db.users = [];
  }

  if (!Array.isArray(db.logs)) {
    db.logs = [];
  }

  return db;
}

function getUserId(user) {
  if (!user) return null;

  return String(
    user.telegramId ??
    user.id ??
    user.userId ??
    ''
  );
}

/* ---------------------------------------------------------
   AUTHORIZATION
--------------------------------------------------------- */

function getOwnerId(config) {
  if (!config) return '';

  return String(
    config.OWNER_ID ??
    config.OWNER_TELEGRAM_ID ??
    ''
  );
}

function isOwner(user, config) {
  const userId = getUserId(user);
  const ownerId = getOwnerId(config);

  if (!userId || !ownerId) return false;

  return userId === ownerId;
}

function isAdmin(user, config) {
  if (!user) return false;

  if (isOwner(user, config)) {
    return true;
  }

  return user.role === 'admin';
}

function requireOwner(user, config) {
  if (!isOwner(user, config)) {
    const error = new Error('OWNER_ACCESS_REQUIRED');
    error.code = 'OWNER_ACCESS_REQUIRED';
    throw error;
  }

  return true;
}

function requireAdmin(user, config) {
  if (!isAdmin(user, config)) {
    const error = new Error('ADMIN_ACCESS_REQUIRED');
    error.code = 'ADMIN_ACCESS_REQUIRED';
    throw error;
  }

  return true;
}

/* ---------------------------------------------------------
   SAFE USER OBJECT
--------------------------------------------------------- */

function sanitizeUser(user) {
  if (!user) return null;

  return {
    id: user.id ?? null,
    telegramId: user.telegramId ?? user.id ?? null,
    username: user.username ?? null,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,

    role: user.role ?? 'user',

    balance: Number(user.balance || 0),

    createdAt: user.createdAt ?? null,
    updatedAt: user.updatedAt ?? null,
    lastActiveAt: user.lastActiveAt ?? null,

    wallet: user.wallet
      ? {
          address: user.wallet.address ?? null,
          updatedAt: user.wallet.updatedAt ?? null
        }
      : null,

    tasks: user.tasks
      ? {
          completedAt: user.tasks.completedAt ?? {},
          completedCount: Object.keys(
            user.tasks.completedAt ?? {}
          ).length
        }
      : {
          completedAt: {},
          completedCount: 0
        },

    mining: user.mining
      ? {
          active: Boolean(user.mining.active),
          sessions: Array.isArray(user.mining.sessions)
            ? user.mining.sessions.length
            : 0
        }
      : {
          active: false,
          sessions: 0
        },

    referrals: user.referrals
      ? {
          total: Array.isArray(user.referrals.list)
            ? user.referrals.list.length
            : 0,

          qualified: Array.isArray(user.referrals.qualified)
            ? user.referrals.qualified.length
            : 0,

          rewarded: Array.isArray(user.referrals.rewarded)
            ? user.referrals.rewarded.length
            : 0
        }
      : {
          total: 0,
          qualified: 0,
          rewarded: 0
        }
  };
}

/* ---------------------------------------------------------
   FIND USERS
--------------------------------------------------------- */

function findUser(db, userId) {
  ensureDb(db);

  const id = String(userId);

  return db.users.find(user => {
    return String(
      user.telegramId ??
      user.id ??
      ''
    ) === id;
  }) || null;
}

function findUserByUsername(db, username) {
  ensureDb(db);

  if (!username) return null;

  const normalized = String(username)
    .replace(/^@/, '')
    .toLowerCase();

  return db.users.find(user => {
    return String(user.username || '')
      .replace(/^@/, '')
      .toLowerCase() === normalized;
  }) || null;
}

/* ---------------------------------------------------------
   USER LIST
--------------------------------------------------------- */

function listUsers(db, options = {}) {
  ensureDb(db);

  const limit = Math.min(
    Math.max(Number(options.limit || 100), 1),
    500
  );

  const offset = Math.max(
    Number(options.offset || 0),
    0
  );

  const search = String(
    options.search || ''
  ).trim().toLowerCase();

  let users = db.users.slice();

  if (search) {
    users = users.filter(user => {
      const id = String(
        user.telegramId ??
        user.id ??
        ''
      ).toLowerCase();

      const username = String(
        user.username || ''
      ).toLowerCase();

      const firstName = String(
        user.firstName || ''
      ).toLowerCase();

      const lastName = String(
        user.lastName || ''
      ).toLowerCase();

      return (
        id.includes(search) ||
        username.includes(search) ||
        firstName.includes(search) ||
        lastName.includes(search)
      );
    });
  }

  if (options.role) {
    users = users.filter(
      user => (user.role || 'user') === options.role
    );
  }

  if (options.hasWallet === true) {
    users = users.filter(
      user => Boolean(
        user.wallet &&
        user.wallet.address
      )
    );
  }

  if (options.activeWithinMs) {
    const cutoff =
      now() - Number(options.activeWithinMs);

    users = users.filter(user => {
      return Number(user.lastActiveAt || 0) >= cutoff;
    });
  }

  users.sort((a, b) => {
    return Number(b.lastActiveAt || b.createdAt || 0) -
           Number(a.lastActiveAt || a.createdAt || 0);
  });

  const total = users.length;

  const page = users.slice(
    offset,
    offset + limit
  );

  return {
    total,
    offset,
    limit,
    users: page.map(sanitizeUser)
  };
}

/* ---------------------------------------------------------
   USER DETAILS
--------------------------------------------------------- */

function getUserDetails(db, userId) {
  ensureDb(db);

  const user = findUser(db, userId);

  if (!user) {
    const error = new Error('USER_NOT_FOUND');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  return sanitizeUser(user);
}

/* ---------------------------------------------------------
   ADMIN MANAGEMENT
--------------------------------------------------------- */

/*
  Exactly ONE admin is allowed.

  Owner is separate and cannot be removed.

  When a new admin is promoted:
  - current admin is automatically demoted
  - target becomes admin
*/

function getCurrentAdmin(db) {
  ensureDb(db);

  return db.users.find(
    user => user.role === 'admin'
  ) || null;
}

function promoteAdmin(db, actor, targetUserId, config) {
  ensureDb(db);

  requireOwner(actor, config);

  const target = findUser(
    db,
    targetUserId
  );

  if (!target) {
    const error = new Error('TARGET_USER_NOT_FOUND');
    error.code = 'TARGET_USER_NOT_FOUND';
    throw error;
  }

  if (isOwner(target, config)) {
    const error = new Error(
      'OWNER_CANNOT_BE_ADMIN_TARGET'
    );

    error.code = 'OWNER_CANNOT_BE_ADMIN_TARGET';

    throw error;
  }

  const currentAdmin = getCurrentAdmin(db);

  if (
    currentAdmin &&
    String(currentAdmin.id ?? currentAdmin.telegramId) !==
      String(target.id ?? target.telegramId)
  ) {
    currentAdmin.role = 'user';
    currentAdmin.updatedAt = now();
  }

  target.role = 'admin';
  target.updatedAt = now();

  writeLog(
    db,
    actor,
    'PROMOTE_ADMIN',
    target,
    {}
  );

  return {
    success: true,
    admin: sanitizeUser(target),
    previousAdmin: currentAdmin
      ? sanitizeUser(currentAdmin)
      : null
  };
}

function demoteAdmin(db, actor, targetUserId, config) {
  ensureDb(db);

  requireOwner(actor, config);

  const target = findUser(
    db,
    targetUserId
  );

  if (!target) {
    const error = new Error('TARGET_USER_NOT_FOUND');
    error.code = 'TARGET_USER_NOT_FOUND';
    throw error;
  }

  if (isOwner(target, config)) {
    const error = new Error(
      'OWNER_CANNOT_BE_DEMOTED'
    );

    error.code = 'OWNER_CANNOT_BE_DEMOTED';

    throw error;
  }

  target.role = 'user';
  target.updatedAt = now();

  writeLog(
    db,
    actor,
    'DEMOTE_ADMIN',
    target,
    {}
  );

  return {
    success: true,
    user: sanitizeUser(target)
  };
}

function getAdminStatus(db, config) {
  ensureDb(db);

  const currentAdmin = getCurrentAdmin(db);

  return {
    ownerId: getOwnerId(config) || null,

    admin: currentAdmin
      ? sanitizeUser(currentAdmin)
      : null,

    exactlyOneAdmin:
      db.users.filter(
        user => user.role === 'admin'
      ).length === 1
  };
}

/* ---------------------------------------------------------
   DASHBOARD SUMMARY
--------------------------------------------------------- */

function getDashboardSummary(db) {
  ensureDb(db);

  const currentTime = now();

  const users = db.users;

  const active24h = users.filter(user => {
    return Number(user.lastActiveAt || 0) >=
      currentTime - 24 * 60 * 60 * 1000;
  }).length;

  let totalEarned = 0;
  let totalWallets = 0;
  let totalAdsViewed = 0;
  let totalMiningRounds = 0;
  let totalTasksCompleted = 0;
  let totalReferrals = 0;
  let totalQualifiedReferrals = 0;

  for (const user of users) {
    totalEarned += Number(user.totalEarned || 0);

    totalEarned += Number(
      user.balance || 0
    );

    if (
      user.wallet &&
      user.wallet.address
    ) {
      totalWallets++;
    }

    if (
      user.tasks &&
      user.tasks.completedAt
    ) {
      const completed =
        user.tasks.completedAt;

      totalTasksCompleted +=
        Object.keys(completed).length;

      if (
        completed.watch_ad
      ) {
        totalAdsViewed++;
      }
    }

    if (
      user.mining &&
      Array.isArray(user.mining.sessions)
    ) {
      totalMiningRounds +=
        user.mining.sessions.length;
    }

    if (
      user.referrals &&
      Array.isArray(user.referrals.list)
    ) {
      totalReferrals +=
        user.referrals.list.length;
    }

    if (
      user.referrals &&
      Array.isArray(user.referrals.qualified)
    ) {
      totalQualifiedReferrals +=
        user.referrals.qualified.length;
    }
  }

  const admins = users.filter(
    user => user.role === 'admin'
  ).length;

  return {
    totalUsers: users.length,

    activeUsers24h: active24h,

    totalZkoEarned: totalEarned,

    totalWallets,

    lockedZko: totalEarned,

    totalAdsViewed,

    totalMiningRounds,

    totalTasksCompleted,

    totalReferrals,

    totalQualifiedReferrals,

    admins,

    generatedAt: currentTime
  };
}

/* ---------------------------------------------------------
   USER STATISTICS
--------------------------------------------------------- */

function getUserStatistics(db) {
  ensureDb(db);

  const currentTime = now();

  const day =
    24 * 60 * 60 * 1000;

  const week =
    7 * day;

  const month =
    30 * day;

  const result = {
    today: {
      newUsers: 0,
      activeUsers: 0
    },

    week: {
      newUsers: 0,
      activeUsers: 0
    },

    month: {
      newUsers: 0,
      activeUsers: 0
    }
  };

  for (const user of db.users) {
    const created =
      Number(user.createdAt || 0);

    const active =
      Number(user.lastActiveAt || 0);

    if (created >= currentTime - day) {
      result.today.newUsers++;
    }

    if (created >= currentTime - week) {
      result.week.newUsers++;
    }

    if (created >= currentTime - month) {
      result.month.newUsers++;
    }

    if (active >= currentTime - day) {
      result.today.activeUsers++;
    }

    if (active >= currentTime - week) {
      result.week.activeUsers++;
    }

    if (active >= currentTime - month) {
      result.month.activeUsers++;
    }
  }

  return result;
}

/* ---------------------------------------------------------
   LOGGING
--------------------------------------------------------- */

function writeLog(
  db,
  actor,
  action,
  target,
  metadata = {}
) {
  ensureDb(db);

  const actorId =
    actor
      ? getUserId(actor)
      : null;

  const targetId =
    target
      ? getUserId(target)
      : null;

  const log = {
    id:
      crypto.randomBytes(16).toString('hex'),

    timestamp: now(),

    actorId,

    targetId,

    action: String(action || 'UNKNOWN'),

    metadata:
      metadata &&
      typeof metadata === 'object'
        ? metadata
        : {}
  };

  db.logs.push(log);

  /*
    Keep database size under control.
    Latest 10,000 logs are retained.
  */
  if (db.logs.length > 10000) {
    db.logs.splice(
      0,
      db.logs.length - 10000
    );
  }

  return log;
}

function getLogs(db, options = {}) {
  ensureDb(db);

  const limit = Math.min(
    Math.max(Number(options.limit || 100), 1),
    500
  );

  const offset = Math.max(
    Number(options.offset || 0),
    0
  );

  let logs = db.logs.slice();

  if (options.action) {
    logs = logs.filter(
      log => log.action === options.action
    );
  }

  if (options.actorId) {
    logs = logs.filter(
      log =>
        String(log.actorId) ===
        String(options.actorId)
    );
  }

  if (options.targetId) {
    logs = logs.filter(
      log =>
        String(log.targetId) ===
        String(options.targetId)
    );
  }

  logs.sort(
    (a, b) =>
      Number(b.timestamp || 0) -
      Number(a.timestamp || 0)
  );

  const total = logs.length;

  return {
    total,
    offset,
    limit,
    logs: logs.slice(
      offset,
      offset + limit
    )
  };
}

/* ---------------------------------------------------------
   REFERRAL QUALIFICATION
--------------------------------------------------------- */

function qualifyReferral(
  db,
  actor,
  referrerId,
  referredUserId,
  config
) {
  ensureDb(db);

  requireAdmin(actor, config);

  const referrer = findUser(
    db,
    referrerId
  );

  const referred = findUser(
    db,
    referredUserId
  );

  if (!referrer) {
    const error = new Error(
      'REFERRER_NOT_FOUND'
    );

    error.code = 'REFERRER_NOT_FOUND';

    throw error;
  }

  if (!referred) {
    const error = new Error(
      'REFERRED_USER_NOT_FOUND'
    );

    error.code = 'REFERRED_USER_NOT_FOUND';

    throw error;
  }

  if (!referrer.referrals) {
    referrer.referrals = {
      list: [],
      qualified: [],
      rewarded: [],
      code: null,
      referredBy: null
    };
  }

  if (!Array.isArray(referrer.referrals.list)) {
    referrer.referrals.list = [];
  }

  if (!Array.isArray(referrer.referrals.qualified)) {
    referrer.referrals.qualified = [];
  }

  const referredId =
    String(
      referred.telegramId ??
      referred.id
    );

  const exists =
    referrer.referrals.list.some(
      id => String(id) === referredId
    );

  if (!exists) {
    const error = new Error(
      'REFERRAL_RELATION_NOT_FOUND'
    );

    error.code =
      'REFERRAL_RELATION_NOT_FOUND';

    throw error;
  }

  if (
    referrer.referrals.qualified.some(
      id => String(id) === referredId
    )
  ) {
    return {
      success: true,
      alreadyQualified: true,
      referrer: sanitizeUser(referrer),
      referred: sanitizeUser(referred)
    };
  }

  referrer.referrals.qualified.push(
    referredId
  );

  referrer.updatedAt = now();

  writeLog(
    db,
    actor,
    'QUALIFY_REFERRAL',
    referred,
    {
      referrerId:
        String(
          referrer.telegramId ??
          referrer.id
        )
    }
  );

  return {
    success: true,
    alreadyQualified: false,
    referrer: sanitizeUser(referrer),
    referred: sanitizeUser(referred)
  };
}

/* ---------------------------------------------------------
   TELEGRAM BOT API
--------------------------------------------------------- */

function telegramRequest(
  botToken,
  method,
  payload = {}
) {
  return new Promise((resolve, reject) => {
    if (!botToken) {
      reject(
        new Error('BOT_TOKEN_NOT_CONFIGURED')
      );

      return;
    }

    const body =
      JSON.stringify(payload);

    const request = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${botToken}/${method}`,
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',

          'Content-Length':
            Buffer.byteLength(body)
        },

        timeout: 15000
      },

      response => {
        let data = '';

        response.on(
          'data',
          chunk => {
            data += chunk.toString();
          }
        );

        response.on(
          'end',
          () => {
            try {
              const parsed =
                JSON.parse(data);

              if (!parsed.ok) {
                const error =
                  new Error(
                    parsed.description ||
                    'TELEGRAM_API_ERROR'
                  );

                error.telegram =
                  parsed;

                reject(error);

                return;
              }

              resolve(parsed.result);
            } catch (error) {
              reject(error);
            }
          }
        );
      }
    );

    request.on(
      'error',
      reject
    );

    request.on(
      'timeout',
      () => {
        request.destroy(
          new Error(
            'TELEGRAM_API_TIMEOUT'
          )
        );
      }
    );

    request.write(body);

    request.end();
  });
}

/* ---------------------------------------------------------
   WEBHOOK MANAGEMENT
--------------------------------------------------------- */

async function setTelegramWebhook(
  config,
  webhookUrl
) {
  if (!config) {
    throw new Error('CONFIG_REQUIRED');
  }

  const botToken =
    config.BOT_TOKEN;

  if (!botToken) {
    throw new Error(
      'BOT_TOKEN_NOT_CONFIGURED'
    );
  }

  if (!webhookUrl) {
    throw new Error(
      'WEBHOOK_URL_REQUIRED'
    );
  }

  let parsed;

  try {
    parsed =
      new URL(webhookUrl);
  } catch {
    throw new Error(
      'INVALID_WEBHOOK_URL'
    );
  }

  if (
    parsed.protocol !== 'https:'
  ) {
    throw new Error(
      'WEBHOOK_MUST_USE_HTTPS'
    );
  }

  return telegramRequest(
    botToken,
    'setWebhook',
    {
      url: parsed.toString(),

      /*
        Secret token prevents
        unauthorized webhook calls.
      */
      secret_token:
        config.TELEGRAM_WEBHOOK_SECRET ||
        undefined,

      allowed_updates: [
        'message',
        'message_reaction'
      ]
    }
  );
}

async function deleteTelegramWebhook(
  config
) {
  if (!config || !config.BOT_TOKEN) {
    throw new Error(
      'BOT_TOKEN_NOT_CONFIGURED'
    );
  }

  return telegramRequest(
    config.BOT_TOKEN,
    'deleteWebhook',
    {
      drop_pending_updates: false
    }
  );
}

async function getTelegramWebhookInfo(
  config
) {
  if (!config || !config.BOT_TOKEN) {
    throw new Error(
      'BOT_TOKEN_NOT_CONFIGURED'
    );
  }

  return telegramRequest(
    config.BOT_TOKEN,
    'getWebhookInfo',
    {}
  );
}

/* ---------------------------------------------------------
   EXPORTS
--------------------------------------------------------- */

module.exports = {
  isOwner,
  isAdmin,

  requireOwner,
  requireAdmin,

  sanitizeUser,

  findUser,
  findUserByUsername,

  listUsers,
  getUserDetails,

  getCurrentAdmin,
  getAdminStatus,

  promoteAdmin,
  demoteAdmin,

  getDashboardSummary,
  getUserStatistics,

  writeLog,
  getLogs,

  qualifyReferral,

  setTelegramWebhook,
  deleteTelegramWebhook,
  getTelegramWebhookInfo
};
