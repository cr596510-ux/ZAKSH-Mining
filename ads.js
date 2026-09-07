'use strict';

/*
  ZAKSH - Ads Security / Verification Module

  Responsibilities:
  - Create server-side ad sessions
  - Enforce minimum watch time
  - Verify signed ad-provider callbacks
  - Prevent duplicate ad rewards
  - Track ad impressions and verification events
  - Provide ad statistics

  IMPORTANT:
  The timer in the client is NOT proof of an ad view.
  A production ad network must send a server-to-server signed callback.
*/

const crypto = require('crypto');

const AD_MIN_WATCH_MS = 10 * 1000;
const AD_SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_STORED_SESSIONS = 100;
const MAX_STORED_EVENTS = 500;

const DEFAULT_PROVIDER = 'generic';

function now() {
  return Date.now();
}

function randomId(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  const aa = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');

  if (aa.length !== bb.length) {
    return false;
  }

  return crypto.timingSafeEqual(aa, bb);
}

function hmacSha256(secret, value) {
  return crypto
    .createHmac('sha256', secret)
    .update(value, 'utf8')
    .digest('hex');
}

function ensureAdsState(user) {
  if (!user.ads || typeof user.ads !== 'object') {
    user.ads = {};
  }

  if (!Array.isArray(user.ads.sessions)) {
    user.ads.sessions = [];
  }

  if (!Array.isArray(user.ads.events)) {
    user.ads.events = [];
  }

  if (!Array.isArray(user.ads.rewarded)) {
    user.ads.rewarded = [];
  }

  if (typeof user.ads.totalStarted !== 'number') {
    user.ads.totalStarted = 0;
  }

  if (typeof user.ads.totalVerified !== 'number') {
    user.ads.totalVerified = 0;
  }

  if (typeof user.ads.totalRejected !== 'number') {
    user.ads.totalRejected = 0;
  }

  if (typeof user.ads.totalRewarded !== 'number') {
    user.ads.totalRewarded = 0;
  }

  return user.ads;
}

function cleanupAdsState(user) {
  const ads = ensureAdsState(user);

  const current = now();

  ads.sessions = ads.sessions
    .filter((session) => {
      if (!session || !session.createdAt) {
        return false;
      }

      return (
        session.expiresAt > current ||
        session.verified === true ||
        session.rewarded === true
      );
    })
    .slice(-MAX_STORED_SESSIONS);

  ads.events = ads.events
    .filter(Boolean)
    .slice(-MAX_STORED_EVENTS);

  ads.rewarded = ads.rewarded
    .filter(Boolean)
    .slice(-MAX_STORED_EVENTS);

  return ads;
}

/**
 * Start a new ad session.
 *
 * This does NOT reward the user.
 */
function startAdSession(user, provider = DEFAULT_PROVIDER) {
  if (!user || !user.id) {
    throw new Error('INVALID_USER');
  }

  const ads = cleanupAdsState(user);

  const current = now();

  const active = ads.sessions.find(
    (session) =>
      session &&
      session.rewarded !== true &&
      session.verified !== true &&
      session.expiresAt > current
  );

  if (active) {
    return {
      ok: true,
      sessionId: active.sessionId,
      provider: active.provider,
      startedAt: active.startedAt,
      readyAt: active.readyAt,
      expiresAt: active.expiresAt,
      reused: true
    };
  }

  const session = {
    sessionId: randomId(24),
    userId: String(user.id),
    provider: String(provider || DEFAULT_PROVIDER),
    startedAt: current,
    readyAt: current + AD_MIN_WATCH_MS,
    expiresAt: current + AD_SESSION_TTL_MS,
    verified: false,
    rewarded: false,
    verifiedAt: null,
    rewardedAt: null,
    providerEventId: null
  };

  ads.sessions.push(session);
  ads.totalStarted += 1;

  return {
    ok: true,
    sessionId: session.sessionId,
    provider: session.provider,
    startedAt: session.startedAt,
    readyAt: session.readyAt,
    expiresAt: session.expiresAt,
    reused: false
  };
}

function findSession(user, sessionId) {
  if (!user || !sessionId) {
    return null;
  }

  const ads = ensureAdsState(user);

  return (
    ads.sessions.find(
      (session) =>
        session &&
        session.sessionId === String(sessionId)
    ) || null
  );
}

function getAdSessionStatus(user, sessionId) {
  const session = findSession(user, sessionId);

  if (!session) {
    return {
      ok: false,
      code: 'AD_SESSION_NOT_FOUND'
    };
  }

  const current = now();

  return {
    ok: true,
    sessionId: session.sessionId,
    provider: session.provider,
    startedAt: session.startedAt,
    readyAt: session.readyAt,
    expiresAt: session.expiresAt,
    verified: session.verified === true,
    rewarded: session.rewarded === true,
    expired:
      session.rewarded !== true &&
      session.verified !== true &&
      current > session.expiresAt,
    remainingMs: Math.max(0, session.readyAt - current)
  };
}

/**
 * Generic callback signature.
 *
 * Signature format:
 * HMAC-SHA256(secret, rawBody)
 */
function createCallbackSignature(rawBody, secret) {
  if (!secret) {
    throw new Error('AD_PROVIDER_SECRET_MISSING');
  }

  return hmacSha256(secret, String(rawBody));
}

function verifyCallbackSignature(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) {
    return false;
  }

  const expected = createCallbackSignature(rawBody, secret);

  let normalized = String(signature).trim();

  if (normalized.startsWith('sha256=')) {
    normalized = normalized.slice(7);
  }

  return safeEqual(expected, normalized);
}

function parseCallbackBody(rawBody) {
  if (typeof rawBody === 'object' && rawBody !== null) {
    return rawBody;
  }

  try {
    return JSON.parse(String(rawBody));
  } catch (error) {
    return null;
  }
}

/**
 * Expected generic callback:
 *
 * {
 *   "eventId": "...",
 *   "sessionId": "...",
 *   "userId": "...",
 *   "provider": "...",
 *   "status": "completed",
 *   "completedAt": 1234567890000
 * }
 */
function validateCallbackPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return {
      ok: false,
      code: 'INVALID_CALLBACK'
    };
  }

  const required = [
    'eventId',
    'sessionId',
    'userId',
    'provider',
    'status'
  ];

  for (const field of required) {
    if (
      payload[field] === undefined ||
      payload[field] === null ||
      String(payload[field]).trim() === ''
    ) {
      return {
        ok: false,
        code: `CALLBACK_FIELD_MISSING_${field.toUpperCase()}`
      };
    }
  }

  if (String(payload.status).toLowerCase() !== 'completed') {
    return {
      ok: false,
      code: 'AD_NOT_COMPLETED'
    };
  }

  if (
    payload.completedAt !== undefined &&
    (!Number.isFinite(Number(payload.completedAt)) ||
      Number(payload.completedAt) <= 0)
  ) {
    return {
      ok: false,
      code: 'INVALID_COMPLETION_TIME'
    };
  }

  return {
    ok: true
  };
}

function hasProcessedEvent(user, eventId) {
  const ads = ensureAdsState(user);

  return ads.events.some(
    (event) =>
      event &&
      event.eventId === String(eventId)
  );
}

function findUserById(db, userId) {
  if (!db || !db.users) {
    return null;
  }

  if (Array.isArray(db.users)) {
    return (
      db.users.find(
        (user) =>
          user &&
          String(user.id) === String(userId)
      ) || null
    );
  }

  if (typeof db.users === 'object') {
    return (
      db.users[String(userId)] ||
      null
    );
  }

  return null;
}

function recordEvent(user, event) {
  const ads = ensureAdsState(user);

  ads.events.push({
    eventId: String(event.eventId),
    sessionId: String(event.sessionId),
    provider: String(event.provider),
    status: String(event.status),
    timestamp: now()
  });

  ads.events = ads.events.slice(-MAX_STORED_EVENTS);
}

function processAdCallback(db, rawBody, signature, config = {}) {
  const secret =
    config.AD_PROVIDER_SECRET ||
    process.env.AD_PROVIDER_SECRET ||
    '';

  if (!secret) {
    return {
      ok: false,
      code: 'AD_PROVIDER_NOT_CONFIGURED'
    };
  }

  if (
    !verifyCallbackSignature(
      rawBody,
      signature,
      secret
    )
  ) {
    return {
      ok: false,
      code: 'INVALID_AD_SIGNATURE'
    };
  }

  const payload = parseCallbackBody(rawBody);

  const validation =
    validateCallbackPayload(payload);

  if (!validation.ok) {
    return validation;
  }

  const user = findUserById(
    db,
    payload.userId
  );

  if (!user) {
    return {
      ok: false,
      code: 'USER_NOT_FOUND'
    };
  }

  const ads = cleanupAdsState(user);

  if (hasProcessedEvent(user, payload.eventId)) {
    return {
      ok: true,
      duplicate: true,
      code: 'EVENT_ALREADY_PROCESSED'
    };
  }

  const session = findSession(
    user,
    payload.sessionId
  );

  if (!session) {
    ads.totalRejected += 1;

    return {
      ok: false,
      code: 'AD_SESSION_NOT_FOUND'
    };
  }

  if (
    String(session.userId) !==
    String(payload.userId)
  ) {
    ads.totalRejected += 1;

    return {
      ok: false,
      code: 'USER_SESSION_MISMATCH'
    };
  }

  if (
    String(session.provider) !==
    String(payload.provider)
  ) {
    ads.totalRejected += 1;

    return {
      ok: false,
      code: 'AD_PROVIDER_MISMATCH'
    };
  }

  if (session.rewarded === true) {
    recordEvent(user, {
      eventId: payload.eventId,
      sessionId: payload.sessionId,
      provider: payload.provider,
      status: 'duplicate_reward_attempt'
    });

    return {
      ok: true,
      duplicate: true,
      code: 'SESSION_ALREADY_REWARDED'
    };
  }

  /*
    Provider callback is authoritative.

    If the provider sends a completion timestamp,
    make sure it is not earlier than the server-side
    minimum watch time.
  */
  const completedAt = Number(
    payload.completedAt || now()
  );

  if (completedAt < session.readyAt) {
    ads.totalRejected += 1;

    recordEvent(user, {
      eventId: payload.eventId,
      sessionId: payload.sessionId,
      provider: payload.provider,
      status: 'completed_too_early'
    });

    return {
      ok: false,
      code: 'AD_COMPLETED_TOO_EARLY'
    };
  }

  session.verified = true;
  session.verifiedAt = now();
  session.providerEventId =
    String(payload.eventId);

  ads.totalVerified += 1;

  recordEvent(user, {
    eventId: payload.eventId,
    sessionId: payload.sessionId,
    provider: payload.provider,
    status: 'verified'
  });

  return {
    ok: true,
    verified: true,
    sessionId: session.sessionId,
    userId: String(user.id),
    provider: session.provider
  };
}

/**
 * Server-side check before Tasks module gives
 * the 4-token task reward.
 */
function isAdVerified(user, sessionId) {
  const session = findSession(
    user,
    sessionId
  );

  if (!session) {
    return false;
  }

  return (
    session.verified === true &&
    session.rewarded !== true
  );
}

/**
 * Marks the verified ad as consumed.
 *
 * The actual token reward should be handled by tasks.js.
 */
function markAdRewarded(user, sessionId) {
  const session = findSession(
    user,
    sessionId
  );

  if (!session) {
    return {
      ok: false,
      code: 'AD_SESSION_NOT_FOUND'
    };
  }

  if (!session.verified) {
    return {
      ok: false,
      code: 'AD_NOT_VERIFIED'
    };
  }

  if (session.rewarded) {
    return {
      ok: false,
      code: 'AD_ALREADY_REWARDED'
    };
  }

  const ads = ensureAdsState(user);

  session.rewarded = true;
  session.rewardedAt = now();

  ads.rewarded.push({
    sessionId: session.sessionId,
    provider: session.provider,
    eventId: session.providerEventId,
    rewardedAt: session.rewardedAt
  });

  ads.rewarded =
    ads.rewarded.slice(-MAX_STORED_EVENTS);

  ads.totalRewarded += 1;

  return {
    ok: true,
    sessionId: session.sessionId,
    rewardedAt: session.rewardedAt
  };
}

function rejectAdSession(user, sessionId, reason) {
  const session = findSession(
    user,
    sessionId
  );

  if (!session) {
    return {
      ok: false,
      code: 'AD_SESSION_NOT_FOUND'
    };
  }

  const ads = ensureAdsState(user);

  ads.totalRejected += 1;

  recordEvent(user, {
    eventId: randomId(16),
    sessionId,
    provider: session.provider,
    status: `rejected:${reason || 'unknown'}`
  });

  return {
    ok: true
  };
}

function getAdStatistics(db) {
  const users = [];

  if (db && Array.isArray(db.users)) {
    users.push(...db.users);
  } else if (
    db &&
    db.users &&
    typeof db.users === 'object'
  ) {
    users.push(
      ...Object.values(db.users)
    );
  }

  let totalStarted = 0;
  let totalVerified = 0;
  let totalRejected = 0;
  let totalRewarded = 0;

  const uniqueUsers = new Set();
  const providers = {};

  for (const user of users) {
    if (!user) {
      continue;
    }

    const ads = ensureAdsState(user);

    totalStarted +=
      Number(ads.totalStarted) || 0;

    totalVerified +=
      Number(ads.totalVerified) || 0;

    totalRejected +=
      Number(ads.totalRejected) || 0;

    totalRewarded +=
      Number(ads.totalRewarded) || 0;

    if (ads.totalVerified > 0 && user.id) {
      uniqueUsers.add(String(user.id));
    }

    for (const session of ads.sessions) {
      if (!session || !session.provider) {
        continue;
      }

      const provider =
        String(session.provider);

      if (!providers[provider]) {
        providers[provider] = {
          started: 0,
          verified: 0,
          rewarded: 0
        };
      }

      providers[provider].started += 1;

      if (session.verified) {
        providers[provider].verified += 1;
      }

      if (session.rewarded) {
        providers[provider].rewarded += 1;
      }
    }
  }

  return {
    totalStarted,
    totalVerified,
    totalRejected,
    totalRewarded,
    uniqueVerifiedUsers:
      uniqueUsers.size,
    verificationRate:
      totalStarted > 0
        ? Number(
            (
              (totalVerified /
                totalStarted) *
              100
            ).toFixed(2)
          )
        : 0,
    providers
  };
}

function getAdConfig(config = {}) {
  return {
    provider:
      config.AD_PROVIDER ||
      process.env.AD_PROVIDER ||
      DEFAULT_PROVIDER,

    minWatchMs:
      Number(
        config.AD_MIN_WATCH_MS ||
          process.env.AD_MIN_WATCH_MS ||
          AD_MIN_WATCH_MS
      ),

    sessionTtlMs:
      Number(
        config.AD_SESSION_TTL_MS ||
          process.env.AD_SESSION_TTL_MS ||
          AD_SESSION_TTL_MS
      ),

    callbackConfigured:
      Boolean(
        config.AD_PROVIDER_SECRET ||
        process.env.AD_PROVIDER_SECRET
      )
  };
}

function resetExpiredSessions(user) {
  const ads = ensureAdsState(user);

  const current = now();

  let reset = 0;

  for (const session of ads.sessions) {
    if (
      session &&
      session.expiresAt < current &&
      session.rewarded !== true &&
      session.verified !== true
    ) {
      session.expired = true;
      reset += 1;
    }
  }

  return {
    ok: true,
    reset
  };
}

module.exports = {
  AD_MIN_WATCH_MS,
  AD_SESSION_TTL_MS,

  ensureAdsState,
  cleanupAdsState,

  startAdSession,
  findSession,
  getAdSessionStatus,

  createCallbackSignature,
  verifyCallbackSignature,
  parseCallbackBody,
  validateCallbackPayload,

  processAdCallback,

  isAdVerified,
  markAdRewarded,
  rejectAdSession,

  getAdStatistics,
  getAdConfig,
  resetExpiredSessions
};
