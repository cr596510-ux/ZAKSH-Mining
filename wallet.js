// wallet.js
// ZAKSH Wallet Module

const TON_ADDRESS_REGEX = /^(EQ|UQ)[A-Za-z0-9_-]{46,60}$/;

function ensureWalletState(user) {
  if (!user.wallet || typeof user.wallet !== "object") {
    user.wallet = {
      address: null,
      updatedAt: 0
    };
  }

  if (!Object.prototype.hasOwnProperty.call(user.wallet, "address")) {
    user.wallet.address = null;
  }

  if (!Object.prototype.hasOwnProperty.call(user.wallet, "updatedAt")) {
    user.wallet.updatedAt = 0;
  }
}

function isValidTonAddress(address) {
  if (typeof address !== "string") {
    return false;
  }

  const value = address.trim();

  return TON_ADDRESS_REGEX.test(value);
}

function setWalletAddress(user, address) {
  ensureWalletState(user);

  if (!isValidTonAddress(address)) {
    return {
      ok: false,
      code: "INVALID_TON_ADDRESS",
      message: "Invalid TON wallet address."
    };
  }

  const normalizedAddress = address.trim();

  user.wallet.address = normalizedAddress;
  user.wallet.updatedAt = Date.now();

  return {
    ok: true,
    address: normalizedAddress,
    updatedAt: user.wallet.updatedAt
  };
}

function getWalletAddress(user) {
  ensureWalletState(user);

  return user.wallet.address || null;
}

function getBalance(user) {
  return Number(user.balance || 0);
}

function getTokenPrice(config) {
  const price = Number(
    config && config.TOKEN_PRICE !== undefined
      ? config.TOKEN_PRICE
      : 0.13
  );

  return Number.isFinite(price) && price >= 0 ? price : 0.13;
}

function getUsdValue(user, config) {
  const balance = getBalance(user);
  const price = getTokenPrice(config);

  return balance * price;
}

function getCampaignEnd(config) {
  if (
    config &&
    config.CAMPAIGN_END &&
    Number.isFinite(Number(config.CAMPAIGN_END))
  ) {
    return Number(config.CAMPAIGN_END);
  }

  if (
    config &&
    config.CAMPAIGN_END_DATE &&
    !Number.isNaN(Date.parse(config.CAMPAIGN_END_DATE))
  ) {
    return Date.parse(config.CAMPAIGN_END_DATE);
  }

  return 0;
}

function isWithdrawalLocked(config) {
  const campaignEnd = getCampaignEnd(config);

  if (!campaignEnd) {
    return true;
  }

  return Date.now() < campaignEnd;
}

function getWithdrawalStatus(config) {
  const campaignEnd = getCampaignEnd(config);

  if (!campaignEnd) {
    return {
      locked: true,
      campaignEnd: null,
      remainingMs: null
    };
  }

  const remainingMs = Math.max(
    0,
    campaignEnd - Date.now()
  );

  return {
    locked: remainingMs > 0,
    campaignEnd,
    remainingMs
  };
}

function requestWithdrawal(user, amount, config) {
  ensureWalletState(user);

  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return {
      ok: false,
      code: "INVALID_AMOUNT",
      message: "Invalid withdrawal amount."
    };
  }

  if (isWithdrawalLocked(config)) {
    const status = getWithdrawalStatus(config);

    return {
      ok: false,
      code: "WITHDRAWAL_LOCKED",
      message: "Withdrawals are locked until the campaign ends.",
      campaignEnd: status.campaignEnd,
      remainingMs: status.remainingMs
    };
  }

  if (!user.wallet.address) {
    return {
      ok: false,
      code: "WALLET_NOT_SET",
      message: "TON wallet address is not set."
    };
  }

  if (numericAmount > getBalance(user)) {
    return {
      ok: false,
      code: "INSUFFICIENT_BALANCE",
      message: "Insufficient balance."
    };
  }

  /*
    Important:
    No balance is deducted here.

    The actual TON settlement must be performed by the
    owner-controlled withdrawal system after the campaign
    ends and the token contract is connected.
  */

  return {
    ok: false,
    code: "WITHDRAWAL_NOT_ENABLED",
    message: "Withdrawal settlement is not enabled yet."
  };
}

function getWalletStatus(user, config) {
  ensureWalletState(user);

  const withdrawal = getWithdrawalStatus(config);

  return {
    address: user.wallet.address,
    balance: getBalance(user),
    usdValue: getUsdValue(user, config),
    tokenPrice: getTokenPrice(config),

    withdrawalLocked: withdrawal.locked,
    campaignEnd: withdrawal.campaignEnd,
    remainingMs: withdrawal.remainingMs,

    withdrawalAvailable:
      !withdrawal.locked &&
      Boolean(user.wallet.address)
  };
}

function clearWalletAddress(user) {
  ensureWalletState(user);

  user.wallet.address = null;
  user.wallet.updatedAt = Date.now();

  return true;
}

module.exports = {
  TON_ADDRESS_REGEX,

  ensureWalletState,
  isValidTonAddress,

  setWalletAddress,
  getWalletAddress,

  getBalance,
  getTokenPrice,
  getUsdValue,

  getCampaignEnd,
  isWithdrawalLocked,
  getWithdrawalStatus,

  requestWithdrawal,
  getWalletStatus,

  clearWalletAddress
};
