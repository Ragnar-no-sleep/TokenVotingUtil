require("dotenv").config();

const { Connection, PublicKey } = require("@solana/web3.js");
const { getAssociatedTokenAddress, getAccount, getMint } = require("@solana/spl-token");
const { getCache, setCache, getAllNames, setName } = require("./db");

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const TOKEN_MINT = process.env.TOKEN_MINT || "9zB5wRarXMj86MymwLumSKA1Dx35zPqqKfcZtK1Spump";
const CACHE_TTL = (parseInt(process.env.CACHE_TTL_SECONDS, 10) || 300) * 1000;
const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS, 10) || 6;

let client = null;
let nameOverrides = {};
let memoryCache = { data: null, timestamp: 0 };
let refreshing = false;

// --- SPL token balance queries ---

const balanceCache = new Map(); // wallet -> { balance, timestamp }
const BALANCE_CACHE_TTL = 30000; // 30s
let totalSupplyCache = { value: 0, timestamp: 0 };
const SUPPLY_CACHE_TTL = 300000; // 5 min

function getSolanaConnection() {
  return new Connection(SOLANA_RPC_URL);
}

async function getWalletTokenBalance(walletAddress) {
  const cached = balanceCache.get(walletAddress);
  if (cached && Date.now() - cached.timestamp < BALANCE_CACHE_TTL) {
    return cached.balance;
  }
  try {
    const connection = getSolanaConnection();
    const wallet = new PublicKey(walletAddress);
    const mint = new PublicKey(TOKEN_MINT);
    const ata = await getAssociatedTokenAddress(mint, wallet);
    const account = await getAccount(connection, ata);
    const balance = Number(account.amount) / (10 ** TOKEN_DECIMALS);
    balanceCache.set(walletAddress, { balance, timestamp: Date.now() });
    return balance;
  } catch (e) {
    // Token account doesn't exist — wallet has never held this token
    balanceCache.set(walletAddress, { balance: 0, timestamp: Date.now() });
    return 0;
  }
}

async function getTokenTotalSupply() {
  if (totalSupplyCache.value > 0 && Date.now() - totalSupplyCache.timestamp < SUPPLY_CACHE_TTL) {
    return totalSupplyCache.value;
  }
  try {
    const connection = getSolanaConnection();
    const mint = new PublicKey(TOKEN_MINT);
    const mintInfo = await getMint(connection, mint);
    const supply = Number(mintInfo.supply) / (10 ** TOKEN_DECIMALS);
    totalSupplyCache = { value: supply, timestamp: Date.now() };
    return supply;
  } catch (e) {
    console.error("Failed to fetch token supply:", e.message);
    return totalSupplyCache.value || 0;
  }
}

async function getClient() {
  if (client) return client;
  const { SolanaStreamClient } = await import("@streamflow/stream");
  client = new SolanaStreamClient(SOLANA_RPC_URL);
  return client;
}

// --- DB persistence ---

async function loadFromDb() {
  try {
    const cached = await getCache("lockData");
    if (cached && cached.data) {
      memoryCache = cached;
      const ageSec = Math.round((Date.now() - cached.timestamp) / 1000);
      console.log(`Loaded cache from database (age: ${ageSec}s)`);
    }
  } catch (err) {
    console.error("Failed to load cache from DB:", err.message);
  }
}

async function saveToDb() {
  try {
    await setCache("lockData", memoryCache.data);
  } catch (err) {
    console.error("Failed to save cache to DB:", err.message);
  }
}

async function loadNamesFromDb() {
  try {
    nameOverrides = await getAllNames();
    console.log(`Loaded ${Object.keys(nameOverrides).length} name override(s)`);
  } catch (err) {
    console.error("Failed to load names from DB:", err.message);
    nameOverrides = {};
  }
}

async function setLockName(lockId, name) {
  nameOverrides[lockId] = name;
  await setName(lockId, name);
}

function removeLockName(lockId) {
  delete nameOverrides[lockId];
}

// --- BN / schedule helpers ---

function bnToNumber(bn, decimals) {
  if (!bn) return 0;
  const str = bn.toString();
  if (str.length <= decimals) {
    return parseFloat("0." + str.padStart(decimals, "0"));
  }
  const whole = str.slice(0, str.length - decimals);
  const frac = str.slice(str.length - decimals);
  return parseFloat(whole + "." + frac);
}

function buildUnlockSchedule(account, decimals) {
  const schedule = [];
  const start = Number(account.start);
  const end = Number(account.end);
  const cliff = Number(account.cliff);
  const period = Number(account.period);
  const totalAmount = bnToNumber(account.depositedAmount, decimals);
  const cliffAmount = bnToNumber(account.cliffAmount, decimals);
  const amountPerPeriod = bnToNumber(account.amountPerPeriod, decimals);

  if (period <= 0 || amountPerPeriod <= 0) {
    schedule.push({
      date: new Date(end * 1000).toISOString(),
      amount: totalAmount,
      cumulative: totalAmount,
    });
    return schedule;
  }

  let cumulative = 0;
  const scheduleStart = cliff > start ? cliff : start;

  if (cliff > 0 && cliffAmount > 0) {
    cumulative += cliffAmount;
    schedule.push({
      date: new Date(cliff * 1000).toISOString(),
      amount: cliffAmount,
      cumulative,
    });
  }

  let t = scheduleStart + period;
  while (t <= end && cumulative < totalAmount) {
    const unlockAmt = Math.min(amountPerPeriod, totalAmount - cumulative);
    cumulative += unlockAmt;
    schedule.push({
      date: new Date(t * 1000).toISOString(),
      amount: unlockAmt,
      cumulative,
    });
    t += period;
  }

  if (schedule.length > 0 && schedule[schedule.length - 1].cumulative < totalAmount) {
    var diff = totalAmount - schedule[schedule.length - 1].cumulative;
    schedule[schedule.length - 1].amount += diff;
    schedule[schedule.length - 1].cumulative = totalAmount;
  }

  return schedule;
}

function transformStream(publicKey, account, decimals) {
  const totalAmount = bnToNumber(account.depositedAmount, decimals);
  const withdrawn = bnToNumber(account.withdrawnAmount, decimals);
  const nowSec = Math.floor(Date.now() / 1000);
  const start = Number(account.start);
  const end = Number(account.end);

  let unlocked = 0;
  if (nowSec >= end) {
    unlocked = totalAmount;
  } else if (nowSec > start) {
    if (typeof account.unlocked === "function") {
      unlocked = bnToNumber(account.unlocked(nowSec), decimals);
    } else {
      const cliff = Number(account.cliff);
      const period = Number(account.period);
      const cliffAmount = bnToNumber(account.cliffAmount, decimals);
      const amountPerPeriod = bnToNumber(account.amountPerPeriod, decimals);
      if (nowSec >= cliff && cliff > 0) {
        unlocked += cliffAmount;
      }
      if (period > 0) {
        const scheduleStart = cliff > start ? cliff : start;
        const elapsed = nowSec - scheduleStart;
        const periods = Math.floor(elapsed / period);
        unlocked += periods * amountPerPeriod;
      }
      unlocked = Math.min(unlocked, totalAmount);
    }
  }

  const locked = totalAmount - unlocked;

  let status;
  if (account.canceledAt && Number(account.canceledAt) > 0) {
    status = "cancelled";
  } else if (nowSec >= end) {
    status = "fully_unlocked";
  } else if (nowSec < start) {
    status = "pending";
  } else {
    status = "vesting";
  }

  const unlockSchedule = buildUnlockSchedule(account, decimals);
  const id = typeof publicKey === "string" ? publicKey : publicKey.toBase58();

  return {
    id,
    contractName: (account.name || "").replace(/\0/g, "").trim() || "Unnamed Lock",
    sender: account.sender || "",
    recipient: account.recipient || "",
    totalAmount,
    withdrawn,
    unlocked,
    locked,
    startDate: new Date(start * 1000).toISOString(),
    endDate: new Date(end * 1000).toISOString(),
    cliffDate: Number(account.cliff) > 0 ? new Date(Number(account.cliff) * 1000).toISOString() : null,
    cliffAmount: bnToNumber(account.cliffAmount, decimals),
    period: Number(account.period),
    amountPerPeriod: bnToNumber(account.amountPerPeriod, decimals),
    status,
    cancelable: !!(account.cancelableBySender || account.cancelableByRecipient),
    transferable: !!(account.transferableBySender || account.transferableByRecipient),
    unlockSchedule,
  };
}

function buildMergedTimeline(locks) {
  const events = [];
  for (const lock of locks) {
    for (const evt of lock.unlockSchedule) {
      events.push({ date: evt.date, amount: evt.amount });
    }
  }

  events.sort((a, b) => new Date(a.date) - new Date(b.date));

  const merged = [];
  let cumulative = 0;
  for (const evt of events) {
    if (merged.length > 0 && merged[merged.length - 1].date === evt.date) {
      merged[merged.length - 1].amount += evt.amount;
      cumulative = merged[merged.length - 1].cumulative + evt.amount;
      merged[merged.length - 1].cumulative = cumulative;
    } else {
      cumulative += evt.amount;
      merged.push({ date: evt.date, amount: evt.amount, cumulative });
    }
  }

  return merged;
}

// --- Core fetch + background refresh ---

async function refreshData() {
  if (refreshing) return;
  refreshing = true;

  try {
    console.log("Fetching lock data from Streamflow...");
    const streamClient = await getClient();

    const result = await streamClient.searchStreams({ mint: TOKEN_MINT });
    const streams = Array.isArray(result) ? result : [];

    console.log(`Found ${streams.length} stream(s) for mint ${TOKEN_MINT}`);

    const locks = streams.map((s) => {
      const pk = s.publicKey || s.id || "unknown";
      const account = s.account || s;
      return transformStream(pk, account, TOKEN_DECIMALS);
    });

    const totalLockedTokens = locks.reduce((sum, l) => sum + l.locked, 0);
    const totalDepositedTokens = locks.reduce((sum, l) => sum + l.totalAmount, 0);
    const activeLocks = locks.filter((l) => l.status === "vesting" || l.status === "pending").length;
    const now = new Date();

    let nextUnlockDate = null;
    let nextUnlockAmount = 0;
    for (const lock of locks) {
      for (const evt of lock.unlockSchedule) {
        const evtDate = new Date(evt.date);
        if (evtDate > now && (!nextUnlockDate || evtDate < new Date(nextUnlockDate))) {
          nextUnlockDate = evt.date;
          nextUnlockAmount = evt.amount;
        }
      }
    }

    const timeline = buildMergedTimeline(locks);

    const totalSupply = await getTokenTotalSupply();

    const data = {
      summary: {
        totalLockedTokens,
        totalDepositedTokens,
        activeLocks,
        totalLocks: locks.length,
        nextUnlockDate,
        nextUnlockAmount,
        totalSupply,
        tokenMint: TOKEN_MINT,
        lastUpdated: new Date().toISOString(),
      },
      locks,
      timeline,
    };

    memoryCache = { data, timestamp: Date.now() };
    await saveToDb();
    console.log("Cache refreshed successfully");
  } catch (err) {
    console.error("Refresh failed:", err.message);
    // Keep serving stale data if available
  } finally {
    refreshing = false;
  }
}

async function startBackgroundRefresh() {
  // Load persisted data from database (instant data on cold start)
  await loadFromDb();
  await loadNamesFromDb();

  // Trigger first refresh right away
  refreshData();

  // Then refresh on interval
  setInterval(refreshData, CACHE_TTL);
  console.log(`Background refresh started (every ${CACHE_TTL / 1000}s)`);
}

function applyNameOverrides(data) {
  if (!data || !data.locks) return data;
  const result = { ...data, locks: data.locks.map(function (lock) {
    const override = nameOverrides[lock.id];
    if (override) return { ...lock, contractName: override };
    return lock;
  })};
  return result;
}

async function fetchLockData() {
  // Return from memory cache instantly if available
  if (memoryCache.data) {
    return applyNameOverrides(memoryCache.data);
  }

  // No cached data at all (first cold start) — do a blocking fetch
  await refreshData();

  if (memoryCache.data) {
    return applyNameOverrides(memoryCache.data);
  }

  throw new Error("No lock data available yet — please try again shortly");
}

module.exports = { fetchLockData, startBackgroundRefresh, refreshData, setLockName, removeLockName, getWalletTokenBalance };
