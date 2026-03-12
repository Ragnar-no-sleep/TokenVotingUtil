# TokenVotingUtil Roadmap

Strategic vision for stabilizing and enhancing TokenVotingUtil. This roadmap is **not fixed** — it adapts based on sollama58's feedback and priorities.

---

## Phase 1: Stabilize & Harden (Current)

**Goal**: Make the platform production-ready and maintainable.

### Étape 1: Infrastructure Hardening ✓ Ready
**Duration**: 1-2 weeks (or merge when convenient)

**What**:
- Fix CORS vulnerability (allowlist from '*')
- Add Jest test suite (infrastructure coverage)
- Add Winston structured logging
- Add Redis-backed rate limiting (distributed, scalable)

**Why**:
- Security: CORS was open to any origin
- Reliability: Zero tests meant changes were risky
- Debuggability: No structured logs for production
- Scalability: In-memory rate limiting resets on restart

**Status**: PR #1 ready for review
**Testing**: 34 tests pass (unit + integration)
**Blockers**: None (independent of other phases)

**Deployment Notes**:
- New env vars: ALLOWED_ORIGINS, LOG_LEVEL, REDIS_URL (documented in DEPLOYMENT.md)
- Redis optional (falls back to in-memory)
- Logs written to `logs/` directory (prod only)

**Next**: Await sollama58 feedback / approval to merge

---

### Étape 2: Voting Logic Audit & Fixes 🟡 Pending Decision
**Duration**: 1-2 weeks (depends on scope)
**Blocked By**: Étape 1 approval + decisions below

**What**:
During code review of Phase 1, we identified 3 bugs in voting logic:

1. **Margin Comparison Bug** (CRITICAL)
   - Location: `public/index.html:1536`
   - Issue: `margin >= threshold` should be `margin > threshold`
   - Example: threshold=5%, margin=5% → currently passes (WRONG)
   - Fix: 30 min (change 1 operator + 1 test)

2. **Tie Detection Missing** (MEDIUM)
   - Location: `public/index.html:2050`
   - Issue: No explicit tie handling when equal votes exist
   - Example: choice A = 100, choice B = 100 → silent tie
   - Fix: 30 min (add detection + logging)

3. **Frontend Tally Authority** (ARCHITECTURAL)
   - Location: Entire voting result calculation
   - Issue: Results calculated client-side only; no server verification
   - Question: Should voting tally move to backend?
   - Impact: Depends on governance trust model

**Three Possible Paths**:

**Option A: Quick Fixes Only** (Safe, Fast)
- Fix bugs #1 and #2 only (margin, tie detection)
- Keep frontend tally as-is
- ✓ 1-2 days, low risk, easy review
- ✗ Tally authority still client-side

**Option B: Full Backend Tally** (Robust, Complex)
- Fix bugs #1 and #2
- Move tally calculation to backend
- Frontend sends votes, server calculates results
- ✓ More authoritative, better for governance
- ✗ 1 week, bigger refactor, frontend changes needed

**Option C: Skip Phase 1 Étape 2** (Defer)
- Don't fix voting bugs now
- Focus on other priorities
- Revisit later when governance goes live
- ✓ Fastest, lowest risk for now
- ✗ Bugs remain until fixed

**Question for sollama58**:
Which path aligns with your vision for TokenVotingUtil?
- A (quick fixes), B (full backend tally), or C (defer)?
- Timeline preference?
- Any other priorities for Phase 1?

**Decision Method**: Issue #1 will ask this explicitly; we implement based on feedback.

---

## Phase 2: Production Ready (Future)

**Goal**: Governance can go live with confidence.

### What (Proposed, pending Phase 1 decisions)
- Complete Phase 1 Étape 2 work
- Config externalization (move hardcoded values to env vars)
- Admin panel enhancements (better proposal management)
- Documentation for governance operations

### Why
- Easier to manage multiple token communities
- Less code changes needed per deployment
- Clearer admin workflows

### Timeline
- Starts after Phase 1 complete
- Depends on Phase 1 feedback

---

## Phase 3: Scale & Enhance (Future)

**Goal**: Support growth and advanced use cases.

### Possible Features (NOT DECIDED YET)
- **Multi-Tenant Support**: One instance serves multiple token communities
- **Leaderboard / XP System**: Governance participation tracking
- **Custom Voting Rules**: Beyond threshold-based
- **Proposal Templates**: Reduce spam
- **Advanced Analytics**: Participation metrics

### Timeline
- 6+ months out
- Depends on adoption and feedback

### Not in Scope
- Custom blockchains (Solana only)
- Token trading/DEX features
- Smart contract deployment

---

## Decision Dependencies

```
Phase 1 Étape 1 ✓ Ready for merge
    ↓
Phase 1 Étape 2 🟡 Blocked on:
    - sollama58 feedback on voting bugs
    - Decision: Path A, B, or C?
    - Timeline: When to implement?
    ↓
Phase 2 🟡 Blocked on:
    - Phase 1 complete
    - Budget/resource availability
    ↓
Phase 3 🟡 Blocked on:
    - Phase 2 complete
    - Clear use cases / demand
```

---

## Success Criteria

### Phase 1
- ✓ Infrastructure solid (CORS, tests, logging, rate limiting)
- ✓ Voting logic bugs fixed (if Path A or B chosen)
- ✓ sollama58 confident merging to production
- ✓ No critical bugs blocking governance launch

### Phase 2
- ✓ Governance can go live
- ✓ Admin workflows streamlined
- ✓ Docs clear for operations team

### Phase 3
- ✓ Multiple communities can use platform
- ✓ Growth features support adoption
- ✓ Analytics inform governance participation

---

## How to Influence This Roadmap

1. **Open an Issue** with feedback / priorities
2. **Comment on Phase 1** with concerns or suggestions
3. **Request features** (Phase 3 ideas)

This roadmap is **collaboration, not prescription**.

---

## Current Status

| Phase | Étape | Status | Blocker |
|-------|-------|--------|---------|
| 1 | 1 (Infrastructure) | ✓ Ready for review | None |
| 1 | 2 (Voting bugs) | 🟡 Pending decision | Issue #1 feedback |
| 2 | All | 🟡 Pending Phase 1 | Phase 1 complete |
| 3 | All | 🟡 Future | Phase 2 complete |

**What's Next?**
1. sollama58 reviews Phase 1 Étape 1 (PR #1)
2. We clarify Phase 1 Étape 2 questions (Issue #1)
3. sollama58 provides feedback
4. We implement based on decision
5. Move to Phase 2

---

## Questions?

If anything is unclear:
- Check `COLLABORATION.md` (how we work)
- Check `ARCHITECTURE.md` (technical details)
- Open an issue with questions
- We'll refine roadmap based on feedback

**Goal**: Transparency. You should know what we're planning and why.
