// mining.js
// ZAKSH Mining Module

const crypto = require("crypto");

const MINING_DURATION_MS = 40 * 1000;       // 40 seconds
const MINING_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_MINING_PER_WINDOW = 2;

const MIN_REWARD = 60;
const MAX_REWARD = 160;

/*
  db structure expected:

  db.users[userId] = {
    id,
    balance,
    mining: {
      sessions: [],
      active: null
    }
  }
*/

function ensureMiningState(user) {
  if (!user.mining || typeof user.mining !== "object") {
    user.mining = {};
  }

  if (!Array.isArray(user.mining.sessions)) {
    user.mining.sessions = [];
  }

  if (!user.mining.active) {
    user.mining.active = null;
  }
}

function now() {
  return Date.now();
}

function cleanupSessions(user) {
  ensureMiningState(user);

  const cutoff = now() - MINING_WINDOW_MS;

  user.mining.sessions = user.mining.sessions.filter((session) => {
    return Number(session.completedAt || 0) >= cutoff;
  });
}

function getMiningCount(user) {
  cleanupSessions(user);
  return user.mining.sessions.length;
}

function canStartMining(user) {
  cleanupSessions(user);

  if (user.mining.active) {
    return {
      ok: false,
      code: "MINING_ALREADY_ACTIVE",
      message: "A mining session is already active."
    };
  }

  if (user.mining.sessions.length >= MAX_MINING_PER_WINDOW) {
    const oldest = user.mining.sessions
      .sort((a, b) => Number(a.completedAt) - Number(b.completedAt))[0];

    const nextAvailable =
      Number(oldest.completedAt) + MINING_WINDOW_MS;

    return {
      ok: false,
      code: "MINING_LIMIT",
      message: "Mining limit reached.",
      nextAvailable,
      remainingMs: Math.max(0, nextAvailable - now())
    };
  }

  return {
    ok: true,
    code: "OK"
  };
}

function startMining(user) {
  ensureMiningState(user);
  cleanupSessions(user);

  const permission = canStartMining(user);

  if (!permission.ok) {
    return permission;
  }

  const startedAt = now();

  const sessionId = crypto.randomBytes(24).toString("hex");

  const session = {
    id: sessionId,
    startedAt,
    expiresAt: startedAt + MINING_DURATION_MS,
    completedAt: null,
    reward: null,
    claimed: false
  };

  user.mining.active = session;

  return {
    ok: true,
    sessionId,
    startedAt,
    expiresAt: session.expiresAt,
    durationMs: MINING_DURATION_MS,
    miningCount: user.mining.sessions.length
  };
}

function generateReward() {
  return (
    Math.floor(
      Math.random() * (MAX_REWARD - MIN_REWARD + 1)
    ) + MIN_REWARD
  );
}

function claimMining(user, sessionId) {
  ensureMiningState(user);
  cleanupSessions(user);

  const active = user.mining.active;

  if (!active) {
    return {
      ok: false,
      code: "NO_ACTIVE_MINING",
      message: "No active mining session."
    };
  }

  if (active.id !== String(sessionId)) {
    return {
      ok: false,
      code: "INVALID_SESSION",
      message: "Invalid mining session."
    };
  }

  if (active.claimed) {
    return {
      ok: false,
      code: "ALREADY_CLAIMED",
      message: "Mining reward already claimed."
    };
  }

  const currentTime = now();

  if (currentTime < Number(active.expiresAt)) {
    return {
      ok: false,
      code: "MINING_NOT_FINISHED",
      message: "Mining session has not finished yet.",
      remainingMs: Number(active.expiresAt) - currentTime
    };
  }

  const reward = generateReward();

  active.completedAt = currentTime;
  active.reward = reward;
  active.claimed = true;

  user.balance = Number(user.balance || 0) + reward;

  user.mining.sessions.push({
    id: active.id,
    startedAt: active.startedAt,
    completedAt: active.completedAt,
    reward
  });

  user.mining.active = null;

  return {
    ok: true,
    reward,
    balance: user.balance,
    miningCount: user.mining.sessions.length,
    remainingMs:
      user.mining.sessions.length >= MAX_MINING_PER_WINDOW
        ? getNextMiningTime(user)
        : 0
  };
}

function getNextMiningTime(user) {
  ensureMiningState(user);
  cleanupSessions(user);

  if (user.mining.sessions.length < MAX_MINING_PER_WINDOW) {
    return 0;
  }

  const oldest = user.mining.sessions
    .slice()
    .sort((a, b) => Number(a.completedAt) - Number(b.completedAt))[0];

  return Math.max(
    0,
    Number(oldest.completedAt) + MINING_WINDOW_MS - now()
  );
}

function getMiningStatus(user) {
  ensureMiningState(user);
  cleanupSessions(user);

  const active = user.mining.active;

  if (active) {
    const remainingMs = Math.max(
      0,
      Number(active.expiresAt) - now()
    );

    return {
      active: true,
      sessionId: active.id,
      startedAt: active.startedAt,
      expiresAt: active.expiresAt,
      remainingMs,
      finished: remainingMs <= 0,
      count: user.mining.sessions.length,
      max: MAX_MINING_PER_WINDOW
    };
  }

  const remainingMs = getNextMiningTime(user);

  return {
    active: false,
    sessionId: null,
    startedAt: null,
    expiresAt: null,
    remainingMs,
    finished: false,
    count: user.mining.sessions.length,
    max: MAX_MINING_PER_WINDOW,
    canStart: remainingMs <= 0
  };
}

function resetActiveMining(user) {
  ensureMiningState(user);

  if (!user.mining.active) {
    return false;
  }

  user.mining.active = null;
  return true;
}

function getMiningStatistics(user) {
  ensureMiningState(user);
  cleanupSessions(user);

  const totalRounds = user.mining.sessions.length;

  const totalEarned = user.mining.sessions.reduce(
    (sum, session) => sum + Number(session.reward || 0),
    0
  );

  return {
    totalRounds,
    totalEarned,
    active: Boolean(user.mining.active),
    remainingMs: getNextMiningTime(user)
  };
}

module.exports = {
  MINING_DURATION_MS,
  MINING_WINDOW_MS,
  MAX_MINING_PER_WINDOW,
  MIN_REWARD,
  MAX_REWARD,

  ensureMiningState,
  cleanupSessions,
  canStartMining,
  startMining,
  claimMining,
  getMiningStatus,
  getMiningCount,
  getNextMiningTime,
  resetActiveMining,
  getMiningStatistics
};
