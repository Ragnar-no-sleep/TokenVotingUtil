# Decision Log

Audit trail of all major decisions in TokenVotingUtil collaboration. This file is **local** (not in GitHub) and tracks thinking for future reference.

---

## 2026-02-25: Reset ADN — Establish Healthy Collaboration Framework

### Question
How do we structure long-term collaboration with sollama58 (volunteer maintainer) in a way that scales and doesn't require constant re-alignment?

### Options Considered

**Option A: Prescriptive** (Bad)
- We code fixes locally
- Push PRs with changes already made
- Wait for feedback / approval
- Con: Surprises sollama58, doesn't respect his bandwidth

**Option B: Collaborative with Governance** (Chosen)
- We propose ideas in Issues first
- sollama58 provides feedback (async)
- We code based on his decision
- Decisions documented for future reference
- Pro: Transparent, respectful, scalable

**Option C: No Structure** (Worst)
- Ad-hoc communication
- Decisions scattered in Slack/Discord
- Hard to track what was decided and why
- Con: Knowledge loss, repeating conversations

### Decision
**Chosen: Option B** (Collaborative with Governance)

### Implementation
1. Create governance documents:
   - `COLLABORATION.md` — How we work together
   - `ARCHITECTURE.md` — Technical overview + known issues
   - `ROADMAP.md` — Phases 1-3 with decision points
   - `.claude/decisions.md` — This file (local audit trail)

2. Structure Phase 1 as two étapes:
   - Étape 1: Infrastructure hardening (ready to merge now)
   - Étape 2: Voting logic (blocked on decision)

3. Open GitHub Issue #1:
   - Propose Phase 1 roadmap
   - Ask sollama58 for feedback on Phase 1 Étape 2 (3 paths: A/B/C)
   - Get explicit decision before coding

4. Open GitHub PR #1:
   - Tier 1 gaps (CORS, tests, logging, Redis)
   - Reference Issue #1
   - Link to DEPLOYMENT.md and ARCHITECTURE.md

### Rationale
- **Transparent**: All plans visible to sollama58 before we code
- **Respectful**: Doesn't force decisions on him
- **Scalable**: Structure repeats for Phase 2, 3, etc.
- **Documented**: Future collaborators understand the why
- **Async-friendly**: Works with volunteer's sporadic availability

### Blocked By
Nothing. This is foundational.

### Outcome
- 4 governance docs created (COLLABORATION, ARCHITECTURE, ROADMAP, this file)
- Clear decision framework for Phase 1 Étape 2
- GitHub Issue #1 ready to open (waits for user approval)
- GitHub PR #1 structured properly (references Issue #1, DEPLOYMENT, ARCHITECTURE)

### Next Decision Needed
sollama58's response to Issue #1:
- Approve Phase 1 Étape 1 for merge?
- Which path for Phase 1 Étape 2? (A: quick fixes, B: full backend, C: defer)
- Timeline preferences?

---

## 2026-02-24: Infrastructure Fixes (Phase 1 Étape 1)

### Question
What are the critical infrastructure gaps in TokenVotingUtil that block production deployment?

### Decision
Identified 4 Tier 1 gaps:
1. CORS vulnerability (open to any origin)
2. Zero test suite
3. No structured logging
4. In-memory rate limiting (doesn't survive restart)

### Implementation
5 atomic commits on `dev/gaps-tier1`:
1. `8cd5f42` — CORS allowlist + CSP hardening
2. `3f25631` — Jest test suite (20 tests)
3. `adc70af` — Winston structured logging
4. `79da4da` — Redis-backed rate limiter
5. `6b0cba5` — Documentation + integration tests

### Testing
- All 34 tests pass (unit + integration)
- Manual verification of each fix
- Code coverage: 9.82% (API surface)

### Outcome
Phase 1 Étape 1 ready for sollama58 review and merge.

---

## 2026-02-24: Voting Logic Audit

### Question
Are there bugs in the voting logic that would break governance?

### Findings
Identified 6 issues:

**Critical**:
1. Margin >= threshold (should be >)
2. Frontend tally authority (no server verification)

**Medium**:
3. No tie detection
4. Voting power TOCTOU risk
5. Vote recalculation not enforced

**Low**:
6. Zero pool edge case (handled, but untested)

### Decision
3 critical/medium issues warrant Phase 1 Étape 2 work:
1. Fix margin bug (30 min, low risk)
2. Add tie detection (30 min, low risk)
3. Backend tally authority (architectural, needs sollama58 input)

### Blocked By
sollama58's decision on Path A/B/C (see ROADMAP.md)

---

## Future Decisions Needed

### 2026-02-25 (Pending)
**Issue #1: Phase 1 Roadmap**
- Q: Which path for voting fixes? (A: quick, B: full backend, C: defer)
- Q: Timeline for Phase 1 Étape 1 merge?
- Q: Timeline for Phase 1 Étape 2?
- Q: Any other Phase 1 priorities?

### 2026-03-XX (Estimated, pending Phase 1)
**Phase 1 Complete**
- Decide on Phase 2 timeline
- Assess multi-tenant needs
- Plan scaling strategy

### 2026-04-XX (Estimated, pending Phase 2)
**Phase 2 Complete**
- Decide if Phase 3 (advanced features) needed
- Assess governance launch readiness
- Plan community outreach

---

## Decision Tracking Format

When a new decision is needed:
1. Open GitHub Issue with clear question
2. Document options (with pros/cons)
3. Ask for explicit decision
4. Update this file when sollama58 responds
5. Reference decision in code comments / commits

---

## Notes on Collaboration Style

**Lessons Learned** (from this reset):
- Don't code solutions before asking questions
- Don't assume what the maintainer wants
- Don't hide decisions in commit messages
- Don't open PRs without context (link to issue)
- Don't skip documentation

**This Prevents**:
- "Why did you do this?" conversations
- Re-doing work because we misunderstood
- Losing context when decisions are made
- Knowledge silos (one person knows why)

**This Enables**:
- Scaling collaboration (works with any maintainer)
- Async work (no real-time sync needed)
- Long-term sustainability (future contributors understand)
- Trust building (transparent process)

---

## Review & Refinement

This document is **living**. Update it as:
- New decisions are made
- Outcomes are known
- Process is refined based on sollama58's feedback

**Questions about this workflow?** Open an issue or ask sollama58 for feedback.
