// tasks.js
// ZAKSH Tasks Module

const crypto = require("crypto");

const TASK_REWARD = 4;
const TASK_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const AD_DURATION_MS = 10 * 1000;

const TASKS = {
  join_channel: {
    id: "join_channel",
    title: "Join Channel",
    type: "join"
  },

  react_channel: {
    id: "react_channel",
    title: "React to Channel",
    type: "reaction"
  },

  watch_ad: {
    id: "watch_ad",
    title: "Watch Ad",
    type: "ad"
  },

  invite_friends: {
    id: "invite_friends",
    title: "Invite Friends",
    type: "invite"
  }
};

function ensureTaskState(user) {
  if (!user.tasks || typeof user.tasks !== "object") {
    user.tasks = {};
  }

  for (const taskId of Object.keys(TASKS)) {
    if (!user.tasks[taskId]) {
      user.tasks[taskId] = {
        completedAt: 0,
        reward: 0,
        adSession: null
      };
    }
  }
}

function getTask(user, taskId) {
  ensureTaskState(user);

  return user.tasks[taskId] || null;
}

function isValidTask(taskId) {
  return Object.prototype.hasOwnProperty.call(TASKS, taskId);
}

function getCooldownRemaining(user, taskId) {
  const task = getTask(user, taskId);

  if (!task) {
    return 0;
  }

  const completedAt = Number(task.completedAt || 0);

  if (!completedAt) {
    return 0;
  }

  return Math.max(
    0,
    completedAt + TASK_COOLDOWN_MS - Date.now()
  );
}

function canClaimTask(user, taskId) {
  if (!isValidTask(taskId)) {
    return {
      ok: false,
      code: "INVALID_TASK",
      message: "Invalid task."
    };
  }

  const remaining = getCooldownRemaining(user, taskId);

  if (remaining > 0) {
    return {
      ok: false,
      code: "TASK_COOLDOWN",
      message: "Task is on cooldown.",
      remainingMs: remaining
    };
  }

  return {
    ok: true,
    code: "OK"
  };
}

function awardTask(user, taskId) {
  ensureTaskState(user);

  const permission = canClaimTask(user, taskId);

  if (!permission.ok) {
    return permission;
  }

  const task = user.tasks[taskId];
  const completedAt = Date.now();

  task.completedAt = completedAt;
  task.reward = TASK_REWARD;
  task.adSession = null;

  user.balance = Number(user.balance || 0) + TASK_REWARD;

  return {
    ok: true,
    taskId,
    reward: TASK_REWARD,
    balance: user.balance,
    completedAt,
    cooldownMs: TASK_COOLDOWN_MS
  };
}

/*
  Start a server-side advertisement session.

  The client cannot simply call "claim".
  The server creates a random session and requires
  the minimum viewing time before the reward can be issued.

  For a real advertising network, the final production
  version should additionally verify the network's
  server-to-server callback.
*/

function startAdTask(user) {
  ensureTaskState(user);

  const permission = canClaimTask(user, "watch_ad");

  if (!permission.ok) {
    return permission;
  }

  const task = user.tasks.watch_ad;

  if (task.adSession) {
    return {
      ok: false,
      code: "AD_ALREADY_ACTIVE",
      message: "Advertisement session already active."
    };
  }

  const startedAt = Date.now();

  const sessionId = crypto.randomBytes(24).toString("hex");

  task.adSession = {
    id: sessionId,
    startedAt,
    expiresAt: startedAt + AD_DURATION_MS,
    claimed: false
  };

  return {
    ok: true,
    sessionId,
    startedAt,
    expiresAt: task.adSession.expiresAt,
    durationMs: AD_DURATION_MS
  };
}

function claimAdTask(user, sessionId) {
  ensureTaskState(user);

  const task = user.tasks.watch_ad;

  if (!task.adSession) {
    return {
      ok: false,
      code: "NO_AD_SESSION",
      message: "No active advertisement session."
    };
  }

  if (task.adSession.id !== String(sessionId)) {
    return {
      ok: false,
      code: "INVALID_AD_SESSION",
      message: "Invalid advertisement session."
    };
  }

  if (task.adSession.claimed) {
    return {
      ok: false,
      code: "AD_ALREADY_CLAIMED",
      message: "Advertisement reward already claimed."
    };
  }

  const currentTime = Date.now();

  if (currentTime < Number(task.adSession.expiresAt)) {
    return {
      ok: false,
      code: "AD_NOT_FINISHED",
      message: "Advertisement has not finished.",
      remainingMs:
        Number(task.adSession.expiresAt) - currentTime
    };
  }

  task.adSession.claimed = true;

  const result = awardTask(user, "watch_ad");

  task.adSession = null;

  return result;
}

/*
  The join task must only be awarded after the server
  verifies the user's Telegram membership.
*/

function claimJoinTask(user, verified) {
  if (!verified) {
    return {
      ok: false,
      code: "JOIN_NOT_VERIFIED",
      message: "Telegram channel membership was not verified."
    };
  }

  return awardTask(user, "join_channel");
}

/*
  Reaction task must be confirmed by the server-side
  Telegram reaction event/webhook.
*/

function claimReactionTask(user, verified) {
  if (!verified) {
    return {
      ok: false,
      code: "REACTION_NOT_VERIFIED",
      message: "Telegram reaction was not verified."
    };
  }

  return awardTask(user, "react_channel");
}

/*
  Invite task:
  A referral should be marked qualified by the server
  before the reward is granted.

  qualifiedCount is supplied by the server-side referral
  system, never trusted directly from the client.
*/

function claimInviteTask(user, qualifiedCount) {
  const count = Number(qualifiedCount || 0);

  if (count < 1) {
    return {
      ok: false,
      code: "NO_QUALIFIED_REFERRAL",
      message: "No qualified referral found."
    };
  }

  return awardTask(user, "invite_friends");
}

function getTasksStatus(user) {
  ensureTaskState(user);

  const result = {};

  for (const taskId of Object.keys(TASKS)) {
    const task = user.tasks[taskId];

    result[taskId] = {
      id: taskId,
      title: TASKS[taskId].title,
      type: TASKS[taskId].type,
      reward: TASK_REWARD,
      cooldownMs: TASK_COOLDOWN_MS,
      remainingMs: getCooldownRemaining(user, taskId),
      available:
        getCooldownRemaining(user, taskId) === 0
    };
  }

  return result;
}

function getTaskStatistics(user) {
  ensureTaskState(user);

  let completed = 0;
  let earned = 0;

  for (const taskId of Object.keys(TASKS)) {
    const task = user.tasks[taskId];

    if (Number(task.completedAt || 0) > 0) {
      completed++;
      earned += Number(task.reward || 0);
    }
  }

  return {
    completed,
    earned,
    totalTasks: Object.keys(TASKS).length
  };
}

function resetAdSession(user) {
  ensureTaskState(user);

  user.tasks.watch_ad.adSession = null;

  return true;
}

module.exports = {
  TASK_REWARD,
  TASK_COOLDOWN_MS,
  AD_DURATION_MS,
  TASKS,

  ensureTaskState,
  isValidTask,
  getTask,
  getCooldownRemaining,
  canClaimTask,

  awardTask,

  startAdTask,
  claimAdTask,

  claimJoinTask,
  claimReactionTask,
  claimInviteTask,

  getTasksStatus,
  getTaskStatistics,
  resetAdSession
};
