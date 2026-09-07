'use strict';

/*
  ZAKSH - UI Module
  User App + Owner/Admin Panel
*/

const APP_NAME = 'ZAKSH';
const TOKEN_SYMBOL = 'ZKO';
const TOKEN_PRICE = 0.13;
const MINING_DURATION = 40;
const TASK_REWARD = 4;
const TASK_COOLDOWN_HOURS = 2;
const MINING_LIMIT = 2;
const MINING_WINDOW_HOURS = 6;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function formatUsd(value) {
  return '$' + Number(value || 0).toFixed(2);
}

function userPageHtml(user = {}) {
  const username = escapeHtml(
    user.username || 'ZAKSH User'
  );

  const balance = Number(user.balance || 0);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta
  name="viewport"
  content="width=device-width,
  initial-scale=1.0,
  maximum-scale=1.0,
  user-scalable=no"
/>

<title>ZAKSH</title>

<script src="https://telegram.org/js/telegram-web-app.js"></script>

<style>
* {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

html,
body {
  margin: 0;
  padding: 0;
  min-height: 100%;
  background: #050509;
  color: #fff;
  font-family:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

body {
  min-height: 100vh;
  overflow-x: hidden;
}

button {
  font: inherit;
}

.app {
  width: 100%;
  max-width: 520px;
  min-height: 100vh;
  margin: auto;
  padding-bottom: 92px;
}

.topbar {
  height: 70px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid rgba(255,255,255,.07);
  background: rgba(5,5,9,.94);
}

.logo {
  font-size: 24px;
  font-weight: 900;
  letter-spacing: 2px;
}

.logo span {
  color: #9d5cff;
}

.status {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #72ffb1;
  box-shadow: 0 0 15px #72ffb1;
}

.page {
  display: none;
  padding: 22px 18px;
}

.page.active {
  display: block;
}

.welcome {
  margin-top: 8px;
  color: #a8a8b5;
  font-size: 14px;
}

h1 {
  margin: 7px 0 20px;
  font-size: 28px;
}

.card {
  border: 1px solid rgba(157,92,255,.24);
  border-radius: 22px;
  padding: 20px;
  background:
    linear-gradient(
      145deg,
      rgba(30,20,50,.96),
      rgba(9,9,16,.96)
    );
  box-shadow:
    0 15px 50px rgba(0,0,0,.35),
    inset 0 0 35px rgba(157,92,255,.03);
}

.balance-card {
  text-align: center;
  margin-top: 15px;
}

.crystal {
  width: 105px;
  height: 125px;
  margin: 0 auto 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 75px;
  filter:
    drop-shadow(0 0 20px rgba(157,92,255,.8));
  animation: floatCrystal 3s ease-in-out infinite;
}

@keyframes floatCrystal {
  0%,100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-9px);
  }
}

.balance {
  font-size: 38px;
  font-weight: 900;
  letter-spacing: 1px;
}

.symbol {
  color: #a56aff;
  font-size: 15px;
  font-weight: 800;
}

.usd {
  margin-top: 7px;
  color: #92929e;
}

.program {
  margin-top: 15px;
}

.program-title {
  font-size: 17px;
  font-weight: 800;
}

.program-days {
  margin-top: 5px;
  color: #a56aff;
  font-weight: 700;
}

.countdown {
  margin-top: 18px;
  padding: 15px;
  border-radius: 15px;
  background: rgba(0,0,0,.25);
  text-align: center;
  font-size: 20px;
  font-weight: 900;
}

.primary {
  width: 100%;
  border: 0;
  border-radius: 16px;
  margin-top: 18px;
  padding: 15px;
  color: #fff;
  font-weight: 900;
  cursor: pointer;
  background:
    linear-gradient(135deg,#7d38df,#a45cff);
  box-shadow:
    0 10px 30px rgba(125,56,223,.28);
}

.primary:disabled {
  opacity: .45;
  cursor: not-allowed;
}

.secondary {
  width: 100%;
  border: 1px solid rgba(157,92,255,.3);
  border-radius: 15px;
  margin-top: 12px;
  padding: 14px;
  color: #fff;
  background: rgba(157,92,255,.08);
}

.mining-zone {
  position: relative;
  height: 430px;
  margin-top: 15px;
  overflow: hidden;
  border-radius: 25px;
  border: 1px solid rgba(157,92,255,.25);
  background:
    radial-gradient(
      circle at 50% 20%,
      rgba(130,65,220,.14),
      transparent 45%
    ),
    #08080e;
}

.mining-item {
  position: absolute;
  top: -50px;
  animation:
    fall linear forwards;
  user-select: none;
  pointer-events: none;
}

.crystal-item {
  font-size: 30px;
  filter: drop-shadow(0 0 12px rgba(160,90,255,.9));
}

.bomb-item {
  font-size: 25px;
  filter: drop-shadow(0 0 10px rgba(255,60,60,.8));
}

@keyframes fall {
  from {
    transform: translateY(0) rotate(0deg);
  }

  to {
    transform:
      translateY(500px)
      rotate(360deg);
  }
}

.timer {
  text-align: center;
  margin: 18px 0;
  font-size: 34px;
  font-weight: 900;
}

.task {
  padding: 17px;
  margin-bottom: 12px;
  border: 1px solid rgba(255,255,255,.07);
  border-radius: 18px;
  background: #0b0b12;
}

.task-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.task-name {
  font-weight: 800;
}

.task-reward {
  color: #a56aff;
  font-size: 13px;
  margin-top: 4px;
}

.task button {
  width: auto;
  min-width: 90px;
  margin: 0;
  padding: 10px 13px;
}

.task button.done {
  opacity: .45;
}

.wallet-address {
  word-break: break-all;
  color: #aaa;
  font-size: 13px;
  line-height: 1.7;
}

.lock {
  margin-top: 20px;
  padding: 18px;
  text-align: center;
  border-radius: 17px;
  background: rgba(255,175,70,.07);
  border: 1px solid rgba(255,175,70,.15);
}

.profile-row {
  display: flex;
  justify-content: space-between;
  gap: 15px;
  padding: 14px 0;
  border-bottom: 1px solid rgba(255,255,255,.06);
}

.profile-row:last-child {
  border-bottom: 0;
}

.label {
  color: #888894;
}

.value {
  text-align: right;
  font-weight: 800;
  max-width: 65%;
  overflow-wrap: anywhere;
}

.bottom-nav {
  position: fixed;
  z-index: 100;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: min(520px,100%);
  height: 78px;
  display: grid;
  grid-template-columns: repeat(5,1fr);
  padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
  background: rgba(8,8,13,.97);
  border-top: 1px solid rgba(255,255,255,.08);
  backdrop-filter: blur(18px);
}

.nav-btn {
  border: 0;
  background: transparent;
  color: #777783;
  font-size: 11px;
  font-weight: 700;
}

.nav-btn.active {
  color: #a55cff;
}

.nav-icon {
  display: block;
  margin-bottom: 4px;
  font-size: 21px;
}

.toast {
  position: fixed;
  z-index: 999;
  left: 50%;
  bottom: 95px;
  transform: translateX(-50%);
  width: calc(100% - 35px);
  max-width: 480px;
  padding: 13px 16px;
  border-radius: 14px;
  text-align: center;
  background: #17131f;
  border: 1px solid rgba(157,92,255,.35);
  display: none;
}

.toast.show {
  display: block;
}
</style>
</head>

<body>

<div class="app">

  <header class="topbar">
    <div class="logo">ZAK<span>SH</span></div>
    <div class="status"></div>
  </header>

  <!-- HOME -->

  <section
    id="page-home"
    class="page active"
  >
    <div class="welcome">
      Welcome back
    </div>

    <h1>${username}</h1>

    <div class="card balance-card">

      <div class="crystal">
        💎
      </div>

      <div class="balance">
        ${formatNumber(balance)}
      </div>

      <div class="symbol">
        ${TOKEN_SYMBOL}
      </div>

      <div class="usd">
        ${formatUsd(balance * TOKEN_PRICE)}
      </div>

      <div class="program">
        <div class="program-title">
          48 Days Mining Program
        </div>

        <div class="program-days">
          Earn ZAKSH every day
        </div>
      </div>

      <div
        id="home-countdown"
        class="countdown"
      >
        Loading...
      </div>

      <button
        class="primary"
        onclick="openPage('mining')"
      >
        Start Mining
      </button>

    </div>
  </section>

  <!-- MINING -->

  <section
    id="page-mining"
    class="page"
  >
    <h1>Mining</h1>

    <div class="card">

      <div
        id="mining-timer"
        class="timer"
      >
        40s
      </div>

      <div
        id="mining-zone"
        class="mining-zone"
      ></div>

      <button
        id="mine-button"
        class="primary"
        onclick="startMining()"
      >
        Start Mining
      </button>

      <div
        id="mining-status"
        class="welcome"
        style="text-align:center;margin-top:12px;"
      >
        Maximum 2 mining sessions every 6 hours.
      </div>

    </div>
  </section>

  <!-- TASKS -->

  <section
    id="page-tasks"
    class="page"
  >
    <h1>Tasks</h1>

    <div id="tasks-container">

      <div class="task">
        <div class="task-row">
          <div>
            <div class="task-name">
              Join Channel
            </div>

            <div class="task-reward">
              +4 ZKO
            </div>
          </div>

          <button
            class="primary"
            onclick="runTask('join_channel')"
          >
            Join
          </button>
        </div>
      </div>

      <div class="task">
        <div class="task-row">
          <div>
            <div class="task-name">
              React to Channel
            </div>

            <div class="task-reward">
              +4 ZKO
            </div>
          </div>

          <button
            class="primary"
            onclick="runTask('react_channel')"
          >
            React
          </button>
        </div>
      </div>

      <div class="task">
        <div class="task-row">
          <div>
            <div class="task-name">
              Watch Ad
            </div>

            <div class="task-reward">
              +4 ZKO
            </div>
          </div>

          <button
            class="primary"
            onclick="runTask('watch_ad')"
          >
            Watch
          </button>
        </div>
      </div>

      <div class="task">
        <div class="task-row">
          <div>
            <div class="task-name">
              Invite Friends
            </div>

            <div class="task-reward">
              +4 ZKO
            </div>
          </div>

          <button
            class="primary"
            onclick="runTask('invite_friends')"
          >
            Invite
          </button>
        </div>
      </div>

    </div>
  </section>

  <!-- WALLET -->

  <section
    id="page-wallet"
    class="page"
  >
    <h1>Wallet</h1>

    <div class="card">

      <div class="label">
        Your ZAKSH Balance
      </div>

      <div
        id="wallet-balance"
        class="balance"
        style="margin-top:8px;"
      >
        ${formatNumber(balance)}
      </div>

      <div class="symbol">
        ZKO
      </div>

      <div
        id="wallet-usd"
        class="usd"
      >
        ${formatUsd(balance * TOKEN_PRICE)}
      </div>

      <div style="margin-top:25px;">
        <div class="label">
          TON Wallet
        </div>

        <div
          id="wallet-address"
          class="wallet-address"
          style="margin-top:8px;"
        >
          Not connected
        </div>
      </div>

      <button
        class="secondary"
        onclick="connectWallet()"
      >
        Set TON Wallet
      </button>

      <div class="lock">

        <div style="font-size:24px;">
          🔒
        </div>

        <div
          style="
            margin-top:8px;
            font-weight:900;
          "
        >
          Withdraw is Locked
        </div>

        <div
          id="wallet-countdown"
          class="welcome"
        >
          Loading...
        </div>

      </div>

    </div>
  </section>

  <!-- PROFILE -->

  <section
    id="page-profile"
    class="page"
  >
    <h1>Profile</h1>

    <div class="card">

      <div class="profile-row">
        <div class="label">User</div>
        <div
          id="profile-user"
          class="value"
        >
          ${username}
        </div>
      </div>

      <div class="profile-row">
        <div class="label">Telegram ID</div>
        <div
          id="profile-id"
          class="value"
        >
          ${escapeHtml(user.id || '-')}
        </div>
      </div>

      <div class="profile-row">
        <div class="label">Referral Link</div>
        <div
          id="profile-referral"
          class="value"
        >
          Loading...
        </div>
      </div>

      <div class="profile-row">
        <div class="label">Referrals</div>
        <div
          id="profile-referrals"
          class="value"
        >
          0
        </div>
      </div>

      <div class="profile-row">
        <div class="label">Total Earned</div>
        <div
          id="profile-earned"
          class="value"
        >
          0 ZKO
        </div>
      </div>

      <div class="profile-row">
        <div class="label">Mining Rounds</div>
        <div
          id="profile-mining"
          class="value"
        >
          0
        </div>
      </div>

      <div class="profile-row">
        <div class="label">Tasks Completed</div>
        <div
          id="profile-tasks"
          class="value"
        >
          0
        </div>
      </div>

    </div>
  </section>

</div>

<!-- BOTTOM NAV -->

<nav class="bottom-nav">

  <button
    class="nav-btn active"
    data-page="home"
    onclick="openPage('home')"
  >
    <span class="nav-icon">⌂</span>
    Home
  </button>

  <button
    class="nav-btn"
    data-page="mining"
    onclick="openPage('mining')"
  >
    <span class="nav-icon">💎</span>
    Mining
  </button>

  <button
    class="nav-btn"
    data-page="tasks"
    onclick="openPage('tasks')"
  >
    <span class="nav-icon">✓</span>
    Tasks
  </button>

  <button
    class="nav-btn"
    data-page="wallet"
    onclick="openPage('wallet')"
  >
    <span class="nav-icon">◈</span>
    Wallet
  </button>

  <button
    class="nav-btn"
    data-page="profile"
    onclick="openPage('profile')"
  >
    <span class="nav-icon">●</span>
    Profile
  </button>

</nav>

<div
  id="toast"
  class="toast"
></div>

<script>
'use strict';

const tg =
  window.Telegram &&
  window.Telegram.WebApp
    ? window.Telegram.WebApp
    : null;

if (tg) {
  tg.ready();
  tg.expand();
}

let currentMiningSession = null;
let miningInterval = null;
let miningAnimation = null;

function toast(message) {
  const el =
    document.getElementById('toast');

  el.textContent = message;
  el.classList.add('show');

  setTimeout(() => {
    el.classList.remove('show');
  }, 3000);
}

function openPage(page) {

  document
    .querySelectorAll('.page')
    .forEach((element) => {
      element.classList.remove('active');
    });

  const target =
    document.getElementById(
      'page-' + page
    );

  if (target) {
    target.classList.add('active');
  }

  document
    .querySelectorAll('.nav-btn')
    .forEach((button) => {
      button.classList.toggle(
        'active',
        button.dataset.page === page
      );
    });

  if (page === 'wallet') {
    loadWallet();
  }

  if (page === 'profile') {
    loadProfile();
  }
}

async function api(path, options = {}) {

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const initData =
    tg && tg.initData
      ? tg.initData
      : '';

  if (initData) {
    headers['X-Telegram-Init-Data'] =
      initData;
  }

  const response =
    await fetch(path, {
      ...options,
      headers
    });

  let data = null;

  try {
    data = await response.json();
  } catch (_) {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
      data.error ||
      'Request failed'
    );
  }

  return data;
}

function updateBalance(balance) {

  const amount =
    Number(balance || 0);

  const balanceElements =
    document.querySelectorAll(
      '.balance'
    );

  balanceElements.forEach((el) => {
    el.textContent =
      amount.toLocaleString('en-US');
  });

  const usd =
    document.getElementById(
      'wallet-usd'
    );

  if (usd) {
    usd.textContent =
      '$' + (amount * ${TOKEN_PRICE}).toFixed(2);
  }
}

async function refreshMe() {

  try {

    const data =
      await api('/api/me');

    if (
      data &&
      data.user
    ) {
      updateBalance(
        data.user.balance
      );
    }

  } catch (error) {
    console.error(error);
  }
}

function createMiningItems() {

  const zone =
    document.getElementById(
      'mining-zone'
    );

  if (!zone) return;

  const itemCount = 20;

  for (
    let i = 0;
    i < itemCount;
    i++
  ) {

    const item =
      document.createElement('div');

    const bomb =
      Math.random() < 0.10;

    item.className =
      'mining-item ' +
      (
        bomb
          ? 'bomb-item'
          : 'crystal-item'
      );

    item.textContent =
      bomb ? '💣' : '💎';

    item.style.left =
      (
        Math.random() * 92 + 2
      ) + '%';

    item.style.animationDuration =
      (
        3.5 + Math.random() * 2.5
      ) + 's';

    item.style.animationDelay =
      (
        Math.random() * 1.8
      ) + 's';

    zone.appendChild(item);
  }
}

function clearMiningAnimation() {

  if (miningAnimation) {
    clearTimeout(
      miningAnimation
    );

    miningAnimation = null;
  }

  const zone =
    document.getElementById(
      'mining-zone'
    );

  if (zone) {
    zone.innerHTML = '';
  }
}

async function startMining() {

  const button =
    document.getElementById(
      'mine-button'
    );

  if (!button) return;

  button.disabled = true;

  try {

    const data =
      await api(
        '/api/mining/start',
        {
          method: 'POST'
        }
      );

    if (
      !data ||
      !data.sessionId
    ) {
      throw new Error(
        data.message ||
        'Mining could not start'
      );
    }

    currentMiningSession =
      data.sessionId;

    clearMiningAnimation();
    createMiningItems();

    let remaining = ${MINING_DURATION};

    const timer =
      document.getElementById(
        'mining-timer'
      );

    if (timer) {
      timer.textContent =
        remaining + 's';
    }

    if (miningInterval) {
      clearInterval(
        miningInterval
      );
    }

    miningInterval =
      setInterval(() => {

        remaining--;

        if (timer) {
          timer.textContent =
            Math.max(
              0,
              remaining
            ) + 's';
        }

        if (remaining <= 0) {

          clearInterval(
            miningInterval
          );

          miningInterval = null;

          claimMining();

        }

      }, 1000);

  } catch (error) {

    button.disabled = false;

    toast(
      error.message ||
      'Mining unavailable'
    );
  }
}

async function claimMining() {

  const button =
    document.getElementById(
      'mine-button'
    );

  try {

    const data =
      await api(
        '/api/mining/claim',
        {
          method: 'POST',
          body: JSON.stringify({
            sessionId:
              currentMiningSession
          })
        }
      );

    currentMiningSession = null;

    clearMiningAnimation();

    if (data.balance !== undefined) {
      updateBalance(
        data.balance
      );
    }

    toast(
      '+' +
      Number(
        data.reward || 0
      ).toLocaleString('en-US') +
      ' ZKO earned'
    );

  } catch (error) {

    toast(
      error.message ||
      'Mining claim failed'
    );

  } finally {

    if (button) {
      button.disabled = false;
    }

  }
}

async function runTask(taskId) {

  try {

    if (
      taskId ===
      'watch_ad'
    ) {

      await watchAd();

      return;
    }

    const data =
      await api(
        '/api/tasks/' +
        encodeURIComponent(taskId),
        {
          method: 'POST'
        }
      );

    if (
      data &&
      data.balance !== undefined
    ) {
      updateBalance(
        data.
