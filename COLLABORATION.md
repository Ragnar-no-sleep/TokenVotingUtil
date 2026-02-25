# Collaboration Workflow

This document defines how we collaborate on TokenVotingUtil — transparently, asynchronously, and with clear decision-making.

## Principles

1. **Async-First**: All major communication via GitHub Issues/PRs (not Slack)
2. **Transparent**: Decisions documented, not hidden in commit messages
3. **Incremental**: Small, reviewable PRs; no big surprise refactors
4. **Respectful**: Adapt to maintainer's bandwidth and vision
5. **Traceable**: All decisions logged for future reference

---

## Communication Channels

### Issues (Questions, Decisions, Blockers)

Use issues for:
- Questions that need answers before coding
- Proposals for major changes
- Blockers that need decision-making
- Feature requests / design discussions

**Labels** (recommended):
- `needs-feedback`: Waiting for sollama58's response
- `decision-needed`: Multiple options, need approval before proceeding
- `blocked-by-design`: Architectural question, blocks implementation
- `phase-1`, `phase-2`, `phase-3`: Phase tracking

**Response Time**: Expect 2-3 days (realistic for volunteer maintainer)

### Pull Requests (Solutions)

Use PRs for:
- Implementing approved solutions
- Showing concrete code + tests
- Ready to merge OR request changes

**Guidelines**:
- One feature/fix per PR (atomic, independent)
- Detailed description: why, what, testing, risks
- Link to related issue (`Closes #X` or `Related to #Y`)
- No force-push after review started
- Can merge after approval OR fix feedback

**Review Checklist**:
- [ ] Code style consistent with project
- [ ] Tests pass locally
- [ ] No breaking changes to existing API
- [ ] Deployment notes followed (if applicable)

### Discussions (Real-Time Collaboration)

Use GitHub Discussions if:
- You need a real-time conversation (rare)
- Complex design decision needs back-and-forth
- Post summary in issue when done (archive the conversation)

---

## Decision Log

All major decisions documented in `.claude/decisions.md` (this repo) and tracked in GitHub Issues.

**Decision Structure**:
```
### YYYY-MM-DD: [Title]

**Question**: What were we deciding?
**Options**: A, B, C (with pros/cons)
**Decision**: We chose option X
**Rationale**: Why X makes sense
**Outcome**: What we implemented
**Blocked By**: Any dependencies
```

---

## Phase Structure

See `ROADMAP.md` for complete roadmap.

**Phase 1 (Current)**: Stabilize & Harden
- Infrastructure fixes (CORS, tests, logging, rate limiting)
- Voting logic audit
- Bug fixes

**Phase 2**: Production Ready
- Fix identified bugs
- Backend voting authority (if approved)
- Config externalization

**Phase 3**: Scale & Enhance
- Multi-tenant support
- Leaderboard / XP system
- Advanced governance features

---

## What Success Looks Like

✓ sollama58 can easily understand what we're proposing
✓ No surprises — all changes announced in issues first
✓ PRs are easy to review (one feature, clear testing)
✓ Decisions are traceable (why did we do this?)
✓ Project can be maintained independently without our help

---

## Current Status

**Phase 1 - Étape 1: Infrastructure Fixes**
- [ ] Issue #1 opened: "Phase 1 Roadmap"
- [ ] PR #1 opened: "Tier 1 gaps (CORS + tests + logging + Redis)"
- [ ] Awaiting sollama58 feedback

**Phase 1 - Étape 2: Voting Logic Fixes**
- [ ] Issue #2 opened: "Voting Logic Audit" (if needed after Issue #1 response)
- [ ] Awaiting decision on bug fixes
- [ ] Implementation pending approval

---

## Questions?

If anything in this workflow is unclear, open an issue. We can discuss and adjust.

**Goal**: Make collaboration smooth for everyone.
