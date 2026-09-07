// referrals.js
// ZAKSH Referral Module

const crypto = require("crypto");

const REFERRAL_REWARD = 0;
const MIN_QUALIFIED_REFERRALS_FOR_TASK = 1;

function ensureReferralState(user) {
  if (!user.referrals || typeof user.referrals !== "object") {
    user.referrals = {};
  }

  if (!Array.isArray(user.referrals.list)) {
    user.referrals.list = [];
  }

  if (!Array.isArray(user.referrals.qualified)) {
    user.referrals.qualified = [];
  }

  if (!Array.isArray(user.referrals.rewarded)) {
    user.referrals.rewarded = [];
  }

  if (!user.referrals.code) {
    user.referrals.code = createReferralCode(user.id);
  }

  if (!Object.prototype.hasOwnProperty.call(user.referrals, "referredBy")) {
    user.referrals.referredBy = null;
  }
}

function createReferralCode(userId) {
  const cleanId = String(userId || "user")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 16);

  const random = crypto
    .randomBytes(5)
    .toString("hex");

  return `ZAKSH_${cleanId}_${random}`;
}

function getReferralCode(user) {
  ensureReferralState(user);
  return user.referrals.code;
}

function getReferralLink(user, botUsername) {
  ensureReferralState(user);

  const username = String(botUsername || "")
    .replace(/^@/, "")
    .trim();

  if (!username) {
    return null;
  }

  return `https://t.me/${username}?startapp=ref_${encodeURIComponent(
    user.referrals.code
  )}`;
}

function findUserByReferralCode(db, code) {
  if (!db || !db.users) {
    return null;
  }

  const target = String(code || "").trim();

  if (!target) {
    return null;
  }

  for (const user of Object.values(db.users)) {
    ensureReferralState(user);

    if (user.referrals.code === target) {
      return user;
    }
  }

  return null;
}

function setReferrer(user, referrer) {
  ensureReferralState(user);

  if (!referrer) {
    return {
      ok: false,
      code: "REFERRER_NOT_FOUND",
      message: "Referrer not found."
    };
  }

  if (String(user.id) === String(referrer.id)) {
    return {
      ok: false,
      code: "SELF_REFERRAL",
      message: "Self referral is not allowed."
    };
  }

  if (user.referrals.referredBy) {
    return {
      ok: false,
      code: "REFERRER_ALREADY_SET",
      message: "Referrer has already been set."
    };
  }

  ensureReferralState(referrer);

  user.referrals.referredBy = String(referrer.id);

  if (!referrer.referrals.list.includes(String(user.id))) {
    referrer.referrals.list.push(String(user.id));
  }

  return {
    ok: true,
    referrerId: String(referrer.id),
    userId: String(user.id)
  };
}

function isReferredBy(user, referrerId) {
  ensureReferralState(user);

  return (
    String(user.referrals.referredBy || "") ===
    String(referrerId || "")
  );
}

function qualifyReferral(referrer, referredUserId) {
  ensureReferralState(referrer);

  const id = String(referredUserId);

  if (!referrer.referrals.list.includes(id)) {
    return {
      ok: false,
      code: "REFERRAL_NOT_FOUND",
      message: "Referral is not registered."
    };
  }

  if (referrer.referrals.qualified.includes(id)) {
    return {
      ok: false,
      code: "ALREADY_QUALIFIED",
      message: "Referral is already qualified."
    };
  }

  referrer.referrals.qualified.push(id);

  return {
    ok: true,
    referrerId: String(referrer.id),
    referredUserId: id,
    qualifiedCount: referrer.referrals.qualified.length
  };
}

function isQualifiedReferral(referrer, referredUserId) {
  ensureReferralState(referrer);

  return referrer.referrals.qualified.includes(
    String(referredUserId)
  );
}

function getReferralCount(user) {
  ensureReferralState(user);
  return user.referrals.list.length;
}

function getQualifiedReferralCount(user) {
  ensureReferralState(user);
  return user.referrals.qualified.length;
}

function getRewardedReferralCount(user) {
  ensureReferralState(user);
  return user.referrals.rewarded.length;
}

function markReferralRewarded(user, referredUserId) {
  ensureReferralState(user);

  const id = String(referredUserId);

  if (!user.referrals.qualified.includes(id)) {
    return {
      ok: false,
      code: "REFERRAL_NOT_QUALIFIED",
      message: "Referral is not qualified."
    };
  }

  if (user.referrals.rewarded.includes(id)) {
    return {
      ok: false,
      code: "REFERRAL_ALREADY_REWARDED",
      message: "Referral reward already issued."
    };
  }

  user.referrals.rewarded.push(id);

  return {
    ok: true,
    referredUserId: id,
    rewardedCount: user.referrals.rewarded.length
  };
}

function canUseReferralForTask(user) {
  return (
    getQualifiedReferralCount(user) >=
    MIN_QUALIFIED_REFERRALS_FOR_TASK
  );
}

function getReferralStatus(user, botUsername) {
  ensureReferralState(user);

  return {
    code: user.referrals.code,

    link: getReferralLink(
      user,
      botUsername
    ),

    referredBy:
      user.referrals.referredBy,

    totalReferrals:
      user.referrals.list.length,

    qualifiedReferrals:
      user.referrals.qualified.length,

    rewardedReferrals:
      user.referrals.rewarded.length,

    canUseForInviteTask:
      canUseReferralForTask(user)
  };
}

function getReferralStatistics(user) {
  ensureReferralState(user);

  return {
    total: user.referrals.list.length,
    qualified: user.referrals.qualified.length,
    rewarded: user.referrals.rewarded.length
  };
}

function removeReferral(user, referredUserId) {
  ensureReferralState(user);

  const id = String(referredUserId);

  user.referrals.list =
    user.referrals.list.filter(
      (item) => String(item) !== id
    );

  user.referrals.qualified =
    user.referrals.qualified.filter(
      (item) => String(item) !== id
    );

  user.referrals.rewarded =
    user.referrals.rewarded.filter(
      (item) => String(item) !== id
    );

  return true;
}

module.exports = {
  REFERRAL_REWARD,
  MIN_QUALIFIED_REFERRALS_FOR_TASK,

  ensureReferralState,
  createReferralCode,
  getReferralCode,
  getReferralLink,

  findUserByReferralCode,
  setReferrer,
  isReferredBy,

  qualifyReferral,
  isQualifiedReferral,

  getReferralCount,
  getQualifiedReferralCount,
  getRewardedReferralCount,

  markReferralRewarded,
  canUseReferralForTask,

  getReferralStatus,
  getReferralStatistics,

  removeReferral
};
