# Architecture Overview

TokenVotingUtil is a Solana lock verifier + governance platform. This document explains the design, current state, and constraints.

## High-Level Purpose

**Lock Verifier**:
- Display all locked tokens for a given Solana SPL token mint
- Show lock details, unlock timelines, lock names
- Cache data from Streamflow (avoid RPC rate limits)

**Governance Platform**:
- Create proposals (weighted by token holdings)
- Vote with two modes: locked-only or all-holders
- Tally results with configurable thresholds
- Embeddable on Squarespace (iframe)

## Technology Stack

| Layer | Tech | Notes |
|-------|------|-------|
| **Frontend** | Vanilla HTML/CSS/JS | Single file: `public/index.html` (3KB+) |
| **Backend** | Node.js + Express | ~400 LOC in `server.js` |
| **Database** | PostgreSQL | Caches lock data + proposal/vote records |
| **Blockchain** | Solana + Streamflow | RPC calls via `@solana/web3.js` + `@streamflow/stream` |
| **Cache Layer** | PostgreSQL + In-Memory | Avoid Solana RPC rate limits (300s TTL) |
| **Rate Limiting** | Redis (with fallback) | Distributed rate limiting across instances |
| **Logging** | Winston | Structured logging (console + file) |

## Modules

### `server.js` (405 LOC)
Main Express app. Routes:
- `GET /api/locks` — Fetch all lock data
- `POST /api/proposals` — Create proposal
- `GET /api/proposals` — List proposals
- `POST /api/proposals/:id/vote` — Cast vote
- `POST /api/locks/:id/name` — Rename lock
- Admin endpoints (protected by password)

**Middleware**:
- CORS allowlist (via `ALLOWED_ORIGINS` env var)
- CSP headers (`frame-ancestors` restriction)
- Rate limiter (Redis-backed)
- JSON parser (16KB limit)

### `streamflow.js` (380 LOC)
Blockchain integration:
- `fetchLockData()` — Query Streamflow API for locks
- `getWalletTokenBalance()` — Fetch wallet SPL token balance
- `refreshData()` — Periodic background refresh
- Cache management (in-memory + PostgreSQL)

### `db.js` (173 LOC)
PostgreSQL integration:
- Proposal CRUD (create, read, list, delete)
- Vote operations (insert, query, delete)
- Lock name overrides (setName, deleteName)
- Stats (getStats)

**Tables**:
- `proposals` (id, title, choices, threshold, vote_mode, ends_at, created_at)
- `votes` (proposal_id, wallet, choice_index, voting_power)
- `lock_names` (lock_id, name, set_by, set_at)

### `logger.js` (50 LOC)
Winston structured logging:
- Console output (dev): colored, human-readable
- File output (prod): JSON, for log aggregation
- Levels: debug, info, warn, error
- Metadata support (userId, action, reason, etc.)

### `rate-limiter.js` (159 LOC)
Distributed rate limiting:
- Redis sorted sets for tracking requests
- Fallback to in-memory if Redis unavailable
- RFC 6585 compliant headers (X-RateLimit-*)
- Graceful shutdown

### `public/index.html` (3100+ LOC)
Single-page frontend:
- Lock dashboard (summary, stats, timeline)
- Lock browser (sortable/filterable table)
- Proposal creation + voting UI
- Admin panel (password-protected)
- Wallet connection (Phantom, Solflare, etc.)
- Vote tallying logic (client-side)

---

## Current Issues & Constraints

### Known Bugs (Tier 2)

1. **Margin Comparison Bug**
   - Location: `public/index.html:1536`
   - Issue: `margin >= threshold` should be `margin > threshold`
   - Impact: Proposals pass when margin equals threshold (should exceed)
   - Risk: HIGH (affects governance integrity)

2. **Frontend Tally Authority**
   - Location: `public/index.html` (entire tallyProposal function)
   - Issue: Results calculated client-side only, no server verification
   - Impact: Tally could be manipulated or inconsistent across clients
   - Risk: HIGH (governance authority unclear)

3. **Tie Detection**
   - Location: `public/index.html:2050`
   - Issue: No explicit handling when two choices have equal votes
   - Impact: Silent tie-breaking by array order (non-deterministic)
   - Risk: MEDIUM (edge case, but affects proposal legitimacy)

### Design Constraints

**Frontend-Based Voting Tally**:
- Currently: Frontend aggregates votes, calculates winner
- Pro: Reduces server load
- Con: No authoritative source of truth; can't easily audit

**No Voting Logic Tests**:
- Unit tests cover modules, not voting math
- Integration tests needed for edge cases

**In-Memory Rate Limiting Fallback**:
- If Redis unavailable, falls back to in-memory
- Resets on app restart (acceptable for now)

### Deployment Constraints

**Render Limitations**:
- Ephemeral filesystem (logs deleted on redeploy)
- No persistent Redis on free tier
- Node.js only (no compiled languages)

**Solana RPC Limits**:
- Public RPC has strict rate limits
- Requires dedicated provider (Helius, QuickNode)
- Caching essential (300s TTL default)

---

## Decision Tree: What Needs Fixing?

```
Phase 1: Stabilize Infrastructure ✓
├─ CORS allowlist (security) ✓
├─ Test suite (reliability) ✓
├─ Structured logging (debuggability) ✓
└─ Redis rate limiting (scalability) ✓

Phase 2: Fix Voting Logic (PENDING APPROVAL)
├─ Fix margin >= bug (critical)
├─ Add tie detection (medium)
└─ Backend tally authority? (architectural)

Phase 3: Scale & Enhance (FUTURE)
├─ Multi-tenant support
├─ Config externalization
└─ Leaderboard / XP system
```

---

## Testing Strategy

### Current (Phase 1)
- Unit tests: Export verification (jest setup)
- Integration tests: CORS, rate limiting, logging
- Manual testing: Local server + curl

### Phase 2 (Proposed)
- Voting math tests (margin, tie detection)
- Backend tally tests (if implemented)
- End-to-end vote scenario tests

### Future
- Load testing (simulate high voting load)
- Blockchain integration tests
- Multi-tenant isolation tests

---

## Deployment Flow

```
1. Developer: Code changes locally, write tests
2. Developer: Open PR with clear description
3. sollama58: Review + approve/request changes
4. Developer: Fix feedback, update PR
5. sollama58: Merge to main
6. Render: Automatically deploys from main
7. Production: App live at https://<service>.onrender.com

Environments:
- develop branch (future): staging at https://tokenvoter-dev.onrender.com
- main branch: production at https://<service>.onrender.com
```

---

## Next Steps

See `ROADMAP.md` for detailed phase breakdown.

**Immediate** (Phase 1 - Étape 1):
- [ ] Tier 1 gaps (CORS, tests, logging, Redis) — ready for review
- [ ] Issue #1: "Phase 1 Roadmap" — proposed, awaiting feedback

**Blocked** (Phase 1 - Étape 2):
- [ ] Issue #2: "Voting Logic Audit" — depends on Phase 1 approval
- [ ] Bug fixes — depends on decision on backend tally

---

## Contact & Questions

If architecture is unclear:
1. Check this file (ARCHITECTURE.md)
2. Check related issue on GitHub
3. Open new issue with `architecture` label
4. We'll update docs based on questions

**Goal**: This file should answer 80% of "how does this work?" questions.
