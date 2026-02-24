require("dotenv").config();
const logger = require("./logger");

const express = require("express");
const cors = require("cors");
const path = require("path");
const { fetchLockData, startBackgroundRefresh, refreshData, setLockName, removeLockName, getWalletTokenBalance } = require("./streamflow");
const {
  initDb, createProposal, getAllProposals, getProposal, hasVoted, insertVote,
  deleteProposal, closeProposalEarly, deleteVote, deleteName, getStats,
  getAllNames, setName,
} = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const SITE_TITLE = process.env.SITE_TITLE || "ASDelegate";

// Simple in-memory rate limiter (per IP)
const rateLimits = new Map();
function rateLimit(windowMs, maxRequests) {
  return (req, res, next) => {
    const key = (req.ip || "unknown") + ":" + req.path;
    const now = Date.now();
    let entry = rateLimits.get(key);
    if (!entry || now - entry.start > windowMs) {
      entry = { start: now, count: 0 };
      rateLimits.set(key, entry);
    }
    entry.count++;
    if (entry.count > maxRequests) {
      return res.status(429).json({ error: "Too many requests, please try again later" });
    }
    next();
  };
}
// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits) {
    if (now - entry.start > 600000) rateLimits.delete(key);
  }
}, 300000);

// Allow iframe embedding from any origin
// CORS and CSP middleware with origin allowlist
const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:5173";
const ALLOWED_ORIGINS = allowedOriginsEnv.split(",").map(o => o.trim());

if (!ALLOWED_ORIGINS || ALLOWED_ORIGINS.length === 0) {
  logger.error("ERROR: ALLOWED_ORIGINS env var not configured");
  process.exit(1);
}

app.use((req, res, next) => {
  const frameSources = ALLOWED_ORIGINS.join(" ");
  res.setHeader("Content-Security-Policy", "frame-ancestors " + frameSources);
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

// CORS — allow all origins for iframe/fetch from Squarespace
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS not allowed"));
    }
  },
  methods: ["GET", "POST", "DELETE"],
  credentials: true,
  maxAge: 86400
}));

// Parse JSON request bodies (limit payload size)
app.use(express.json({ limit: "16kb" }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, "public")));

// API: Fetch lock data
app.get("/api/locks", async (req, res) => {
  try {
    const data = await fetchLockData();
    res.json(data);
  } catch (error) {
    logger.error("Error fetching lock data:", error);
    res.status(503).json({
      error: "Failed to fetch lock data",
      message: error.message,
    });
  }
});

// Manual refresh trigger (1 per 30s per IP)
app.post("/api/refresh", rateLimit(30000, 1), async (req, res) => {
  try {
    await refreshData();
    const data = await fetchLockData();
    res.json(data);
  } catch (error) {
    logger.error("Manual refresh failed:", error);
    res.status(503).json({ error: "Refresh failed", message: error.message });
  }
});

// Rename a lock (owner-only, 5 per minute per IP)
app.post("/api/locks/:id/name", rateLimit(60000, 5), async (req, res) => {
  try {
    const lockId = req.params.id;
    const { wallet, name } = req.body;

    if (!wallet || typeof wallet !== "string") {
      return res.status(400).json({ error: "Missing wallet address" });
    }
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: "Missing or empty name" });
    }
    if (name.trim().length > 64) {
      return res.status(400).json({ error: "Name too long (max 64 characters)" });
    }

    // Verify wallet owns this lock
    const data = await fetchLockData();
    const lock = data.locks.find((l) => l.id === lockId);
    if (!lock) {
      return res.status(404).json({ error: "Lock not found" });
    }
    if (lock.sender !== wallet && lock.recipient !== wallet) {
      return res.status(403).json({ error: "Only the sender or recipient can rename a lock" });
    }

    await setLockName(lockId, name.trim());
    res.json({ success: true, id: lockId, name: name.trim() });
  } catch (error) {
    logger.error("Rename failed:", error);
    res.status(500).json({ error: "Rename failed", message: error.message });
  }
});

// Wallet SPL token balance (10 per minute per IP)
app.get("/api/wallet/:address/balance", rateLimit(60000, 10), async (req, res) => {
  try {
    const address = req.params.address;
    if (!address || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }
    const balance = await getWalletTokenBalance(address);
    res.json({ balance });
  } catch (error) {
    logger.error("Wallet balance fetch failed:", error);
    res.status(500).json({ error: "Failed to fetch balance", message: error.message });
  }
});

// List all proposals with vote data
app.get("/api/proposals", async (req, res) => {
  try {
    const proposals = await getAllProposals();
    res.json({ proposals });
  } catch (error) {
    logger.error("Error fetching proposals:", error);
    res.status(500).json({ error: "Failed to fetch proposals", message: error.message });
  }
});

// Create a new proposal (lock-holder only, 3 per minute per IP)
app.post("/api/proposals", rateLimit(60000, 3), async (req, res) => {
  try {
    const { wallet, title, description, choices, threshold, duration, voteMode } = req.body;

    if (!wallet || typeof wallet !== "string") {
      return res.status(400).json({ error: "Missing wallet address" });
    }
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return res.status(400).json({ error: "Missing or empty title" });
    }
    if (title.trim().length > 120) {
      return res.status(400).json({ error: "Title too long (max 120 characters)" });
    }

    const desc = (description && typeof description === "string") ? description.trim() : "";
    if (desc.length > 500) {
      return res.status(400).json({ error: "Description too long (max 500 characters)" });
    }

    if (!Array.isArray(choices) || choices.length < 2 || choices.length > 4) {
      return res.status(400).json({ error: "Must provide 2-4 choices" });
    }
    for (let i = 0; i < choices.length; i++) {
      if (!choices[i] || typeof choices[i] !== "string" || choices[i].trim().length === 0) {
        return res.status(400).json({ error: "Choice " + (i + 1) + " is empty" });
      }
      if (choices[i].trim().length > 80) {
        return res.status(400).json({ error: "Choice " + (i + 1) + " too long (max 80 characters)" });
      }
    }

    const mode = voteMode === "all" ? "all" : "locked";
    const validThresholds = mode === "all" ? [10, 15, 25] : [2.5, 5, 10];
    if (typeof threshold !== "number" || !validThresholds.includes(threshold)) {
      return res.status(400).json({ error: "Invalid threshold (must be " + validThresholds.join(", ") + ")" });
    }

    const durationDays = { "1d": 1, "3d": 3, "1w": 7, "2w": 14 };
    if (!duration || !durationDays[duration]) {
      return res.status(400).json({ error: "Invalid duration (must be 1d, 3d, 1w, or 2w)" });
    }

    const data = await fetchLockData();
    const hasLock = data.locks.some((l) => l.sender === wallet || l.recipient === wallet);
    if (!hasLock) {
      return res.status(403).json({ error: "Only wallets with locks can create proposals" });
    }

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const trimmedChoices = choices.map((c) => c.trim());
    const endsAt = new Date(Date.now() + durationDays[duration] * 24 * 60 * 60 * 1000);

    await createProposal(id, title.trim(), desc, trimmedChoices, wallet, threshold, endsAt, mode);
    res.json({ success: true, id });
  } catch (error) {
    logger.error("Create proposal failed:", error);
    res.status(500).json({ error: "Failed to create proposal", message: error.message });
  }
});

// Vote on a proposal (lock-holder only, 10 per minute per IP)
app.post("/api/proposals/:id/vote", rateLimit(60000, 10), async (req, res) => {
  try {
    const proposalId = req.params.id;
    const { wallet, choiceIndex } = req.body;

    if (!wallet || typeof wallet !== "string") {
      return res.status(400).json({ error: "Missing wallet address" });
    }
    if (typeof choiceIndex !== "number" || !Number.isInteger(choiceIndex) || choiceIndex < 0) {
      return res.status(400).json({ error: "Invalid choice index" });
    }

    const proposal = await getProposal(proposalId);
    if (!proposal) {
      return res.status(404).json({ error: "Proposal not found" });
    }

    if (new Date(proposal.ends_at) < new Date()) {
      return res.status(403).json({ error: "Voting period has ended" });
    }

    const alreadyVoted = await hasVoted(proposalId, wallet);
    if (alreadyVoted) {
      return res.status(409).json({ error: "You have already voted on this proposal" });
    }

    const choices = proposal.choices;
    if (choiceIndex >= choices.length) {
      return res.status(400).json({ error: "Choice index out of range" });
    }

    const data = await fetchLockData();
    const useAll = proposal.vote_mode === "all";
    let votingPower;
    if (useAll) {
      const walletBalance = await getWalletTokenBalance(wallet);
      const inContractTokens = data.locks.reduce((sum, l) => {
        if (l.sender === wallet || l.recipient === wallet) {
          return sum + (l.totalAmount - l.withdrawn);
        }
        return sum;
      }, 0);
      votingPower = walletBalance + inContractTokens;
    } else {
      votingPower = data.locks.reduce((sum, l) => {
        if (l.sender === wallet || l.recipient === wallet) {
          return sum + l.locked;
        }
        return sum;
      }, 0);
    }

    if (votingPower <= 0) {
      return res.status(403).json({ error: useAll ? "No voting power (no tokens found for this wallet)" : "No voting power (no locked tokens found for this wallet)" });
    }

    await insertVote(proposalId, wallet, choiceIndex, votingPower);
    res.json({ success: true, votingPower });
  } catch (error) {
    logger.error("Vote failed:", error);
    res.status(500).json({ error: "Vote failed", message: error.message });
  }
});

// ===== ADMIN PANEL =====
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: "Admin panel is not configured" });
  }
  const key = req.headers["x-admin-key"];
  if (!key || key !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid admin password" });
  }
  next();
}

// Verify admin password
app.post("/api/admin/auth", rateLimit(60000, 10), (req, res) => {
  const { password } = req.body;
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: "Admin panel is not configured" });
  }
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid password" });
  }
  res.json({ success: true });
});

// Admin: system stats
app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  try {
    const stats = await getStats();
    const data = await fetchLockData().catch(() => null);
    stats.lockCount = data ? data.locks.length : 0;
    stats.totalLocked = data ? data.summary.totalLockedTokens : 0;
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stats", message: error.message });
  }
});

// Admin: list all lock name overrides
app.get("/api/admin/names", requireAdmin, async (req, res) => {
  try {
    const names = await getAllNames();
    res.json({ names });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch names", message: error.message });
  }
});

// Admin: rename any lock (no ownership check)
app.post("/api/admin/locks/:id/name", requireAdmin, async (req, res) => {
  try {
    const lockId = req.params.id;
    const { name } = req.body;
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: "Missing or empty name" });
    }
    if (name.trim().length > 64) {
      return res.status(400).json({ error: "Name too long (max 64 characters)" });
    }
    await setLockName(lockId, name.trim());
    res.json({ success: true, id: lockId, name: name.trim() });
  } catch (error) {
    res.status(500).json({ error: "Rename failed", message: error.message });
  }
});

// Admin: remove a lock name override
app.delete("/api/admin/locks/:id/name", requireAdmin, async (req, res) => {
  try {
    const lockId = req.params.id;
    await deleteName(lockId);
    removeLockName(lockId);
    res.json({ success: true, id: lockId });
  } catch (error) {
    res.status(500).json({ error: "Delete name failed", message: error.message });
  }
});

// Admin: delete a proposal and all its votes
app.delete("/api/admin/proposals/:id", requireAdmin, async (req, res) => {
  try {
    await deleteProposal(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Delete proposal failed", message: error.message });
  }
});

// Admin: close a proposal early
app.post("/api/admin/proposals/:id/close", requireAdmin, async (req, res) => {
  try {
    await closeProposalEarly(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Close proposal failed", message: error.message });
  }
});

// Admin: remove a specific vote
app.delete("/api/admin/votes/:proposalId/:wallet", requireAdmin, async (req, res) => {
  try {
    await deleteVote(req.params.proposalId, req.params.wallet);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Delete vote failed", message: error.message });
  }
});

// Admin: force data refresh
app.post("/api/admin/refresh", requireAdmin, async (req, res) => {
  try {
    await refreshData();
    const data = await fetchLockData();
    res.json({ success: true, lockCount: data.locks.length });
  } catch (error) {
    res.status(500).json({ error: "Refresh failed", message: error.message });
  }
});

// Public config (title, branding)
app.get("/api/config", (req, res) => {
  res.json({ siteTitle: SITE_TITLE });
});

// Health check (Render uses this)
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, async () => {
  logger.info(`${SITE_TITLE} running on port ${PORT}`);
  await initDb();
  await startBackgroundRefresh();
});
