'use strict';

/*
  ZAKSH Mining
  Statistics module

  Responsibilities:
  - Global statistics
  - Daily / weekly / monthly statistics
  - Mining statistics
  - Task statistics
  - Referral statistics
  - Wallet statistics
  - User activity statistics
  - Top users
*/

function now() {
  return Date.now();
}

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

function ensureDb(db) {
  if (!db || typeof db !== 'object') {
    throw new Error('DATABASE_REQUIRED');
  }

  if (!Array.isArray(db.users)) {
    db.users = [];
  }

  return db;
}

function userId(user) {
  return String(
    user.telegramId ??
    user.id ??
    ''
  );
}

function getBalance(user) {
  return Number(user.balance || 0);
}

function getTaskCount(user) {
  if (
    !user.tasks ||
    !user.tasks.completedAt
  ) {
    return 0;
  }

  return Object.keys(
    user.tasks.completedAt
  ).length;
}

function getMiningCount(user) {
  if (
    !user.mining ||
    !Array.isArray(user.mining.sessions)
  ) {
    return 0;
  }

  return user.mining.sessions.length;
}

function getReferralCount(user) {
  if (
    !user.referrals ||
    !Array.isArray(user.referrals.list)
  ) {
    return 0;
  }

  return user.referrals.list.length;
}

function getQualifiedReferralCount(user) {
  if (
    !user.referrals ||
    !Array.isArray(user.referrals.qualified)
  ) {
    return 0;
  }

  return user.referrals.qualified.length;
}

/* ---------------------------------------------------------
   GLOBAL STATISTICS
--------------------------------------------------------- */

function getGlobalStatistics(db) {
  ensureDb(db);

  let totalBalance = 0;
  let totalEarned = 0;
  let totalWallets = 0;
  let totalTasks = 0;
  let totalMining = 0;
  let totalReferrals = 0;
  let totalQualifiedReferrals = 0;
  let totalAds = 0;

  for (const user of db.users) {
    totalBalance += getBalance(user);

    totalEarned += Number(
      user.totalEarned || 0
    );

    totalTasks += getTaskCount(user);

    totalMining += getMiningCount(user);

    totalReferrals += getReferralCount(user);

    totalQualifiedReferrals +=
      getQualifiedReferralCount(user);

    if (
      user.wallet &&
      user.wallet.address
    ) {
      totalWallets++;
    }

    if (
      user.tasks &&
      user.tasks.completedAt &&
      user.tasks.completedAt.watch_ad
    ) {
      totalAds++;
    }
  }

  return {
    totalUsers: db.users.length,

    totalBalance,

    totalEarned,

    totalWallets,

    totalTasksCompleted: totalTasks,

    totalMiningRounds: totalMining,

    totalReferrals,

    totalQualifiedReferrals,

    totalAdsViewed: totalAds,

    generatedAt: now()
  };
}

/* ---------------------------------------------------------
   TIME RANGE STATISTICS
--------------------------------------------------------- */

function getPeriodStatistics(db, period) {
  ensureDb(db);

  const current = now();

  let duration;

  switch (period) {
    case 'day':
    case 'today':
      duration = DAY;
      break;

    case 'week':
      duration = WEEK;
      break;

    case 'month':
      duration = MONTH;
      break;

    default:
      throw new Error(
        'INVALID_STATISTICS_PERIOD'
      );
  }

  const start = current - duration;

  let newUsers = 0;
  let activeUsers = 0;
  let wallets = 0;
  let tasks = 0;
  let mining = 0;
  let ads = 0;
  let referrals = 0;
  let qualifiedReferrals = 0;
  let earned = 0;

  for (const user of db.users) {
    const createdAt =
      Number(user.createdAt || 0);

    const activeAt =
      Number(user.lastActiveAt || 0);

    if (createdAt >= start) {
      newUsers++;
    }

    if (activeAt >= start) {
      activeUsers++;
    }

    if (
      user.wallet &&
      Number(user.wallet.updatedAt || 0) >= start
    ) {
      wallets++;
    }

    if (
      user.tasks &&
      user.tasks.completedAt
    ) {
      for (const timestamp of Object.values(
        user.tasks.completedAt
      )) {
        if (Number(timestamp) >= start) {
          tasks++;

          /*
            Watch-ad completion is counted
            as an ad view.
          */
          const keyFound =
            Object.entries(
              user.tasks.completedAt
            ).find(
              ([, value]) =>
                Number(value) === Number(timestamp)
            );

          if (
            keyFound &&
            keyFound[0] === 'watch_ad'
          ) {
            ads++;
          }
        }
      }
    }

    if (
      user.mining &&
      Array.isArray(user.mining.sessions)
    ) {
      for (
        const session of user.mining.sessions
      ) {
        if (
          Number(session.completedAt || 0) >=
          start
        ) {
          mining++;

          earned += Number(
            session.reward || 0
          );
        }
      }
    }

    if (
      user.referrals &&
      Array.isArray(user.referrals.list)
    ) {
      for (
        const referralId of user.referrals.list
      ) {
        const referred =
          db.users.find(
            candidate =>
              userId(candidate) ===
              String(referralId)
          );

        if (
          referred &&
          Number(referred.createdAt || 0) >=
          start
        ) {
          referrals++;
        }
      }
    }

    if (
      user.referrals &&
      Array.isArray(user.referrals.qualified)
    ) {
      /*
        Qualification timestamps may not exist
        in older database records, therefore
        qualified count is included conservatively.
      */
      qualifiedReferrals +=
        user.referrals.qualified.length;
    }
  }

  return {
    period,
    start,
    end: current,

    newUsers,
    activeUsers,

    wallets,

    tasksCompleted: tasks,

    miningRounds: mining,

    adsViewed: ads,

    referrals,

    qualifiedReferrals,

    earned
  };
}

/* ---------------------------------------------------------
   TODAY / WEEK / MONTH
--------------------------------------------------------- */

function getTimeStatistics(db) {
  ensureDb(db);

  return {
    today: getPeriodStatistics(
      db,
      'today'
    ),

    week: getPeriodStatistics(
      db,
      'week'
    ),

    month: getPeriodStatistics(
      db,
      'month'
    ),

    generatedAt: now()
  };
}

/* ---------------------------------------------------------
   MINING STATISTICS
--------------------------------------------------------- */

function getMiningStatistics(db) {
  ensureDb(db);

  const current = now();

  let todayRounds = 0;
  let weekRounds = 0;
  let monthRounds = 0;

  let todayEarned = 0;
  let weekEarned = 0;
  let monthEarned = 0;

  let activeMining = 0;

  for (const user of db.users) {
    if (
      user.mining &&
      user.mining.active
    ) {
      activeMining++;
    }

    if (
      !user.mining ||
      !Array.isArray(user.mining.sessions)
    ) {
      continue;
    }

    for (
      const session of user.mining.sessions
    ) {
      const completed =
        Number(session.completedAt || 0);

      const reward =
        Number(session.reward || 0);

      if (
        completed >= current - DAY
      ) {
        todayRounds++;
        todayEarned += reward;
      }

      if (
        completed >= current - WEEK
      ) {
        weekRounds++;
        weekEarned += reward;
      }

      if (
        completed >= current - MONTH
      ) {
        monthRounds++;
        monthEarned += reward;
      }
    }
  }

  return {
    today: {
      rounds: todayRounds,
      earned: todayEarned
    },

    week: {
      rounds: weekRounds,
      earned: weekEarned
    },

    month: {
      rounds: monthRounds,
      earned: monthEarned
    },

    activeMining,

    generatedAt: current
  };
}

/* ---------------------------------------------------------
   TASK STATISTICS
--------------------------------------------------------- */

function getTaskStatistics(db) {
  ensureDb(db);

  const result = {
    join_channel: 0,
    react_channel: 0,
    watch_ad: 0,
    invite_friends: 0,

    total: 0
  };

  for (const user of db.users) {
    if (
      !user.tasks ||
      !user.tasks.completedAt
    ) {
      continue;
    }

    for (
      const taskId of Object.keys(
        user.tasks.completedAt
      )
    ) {
      if (
        Object.prototype.hasOwnProperty.call(
          result,
          taskId
        )
      ) {
        result[taskId]++;
        result.total++;
      }
    }
  }

  return {
    tasks: result,
    generatedAt: now()
  };
}

/* ---------------------------------------------------------
   REFERRAL STATISTICS
--------------------------------------------------------- */

function getReferralStatistics(db) {
  ensureDb(db);

  let total = 0;
  let qualified = 0;
  let rewarded = 0;

  for (const user of db.users) {
    if (!user.referrals) {
      continue;
    }

    if (
      Array.isArray(user.referrals.list)
    ) {
      total +=
        user.referrals.list.length;
    }

    if (
      Array.isArray(
        user.referrals.qualified
      )
    ) {
      qualified +=
        user.referrals.qualified.length;
    }

    if (
      Array.isArray(
        user.referrals.rewarded
      )
    ) {
      rewarded +=
        user.referrals.rewarded.length;
    }
  }

  return {
    total,
    qualified,
    rewarded,

    conversionRate:
      total > 0
        ? Number(
            (
              qualified /
              total *
              100
            ).toFixed(2)
          )
        : 0,

    generatedAt: now()
  };
}

/* ---------------------------------------------------------
   WALLET STATISTICS
--------------------------------------------------------- */

function getWalletStatistics(db) {
  ensureDb(db);

  let connected = 0;
  let notConnected = 0;
  let totalBalance = 0;

  for (const user of db.users) {
    totalBalance += getBalance(user);

    if (
      user.wallet &&
      user.wallet.address
    ) {
      connected++;
    } else {
      notConnected++;
    }
  }

  return {
    connected,
    notConnected,

    totalUsers: db.users.length,

    connectionRate:
      db.users.length > 0
        ? Number(
            (
              connected /
              db.users.length *
              100
            ).toFixed(2)
          )
        : 0,

    totalBalance,

    generatedAt: now()
  };
}

/* ---------------------------------------------------------
   USER ACTIVITY
--------------------------------------------------------- */

function getActivityStatistics(db) {
  ensureDb(db);

  const current = now();

  let active24h = 0;
  let active7d = 0;
  let active30d = 0;
  let inactive30d = 0;

  for (const user of db.users) {
    const active =
      Number(user.lastActiveAt || 0);

    if (
      active >= current - DAY
    ) {
      active24h++;
    }

    if (
      active >= current - WEEK
    ) {
      active7d++;
    }

    if (
      active >= current - MONTH
    ) {
      active30d++;
    } else {
      inactive30d++;
    }
  }

  return {
    active24h,
    active7d,
    active30d,
    inactive30d,

    generatedAt: current
  };
}

/* ---------------------------------------------------------
   TOP USERS
--------------------------------------------------------- */

function getTopUsers(
  db,
  limit = 10
) {
  ensureDb(db);

  const safeLimit = Math.min(
    Math.max(Number(limit || 10), 1),
    100
  );

  const users = db.users
    .map(user => ({
      id: userId(user),

      username:
        user.username || null,

      firstName:
        user.firstName || null,

      balance:
        getBalance(user),

      tasks:
        getTaskCount(user),

      mining:
        getMiningCount(user),

      referrals:
        getReferralCount(user),

      qualifiedReferrals:
        getQualifiedReferralCount(user),

      lastActiveAt:
        Number(user.lastActiveAt || 0)
    }))
    .sort(
      (a, b) =>
        b.balance - a.balance
    )
    .slice(
      0,
      safeLimit
    );

  return users;
}

/* ---------------------------------------------------------
   COMPLETE ADMIN STATISTICS
--------------------------------------------------------- */

function getCompleteStatistics(db) {
  ensureDb(db);

  return {
    global:
      getGlobalStatistics(db),

    periods:
      getTimeStatistics(db),

    mining:
      getMiningStatistics(db),

    tasks:
      getTaskStatistics(db),

    referrals:
      getReferralStatistics(db),

    wallets:
      getWalletStatistics(db),

    activity:
      getActivityStatistics(db),

    topUsers:
      getTopUsers(db, 10),

    generatedAt:
      now()
  };
}

module.exports = {
  getGlobalStatistics,
  getPeriodStatistics,
  getTimeStatistics,

  getMiningStatistics,
  getTaskStatistics,

  getReferralStatistics,
  getWalletStatistics,

  getActivityStatistics,

  getTopUsers,

  getCompleteStatistics
};
