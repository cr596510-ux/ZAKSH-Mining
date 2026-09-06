const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

/* ZAKSH — Telegram Mini App
   Node 20+ — no npm packages required.
   Channel: @ZAKASMINER
*/

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const OWNER_ID = String(process.env.OWNER_TELEGRAM_ID || '');
const BOT_USERNAME = String(process.env.BOT_USERNAME || 'ZAKSH_MiningBot').replace(/^@/, '');
const CHANNEL_USERNAME = String(process.env.CHANNEL_USERNAME || 'ZAKASMINER').replace(/^@/, '');
const BASE_URL = String(process.env.BASE_URL || '').replace(/\/$/, '');
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || crypto.randomBytes(24).toString('hex');
const REACTION_MESSAGE_ID = Number(process.env.REACTION_MESSAGE_ID || 0);
const REACTION_EMOJI = String(process.env.REACTION_EMOJI || '👍');

const PRICE_USD = 0.13;
const TASK_REWARD = 4;
const TASK_COOLDOWN = 2 * 60 * 60 * 1000;
const MINING_WINDOW = 6 * 60 * 60 * 1000;
const MAX_MINES = 2;
const MINING_MS = 40 * 1000;
const PROGRAM_MS = 48 * 24 * 60 * 60 * 1000;

const DB_FILE = path.join(__dirname, 'zaksh-db.json');

const emptyDb = () => ({
  meta: {
    campaignStart: Date.now(),
    campaignEnd: Date.now() + PROGRAM_MS
  },
  users: [],
  sessions: [],
  claims: [],
  referrals: [],
  logs: [],
  reactions: [],
  ads: []
});

let db;

try {
  db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
} catch {
  db = emptyDb();
  save();
}

if (!db.meta || !db.meta.campaignStart || !db.meta.campaignEnd) {
  db = emptyDb();
  save();
}

function save() {
  fs.writeFileSync(
    DB_FILE + '.tmp',
    JSON.stringify(db),
    'utf8'
  );
  fs.renameSync(DB_FILE + '.tmp', DB_FILE);
}

function now() {
  return Date.now();
}

function id() {
  return crypto.randomBytes(12).toString('hex');
}

function b64(s) {
  return Buffer.from(s).toString('base64url');
}

function unb64(s) {
  return Buffer.from(s, 'base64url').toString('utf8');
}

function sessionSecret() {
  return process.env.SESSION_SECRET ||
    'CHANGE_THIS_SESSION_SECRET_IN_PRODUCTION';
}

function signSession(payload) {
  const body = b64(JSON.stringify(payload));
  const sig = crypto
    .createHmac('sha256', sessionSecret())
    .update(body)
    .digest('base64url');

  return body + '.' + sig;
}

function verifySession(token) {
  try {
    const [body, sig] = String(token || '').split('.');

    if (!body || !sig) return null;

    const expected = crypto
      .createHmac('sha256', sessionSecret())
      .update(body)
      .digest('base64url');

    if (!crypto.timingSafeEqual(
      Buffer.from(sig),
      Buffer.from(expected)
    )) {
      return null;
    }

    const payload = JSON.parse(unb64(body));

    if (payload.exp < now()) return null;

    return payload;
  } catch {
    return null;
  }
}

function json(res, status, obj) {
  const out = JSON.stringify(obj);

  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });

  res.end(out);
}

function html(res) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy':
      "default-src 'self' https://telegram.org; " +
      "script-src 'self' https://telegram.org 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' https://api.telegram.org; " +
      "frame-ancestors https://web.telegram.org https://*.telegram.org;"
  });

  res.end(INDEX_HTML);
}

async function body(req) {
  let s = '';

  for await (const c of req) {
    s += c;

    if (s.length > 200000) {
      throw new Error('body_too_large');
    }
  }

  try {
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}

function userById(uid) {
  return db.users.find(u => u.id === uid);
}

function userByTg(tid) {
  return db.users.find(
    u => String(u.telegramId) === String(tid)
  );
}

function safeUser(u) {
  return {
    id: u.id,
    telegramId: u.telegramId,
    username: u.username,
    firstName: u.firstName,
    role: u.role,
    balance: u.balance,
    referralCode: u.referralCode,
    walletAddress: u.walletAddress || '',
    createdAt: u.createdAt,
    lastSeen: u.lastSeen
  };
}

function log(actor, action, target, meta = {}) {
  db.logs.unshift({
    id: id(),
    actor,
    target,
    action,
    meta,
    createdAt: now()
  });

  db.logs = db.logs.slice(0, 5000);
}

function taskKey() {
  return Math.floor(now() / TASK_COOLDOWN);
}

function claimed(uid, code) {
  return db.claims.some(c =>
    c.uid === uid &&
    c.code === code &&
    c.cycle === taskKey()
  );
}

function taskList(uid) {
  return [
    {
      code: 'join',
      title: 'Join Channel',
      sub: 'Join @ZAKASMINER',
      icon: '✈️',
      reward: TASK_REWARD,
      claimed: claimed(uid, 'join')
    },
    {
      code: 'react',
      title: 'React to Channel',
      sub: 'React to the channel post',
      icon: '💬',
      reward: TASK_REWARD,
      claimed: claimed(uid, 'react')
    },
    {
      code: 'ad',
      title: 'Watch Advertisement',
      sub: 'Watch for 10 seconds',
      icon: '▶️',
      reward: TASK_REWARD,
      claimed: claimed(uid, 'ad')
    },
    {
      code: 'invite',
      title: 'Invite Friends',
      sub: 'Invite a new ZAKSH user',
      icon: '👥',
      reward: TASK_REWARD,
      claimed: claimed(uid, 'invite')
    }
  ];
}

function telegramInitValid(initData) {
  if (!BOT_TOKEN) return null;

  try {
    const p = new URLSearchParams(initData || '');
    const hash = p.get('hash');

    if (!hash) return null;

    p.delete('hash');

    const data = [...p.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => k + '=' + v)
      .join('\n');

    const secret = crypto
      .createHmac('sha256', 'WebAppData')
      .update(BOT_TOKEN)
      .digest();

    const calc = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('hex');

    if (!crypto.timingSafeEqual(
      Buffer.from(calc, 'hex'),
      Buffer.from(hash, 'hex')
    )) {
      return null;
    }

    const authDate = Number(p.get('auth_date') || 0);

    if (!authDate || now() / 1000 - authDate > 86400) {
      return null;
    }

    const raw = p.get('user');

    if (!raw) return null;

    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function devIdentity() {
  return {
    id: 'dev-100000001',
    username: 'demo_user',
    first_name: 'ZAKSH'
  };
}

function getOrCreate(tg, ref) {
  const tid = String(tg.id);

  let u = userByTg(tid);

  if (!u) {
    const inviter = db.users.find(
      x => x.referralCode === String(ref || '')
    );

    u = {
      id: id(),
      telegramId: tid,
      username: tg.username || '',
      firstName: tg.first_name || 'ZAKSH',
      role:
        OWNER_ID && tid === OWNER_ID
          ? 'owner'
          : 'user',
      balance: 0,
      referralCode:
        crypto.randomBytes(5).toString('hex').toUpperCase(),
      referredBy: inviter?.id || null,
      walletAddress: '',
      createdAt: now(),
      lastSeen: now()
    };

    db.users.push(u);

    if (inviter && inviter.id !== u.id) {
      db.referrals.push({
        id: id(),
        inviterId: inviter.id,
        inviteeId: u.id,
        createdAt: now(),
        qualified: false
      });
    }

    log(u.id, 'user_created', u.id, {});
  } else {
    u.username = tg.username || u.username;
    u.firstName = tg.first_name || u.firstName;
    u.lastSeen = now();

    if (u.telegramId === OWNER_ID) {
      u.role = 'owner';
    }
  }

  save();

  return u;
}

async function tg(method, params = {}) {
  if (!BOT_TOKEN) {
    throw new Error('BOT_TOKEN missing');
  }

  const r = await fetch(
    'https://api.telegram.org/bot' +
    BOT_TOKEN +
    '/' +
    method,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(params)
    }
  );

  const j = await r.json();

  if (!j.ok) {
    throw new Error(j.description || 'telegram_error');
  }

  return j.result;
}

async function verifyJoin(u) {
  if (!CHANNEL_USERNAME) return false;

  try {
    const m = await tg('getChatMember', {
      chat_id: '@' + CHANNEL_USERNAME.replace(/^@/, ''),
      user_id: Number(u.telegramId)
    });

    return [
      'creator',
      'administrator',
      'member'
    ].includes(m.status) ||
      (
        m.status === 'restricted' &&
        m.is_member === true
      );
  } catch {
    return false;
  }
}

function reactionVerified(u) {
  return db.reactions.some(r =>
    String(r.userId) === String(u.telegramId) &&
    (
      !REACTION_MESSAGE_ID ||
      Number(r.messageId) === REACTION_MESSAGE_ID
    ) &&
    (
      !CHANNEL_USERNAME ||
      String(r.chatUsername || '') ===
      '@' + CHANNEL_USERNAME.replace(/^@/, '')
    )
  );
}

function auth(req) {
  const h = req.headers.authorization || '';

  return verifySession(
    h.startsWith('Bearer ')
      ? h.slice(7)
      : ''
  );
}

function requireAuth(req, res) {
  const s = auth(req);

  if (!s) {
    json(res, 401, {
      error: 'unauthorized'
    });
    return null;
  }

  const u = userById(s.uid);

  if (!u) {
    json(res, 401, {
      error: 'user_missing'
    });
    return null;
  }

  u.lastSeen = now();

  return u;
}

function requireStaff(req, res) {
  const u = requireAuth(req, res);

  if (!u) return null;

  if (!['owner', 'admin'].includes(u.role)) {
    json(res, 403, {
      error: 'forbidden'
    });

    return null;
  }

  return u;
}

function requireOwner(req, res) {
  const u = requireAuth(req, res);

  if (!u) return null;

  if (u.role !== 'owner') {
    json(res, 403, {
      error: 'owner_only'
    });

    return null;
  }

  return u;
}

function miningCount(u) {
  const cut = now() - MINING_WINDOW;

  return db.sessions.filter(
    s =>
      s.uid === u.id &&
      s.startedAt >= cut
  ).length;
}

function stats() {
  const total = db.users.length;

  const active = db.users.filter(
    u => u.lastSeen >= now() - 86400000
  ).length;

  const earned = db.users.reduce(
    (a, u) => a + u.balance,
    0
  );

  const wallets = db.users.filter(
    u => u.walletAddress
  ).length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const minesToday = db.sessions.filter(
    s => s.startedAt >= today.getTime()
  );

  const taskToday = db.claims.filter(
    c => c.createdAt >= today.getTime()
  ).length;

  return {
    total,
    active,
    earned,
    wallets,
    minesToday: minesToday.length,
    taskToday,
    price: PRICE_USD,
    campaignStart: db.meta.campaignStart,
    campaignEnd: db.meta.campaignEnd
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(
      req.url,
      'http://localhost'
    );

    if (
      req.method === 'GET' &&
      u.pathname === '/'
    ) {
      return html(res);
    }

    if (
      req.method === 'POST' &&
      u.pathname === '/api/auth'
    ) {
      const b = await body(req);

      let tgUser = telegramInitValid(
        b.initData
      );

      if (!tgUser) {
        if (BOT_TOKEN) {
          return json(res, 401, {
            error: 'telegram_auth_failed'
          });
        }

        tgUser = devIdentity();
      }

      const user = getOrCreate(
        tgUser,
        b.referral
      );

      return json(res, 200, {
        token: signSession({
          uid: user.id,
          role: user.role,
          exp: now() + 7 * 86400000
        }),
        user: safeUser(user),
        config: {
          price: PRICE_USD,
          campaignStart: db.meta.campaignStart,
          campaignEnd: db.meta.campaignEnd,
          bot: BOT_USERNAME,
          channel: CHANNEL_USERNAME
        }
      });
    }

    if (
      req.method === 'POST' &&
      u.pathname === '/telegram/webhook'
    ) {
      if (
        req.headers[
          'x-telegram-bot-api-secret-token'
        ] !== WEBHOOK_SECRET
      ) {
        return json(res, 403, {
          error: 'bad_secret'
        });
      }

      const b = await body(req);
      const mr = b.message_reaction;

      if (mr?.user?.id) {
        db.reactions.push({
          userId: String(mr.user.id),
          messageId: Number(mr.message_id || 0),
          chatId: String(mr.chat?.id || ''),
          chatUsername:
            mr.chat?.username
              ? '@' + mr.chat.username
              : '',
          reaction: JSON.stringify(
            mr.new_reaction || []
          ),
          createdAt: now()
        });

        db.reactions =
          db.reactions.slice(-10000);

        save();
      }

      return json(res, 200, {
        ok: true
      });
    }

    if (
      req.method === 'GET' &&
      u.pathname === '/api/me'
    ) {
      const user = requireAuth(req, res);

      if (!user) return;

      return json(res, 200, {
        user: safeUser(user),
        config: {
          price: PRICE_USD,
          campaignStart: db.meta.campaignStart,
          campaignEnd: db.meta.campaignEnd,
          bot: BOT_USERNAME,
          channel: CHANNEL_USERNAME
        }
      });
    }

    if (
      req.method === 'GET' &&
      u.pathname === '/api/tasks'
    ) {
      const user = requireAuth(req, res);

      if (!user) return;

      return json(res, 200, {
        tasks: taskList(user.id),
        nextReset:
          (taskKey() + 1) * TASK_COOLDOWN
      });
    }

    if (
      req.method === 'POST' &&
      u.pathname === '/api/tasks/claim'
    ) {
      const user = requireAuth(req, res);

      if (!user) return;

      const b = await body(req);

      const code = String(
        b.code || ''
      );

      if (claimed(user.id, code)) {
        return json(res, 429, {
          error: 'task_cooldown'
        });
      }

      if (
        ![
          'join',
          'react',
          'ad',
          'invite'
        ].includes(code)
      ) {
        return json(res, 400, {
          error: 'bad_task'
        });
      }

      if (
        code === 'join' &&
        !(await verifyJoin(user))
      ) {
        return json(res, 400, {
          error: 'not_joined',
          message:
            'Join @ZAKASMINER first.'
        });
      }

      if (
        code === 'react' &&
        !reactionVerified(user)
      ) {
        return json(res, 400, {
          error: 'reaction_not_verified',
          message:
            'React to the configured channel post first.'
        });
      }

      if (code === 'ad') {
        const ad = db.ads.find(
          a =>
            a.uid === user.id &&
            !a.used &&
            a.expiresAt > now()
        );

        if (
          !ad ||
          now() - ad.startedAt < 10000
        ) {
          return json(res, 400, {
            error: 'ad_not_completed'
          });
        }

        ad.used = true;
      }

      if (code === 'invite') {
        const qualified =
          db.referrals.find(
            r =>
              r.inviterId === user.id &&
              r.qualified &&
              !claimed(
                user.id,
                'invite'
              )
          );

        if (!qualified) {
          return json(res, 400, {
            error: 'no_qualified_invite'
          });
        }
      }

      db.claims.push({
        id: id(),
        uid: user.id,
        code,
        cycle: taskKey(),
        reward: TASK_REWARD,
        createdAt: now()
      });

      user.balance += TASK_REWARD;

      log(
        user.id,
        'task_reward',
        user.id,
        {
          code,
          reward: TASK_REWARD
        }
      );

      save();

      return json(res, 200, {
        ok: true,
        reward: TASK_REWARD,
        user: safeUser(user)
      });
    }

    if (
      req.method === 'POST' &&
      u.pathname === '/api/ad/start'
    ) {
      const user = requireAuth(req, res);

      if (!user) return;

      if (claimed(user.id, 'ad')) {
        return json(res, 429, {
          error: 'task_cooldown'
        });
      }

      db.ads.push({
        id: id(),
        uid: user.id,
        startedAt: now(),
        expiresAt: now() + 60000,
        used: false
      });

      save();

      return json(res, 200, {
        ok: true,
        duration: 10000
      });
    }

    if (
      req.method === 'POST' &&
      u.pathname === '/api/mining/start'
    ) {
      const user = requireAuth(req, res);

      if (!user) return;

      if (
        miningCount(user) >= MAX_MINES
      ) {
        return json(res, 429, {
          error: 'mining_limit',
          message:
            'Maximum 2 mining rounds in 6 hours.'
        });
      }

      if (
        db.sessions.some(
          s =>
            s.uid === user.id &&
            !s.finishedAt
        )
      ) {
        return json(res, 409, {
          error: 'already_mining'
        });
      }

      const s = {
        id: id(),
        uid: user.id,
        nonce: crypto
          .randomBytes(18)
          .toString('hex'),
        startedAt: now(),
        finishedAt: 0,
        reward: 0
      };

      db.sessions.push(s);
      save();

      return json(res, 200, {
        ok: true,
        nonce: s.nonce,
        startedAt: s.startedAt,
        duration: MINING_MS
      });
    }

    if (
      req.method === 'POST' &&
      u.pathname === '/api/mining/finish'
    ) {
      const user = requireAuth(req, res);

      if (!user) return;

      const b = await body(req);

      const s = db.sessions.find(
        x =>
          x.uid === user.id &&
          x.nonce === String(
            b.nonce || ''
          ) &&
          !x.finishedAt
      );

      if (!s) {
        return json(res, 400, {
          error: 'invalid_session'
        });
      }

      const elapsed =
        now() - s.startedAt;

      if (elapsed < MINING_MS) {
        return json(res, 400, {
          error: 'too_early'
        });
      }

      if (
        elapsed >
        MINING_MS + 15000
      ) {
        return json(res, 400, {
          error: 'session_expired'
        });
      }

      s.finishedAt = now();

      s.reward =
        60 +
        crypto.randomInt(0, 101);

      user.balance += s.reward;

      log(
        user.id,
        'mining_reward',
        user.id,
        {
          reward: s.reward
        }
      );

      save();

      return json(res, 200, {
        ok: true,
        reward: s.reward,
        user: safeUser(user)
      });
    }

    if (
      req.method === 'GET' &&
      u.pathname === '/api/wallet'
    ) {
      const user = requireAuth(req, res);

      if (!user) return;

      return json(res, 200, {
        balance: user.balance,
        valueUsd:
          user.balance * PRICE_USD,
        walletAddress:
          user.walletAddress || '',
        withdrawalLocked:
          now() < db.meta.campaignEnd,
        unlockAt:
          db.meta.campaignEnd
      });
    }

    if (
      req.method === 'POST' &&
      u.pathname === '/api/wallet/address'
    ) {
      const user = requireAuth(req, res);

      if (!user) return;

      const b = await body(req);

      const a = String(
        b.address || ''
      ).trim();

      if (
        !/^(EQ|UQ)[A-Za-z0-9_-]{40,60}$/.test(a)
      ) {
        return json(res, 400, {
          error: 'invalid_ton_address'
        });
      }

      user.walletAddress = a;

      log(
        user.id,
        'wallet_address_set',
        user.id,
        {}
      );

      save();

      return json(res, 200, {
        ok: true
      });
    }

    if (
      req.method === 'POST' &&
      u.pathname === '/api/wallet/withdraw'
    ) {
      const user = requireAuth(req, res);

      if (!user) return;

      if (
        now() < db.meta.campaignEnd
      ) {
        return json(res, 423, {
          error: 'withdrawals_lo
