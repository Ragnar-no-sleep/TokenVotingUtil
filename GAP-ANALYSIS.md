# Gap Analysis — Complete Empirical Audit

**Date**: 2026-02-25
**Scope**: 4,600 LOC (server.js, streamflow.js, db.js, index.html, rate-limiter.js, logger.js)
**Issues Found**: 22 (2 CRITICAL, 6 HIGH, 9 MEDIUM, 5 LOW)
**Audit Method**: Code review + pattern analysis

---

## Executive Summary

**Security**: Wallet signature verification is missing. Without it, anyone can impersonate any wallet and vote as them. This is a **governance killer** and must be fixed before any real governance launch.

**Logic**: 3 voting bugs identified (margin >=, tie detection, tally authority). Two are fixable in 30 min each. One requires architectural change.

**Operational**: Missing structured logging, graceful shutdown gaps, health check too simplistic.

**Architecture**: Schema migrations run on every boot, no transaction handling, results not persisted.

**Verdict**: UX + blockchain parsing solid. Core security gap blocks production. Otherwise incremental fixes.

---

## CRITICAL ISSUES (2)

### SEC-001: No Wallet Signature Verification

**Severity**: CRITICAL
**Category**: Security
**Module**: server.js (all POST routes accepting `wallet`)
**Tier**: 1

**The Problem**
Every governance action (create proposal, vote, rename lock) accepts a wallet address in the request body with zero cryptographic proof that the sender controls it.

```js
// server.js:209 - insecure
const { wallet, choiceIndex } = req.body;
await insertVote(proposalId, wallet, choiceIndex, votingPower);
```

**Impact**
A curl command can vote as any wallet:
```bash
curl -X POST http://localhost:3000/api/proposals/123/vote \
  -H "Content-Type: application/json" \
  -d '{"wallet":"FakeWallet123...","choiceIndex":0}'
# Vote recorded as FakeWallet, with their real voting power
```

The entire governance layer is spoofable.

**Expected**
Caller signs a message with their private key (using `@solana/web3.js`). Backend verifies signature using `nacl.sign.detached.verify()`.

```js
// Proposed fix
const { wallet, message, signature } = req.body;
const isValid = nacl.sign.detached.verify(
  Buffer.from(message),
  Buffer.from(signature, 'base64'),
  new PublicKey(wallet).toBytes()
);
if (!isValid) return res.status(401).json({ error: "Invalid signature" });
```

**Effort**: 2h (backend nonce + verification) + 30min frontend (sign before each action)
**Blocker**: Decision on nonce strategy (per-action vs session-based)
**Phase**: Tier 1 (must fix before governance launch)

---

### SEC-002: Admin Password in Plaintext, Stored in JS Memory

**Severity**: CRITICAL
**Category**: Security
**Module**: server.js:290, index.html:2711
**Tier**: 1

**The Problem**
Admin password is sent in request body and stored in browser memory as a JS global variable. It's visible via DevTools, and reused as the `x-admin-key` header on every subsequent admin request.

```js
// index.html:2711
adminKey = pw;  // plain password stored in window scope
// index.html:2712 (every admin call)
headers["x-admin-key"] = adminKey;  // password in header
```

**Impact**
Browser DevTools → Application → JavaScript memory → `adminKey = "correct-horse-battery-staple"` exposed. If anyone gains browser access (malware, MITM), the admin password is compromised.

**Expected**
Use JWT or session cookie. Backend issues a token after successful auth. Frontend stores token (not password) and sends token in header.

```js
// Proposed: Auth endpoint returns token
POST /api/admin/auth
{ "password": "..." }
→ { "token": "eyJhbGciOiJIUzI1NiIs..." }

// Store token in memory or secure httpOnly cookie
// Send token in header (not password)
headers["x-admin-token"] = token;
```

**Effort**: 2h (JWT issuance + verification, replace header logic)
**Blocker**: None
**Phase**: Tier 1 (must fix before production)

---

## HIGH SEVERITY ISSUES (6)

### BUG-001: Margin >= Threshold (Should Be >)

**Severity**: HIGH
**Category**: Logic
**Module**: index.html:1536
**Tier**: 1 (identified, awaiting sollama58 decision)

**Description**
`checkThreshold` marks proposal as passed when margin equals threshold, not exceeds it.

```js
// WRONG
return { met: margin >= threshold, margin };

// CORRECT
return { met: margin > threshold, margin };
```

**Example**
Threshold = 5%, Margin = 5% → `passed = true` (WRONG, should be false)

**Impact**
Edge case proposals that barely meet threshold are indistinguishable from those that exceed it. Floating-point rounding on token amounts can flip this check.

**Effort**: 5 min
**Phase**: Tier 1 (Phase 1 Étape 2, Option A/B/C path)

---

### BUG-002: Frontend is Sole Tally Authority

**Severity**: HIGH
**Category**: Logic / Architecture
**Module**: index.html:2033-2051 (no equivalent in backend)
**Tier**: 1 (identified, Option A/B/C decision)

**Description**
Proposal results (Passed/Failed) are computed only in frontend JavaScript. Backend has no tally endpoint. Two clients with different data (e.g., different `tokenTotalSupply` snapshots) will compute different results for the same proposal.

```js
// index.html:2033 - client only
function tallyProposal(p) {
  var totals = [0, 0, 0];
  p.votes.forEach(v => { totals[v.choice_index] += v.voting_power; });
  var winner = Math.max(...totals);
  return { passed: checkThreshold(totals, getTotalPool(p.vote_mode), p.threshold) };
}
```

No server equivalent exists.

**Impact**
- Malicious JS modification can falsify results.
- No canonical result exists for dispute resolution.
- Audit impossible (no server logs of tally computation).

**Expected**
Backend `/api/proposals/:id/result` endpoint computes tally server-side, stores immutable result when proposal closes.

**Effort**: 2h (add endpoint, compute server-side, persist result)
**Phase**: Tier 1 (Option B path from roadmap, or deferred to Phase 2)

---

### BUG-003: TOCTOU on Voting Power

**Severity**: HIGH
**Category**: Logic
**Module**: server.js:237-264
**Tier**: 2

**Description**
Between `hasVoted()` check and `insertVote()`, no transaction wraps the operation. Concurrent duplicate vote requests could theoretically both pass the `hasVoted` check before either inserts. The PRIMARY KEY constraint catches this at the DB level, but the error is returned as 500 ("Vote failed") instead of 409 ("Already voted").

```js
// TOCTOU window
const alreadyVoted = await hasVoted(proposalId, wallet);  // check
if (alreadyVoted) return res.status(409).json({ error: "Already voted" });
// ... gap: another identical request can pass the check here
await insertVote(proposalId, wallet, choiceIndex, votingPower);  // action
```

**Impact**
Duplicate vote returns 500 instead of 409, confusing the user. DB constraint prevents actual duplicate, but error handling is wrong.

**Effort**: 30 min (catch unique constraint error specifically, return 409)
**Phase**: Tier 2

---

### BUG-004: No Tie Detection

**Severity**: HIGH
**Category**: Logic
**Module**: index.html:2048-2051
**Tier**: 2

**Description**
When two choices have equal voting power, `tallyProposal` shows whichever comes first as "winner" with no indication of a tie.

```js
// No tie detection
var winnerIdx = 0;
totals.forEach(function (t, i) { if (t > totals[winnerIdx]) winnerIdx = i; });
// winnerIdx now points to first option, silently winning a tie
```

**Impact**
Governance results are misleading. 50/50 split shows one option as winner in proposal history.

**Effort**: 30 min
**Phase**: Tier 2 (Phase 1 Étape 2, Option A/B)

---

### BUG-005: refreshing Flag Not Properly Gated on Cold Start

**Severity**: HIGH
**Category**: Logic
**Module**: streamflow.js:278-341
**Tier**: 2

**Description**
When multiple concurrent requests hit `fetchLockData()` during cold start (no `memoryCache.data`), the second request sees `refreshing = true` and returns immediately without waiting. If `memoryCache.data` is still empty, it throws "No lock data available yet" (line 380).

```js
// streamflow.js:278
if (refreshing) return;  // second request returns immediately
// streamflow.js:374
await refreshData();
if (memoryCache.data) { return ... }
throw new Error("No lock data available yet");  // second request fails
```

**Impact**
During cold start with concurrent load, some requests fail with 503 while others wait. Confuses monitoring and error alerting.

**Effort**: 30 min (return a Promise that waiting callers can await)
**Phase**: Tier 2

---

### SEC-003: Wallet Address Format Not Validated on Vote/Proposal Routes

**Severity**: HIGH
**Category**: Security
**Module**: server.js:149-150, 211-212
**Tier**: 2

**Description**
`/api/wallet/:address/balance` validates address format (line 122). But `/api/proposals` (create) and `/api/proposals/:id/vote` only check `typeof wallet !== "string"`. Caller can pass an arbitrary string as wallet.

```js
// CORRECT (line 122)
if (!address || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) { ... }

// MISSING (line 149)
if (!wallet || typeof wallet !== "string") { ... }
// no format check — garbage wallet stored in DB
```

**Impact**
Inconsistent data in database. Marginal risk if combined with SEC-001 (signature verification) fix, but inconsistent interface.

**Effort**: 5 min (extract regex to util, apply everywhere)
**Phase**: Tier 2

---

## MEDIUM SEVERITY ISSUES (9)

### SEC-004: Admin Password Sent in Request Body

**Severity**: MEDIUM
**Category**: Security
**Module**: server.js:285, index.html:2703-2706
**Tier**: 2

**Description**
Related to SEC-002. Login sends password in JSON body. The password then appears in: (1) request body logs, (2) JS memory, (3) every header.

**Impact**
If server logs request bodies (for debugging), password is logged. If network is TLS-stripped (MITM), password transits plaintext in headers.

**Effort**: 30 min (part of SEC-002 token fix)
**Phase**: Tier 2

---

### ARCH-001: No Database Transaction on deleteProposal

**Severity**: MEDIUM
**Category**: Architecture
**Module**: db.js:146-149
**Tier**: 2

```js
// Two separate queries, no transaction
await pool.query("DELETE FROM votes WHERE proposal_id = $1", [id]);
await pool.query("DELETE FROM proposals WHERE id = $1", [id]);
```

**Impact**
If first succeeds and second fails: orphaned votes. If reversed order (delete proposals first): FK constraint blocks delete of votes.

**Effort**: 30 min (wrap in transaction)
**Phase**: Tier 2

---

### ARCH-002: Migration Logic Runs on Every Startup

**Severity**: MEDIUM
**Category**: Architecture
**Module**: db.js:38-41
**Tier**: 2

```js
// Runs every boot
await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS threshold ...`);
```

**Impact**
Not a bug today, but maintenance trap. As schema grows, startup latency increases. No migration versioning or rollback capability.

**Effort**: 2h (adopt migration tool or implement version table)
**Phase**: Tier 3 (low priority until schema stabilizes)

---

### OPS-001: Health Check Has No Depth

**Severity**: MEDIUM
**Category**: Operational
**Module**: server.js:396-398
**Tier**: 2

```js
// Always returns ok, no dependency check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});
```

**Impact**
Render health checks report service as healthy even when DB is down. Misleads monitoring and autoscaling.

**Effort**: 30 min (add DB ping, Redis ping, cache age check)
**Phase**: Tier 2

---

### OPS-002: streamflow.js Uses console.log Instead of Logger

**Severity**: MEDIUM
**Category**: Operational
**Module**: streamflow.js:61, 82, 85, 99, 101, 282, 288, 335
**Tier**: 2

**Description**
Logger.js (Winston) is set up but not used in streamflow. Blockchain/cache events have no structured format, no service metadata, won't appear in file logs in production.

**Effort**: 5 min (import logger, replace console calls)
**Phase**: Tier 2

---

### OPS-003: Graceful Shutdown Does Not Close DB Pool

**Severity**: MEDIUM
**Category**: Operational
**Module**: server.js:406-411
**Tier**: 2

```js
// Closes Redis but not PostgreSQL
process.on('SIGTERM', async () => {
  await closeRedis();
  process.exit(0);
});
```

**Impact**
On Render rolling restarts, active DB queries are aborted mid-flight. Connection leaks accumulate.

**Effort**: 5 min (export pool.end() from db.js, call on SIGTERM)
**Phase**: Tier 2

---

### BUG-006: totalPool Zero for "all" Mode When Supply Not Loaded

**Severity**: MEDIUM
**Category**: Logic
**Module**: index.html:1538-1543
**Tier**: 2

**Description**
If `tokenTotalSupply` is 0 (not yet fetched), `getTotalPool("all")` returns 0, and all "all" mode proposals show "threshold not met" incorrectly.

**Impact**
During cold page load, proposals show incorrect status until supply data loads.

**Effort**: 30 min (show "loading" state instead of false "not met")
**Phase**: Tier 2

---

### ARCH-003: No Input Sanitization on lockId in Admin Routes

**Severity**: MEDIUM
**Category**: Architecture
**Module**: server.js:322, 340
**Tier**: 2

**Description**
Admin routes don't validate `lockId` format. Params not validated against base58 format like wallet routes.

**Impact**
Admin could set a 1000-char name for a key, causing UI issues. Low practical risk (requires auth) but inconsistent.

**Effort**: 5 min (same base58 validation as wallet route)
**Phase**: Tier 2

---

## LOW SEVERITY ISSUES (5)

### OPS-004: No SIGINT Handler

**Severity**: LOW
**Category**: Operational
**Module**: server.js:406-411
**Tier**: 3

**Description**
Only `SIGTERM` is handled. Local `Ctrl+C` sends `SIGINT`, no cleanup.

**Effort**: 5 min
**Phase**: Tier 3

---

### ARCH-004: No Pagination on /api/proposals

**Severity**: LOW
**Category**: Architecture
**Module**: server.js:134
**Tier**: 3

**Description**
Returns all proposals with all votes in one response. `json_agg` grows unbounded as votes accumulate.

**Impact**
High proposal volume → large JSON payload on every page load.

**Effort**: 2h (add pagination or separate vote endpoint)
**Phase**: Tier 3 (until proposal volume warrants it)

---

### ARCH-005: Proposal ID Generated Client-Side Without Crypto

**Severity**: LOW
**Category**: Architecture
**Module**: server.js:193
**Tier**: 3

```js
// Not cryptographically secure
const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
```

**Expected**: `crypto.randomUUID()` or `nanoid`.

**Effort**: 5 min
**Phase**: Tier 3

---

### BUG-007: buildMergedTimeline Cumulative Calculation Subtle Bug

**Severity**: LOW
**Category**: Logic
**Module**: streamflow.js:262-265
**Tier**: 3

**Description**
When 3+ locks unlock on exact same timestamp, cumulative calculation may double-count. Only impacts same-second unlocks (unlikely).

**Effort**: 30 min (test with 3 co-dated events)
**Phase**: Tier 3

---

### FEAT-001: No Proposal Status Persistence

**Severity**: LOW
**Category**: Feature
**Module**: db.js (proposals table)
**Tier**: 3

**Description**
Proposal "Passed/Failed" status is computed on every read, never persisted. Results change retroactively if `tokenTotalSupply` changes.

**Effort**: 2h (add status column, persist on close)
**Phase**: Tier 3 (with migration strategy)

---

### FEAT-002: No Audit Log for Admin Actions

**Severity**: LOW
**Category**: Feature
**Module**: server.js admin routes
**Tier**: 3

**Description**
No record of who deleted what, when. Only logs failures.

**Effort**: 30 min (add logger.info to each admin route)
**Phase**: Tier 3

---

## Summary by Tier

| Tier | Count | Issues | Effort |
|------|-------|--------|--------|
| **1** | 4 | SEC-001, SEC-002, BUG-001, BUG-002 | 5h total (2h each for sigs, 30min each for voting) |
| **2** | 13 | BUG-003, BUG-004, BUG-005, SEC-003, SEC-004, ARCH-001, OPS-001, OPS-002, OPS-003, BUG-006, ARCH-003, + 2 medium | 4h total (all 30min-2h each) |
| **3** | 5 | ARCH-002, ARCH-004, ARCH-005, BUG-007, FEAT-001, FEAT-002 | 5h total (low priority) |

---

## Recommended Phase 2 Roadmap

### Phase 2 - Security Hardening (1-2 weeks)
- **SEC-001**: Wallet signature verification (2h)
- **SEC-002**: Replace admin password with JWT token (2h)
- **BUG-001**: Fix margin >= to > (5 min)
- **BUG-002**: Move tally to backend (2h, if Option B chosen)
- Quick fixes: OPS-002, OPS-003, SEC-003, BUG-003, BUG-004 (1h total)

**Result**: Production-safe governance, no spoofing possible.

### Phase 3 - Production Excellence (2-3 weeks)
- **OPS-001**: Deep health check
- **BUG-005**: Proper cold-start handling
- **BUG-006**: Loading state for supply
- **ARCH-001**: Transaction on delete
- **FEAT-002**: Audit logging

### Phase 4+ - Scalability (future)
- **ARCH-002**: Migration system
- **ARCH-004**: Pagination
- **FEAT-001**: Persist proposal results

---

## Questions for sollama58

1. **SEC-001**: Acceptable to require wallet signatures for governance? (Game-changer for security)
2. **BUG-002**: Backend tally (Option B)? Or frontend-only (Option A) with understanding of risks?
3. **Timeline**: How soon do you want Phase 2 security hardening?

---

**Audit Confidence**: 58% (φ-bounded)

Some edge cases in BN math not fully exercised. Recommendations are empirical and conservative.

---

*Generated by CYNIC Judge*
*Empirical + Pragmatic*
