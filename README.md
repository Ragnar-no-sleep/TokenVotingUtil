# ASDelegate

A Solana token lock verifier and governance platform built on the [Streamflow](https://streamflow.finance/) protocol. Displays all locked/vesting token contracts for a configurable SPL token mint, with a built-in proposal and voting system weighted by token holdings.

## Features

- **Lock Dashboard** — Summary cards showing total locked tokens, active locks, next unlock date, and more
- **Lock Browser** — Sortable/filterable table of every individual lock contract with detailed modals
- **Unlock Timeline** — Interactive Chart.js graph of upcoming unlock events across all locks
- **Wallet Integration** — Connect Phantom, Solflare, or any Solana wallet to see your locks and token balance
- **My Tokens** — Modal showing wallet balance, locked tokens, total holdings, and voting power shares
- **Proposals & Voting** — Create proposals and vote with two modes:
  - **Locked Only** — Voting power = currently locked tokens
  - **All Holders** — Voting power = wallet balance + tokens in lock contracts (allows any token holder to vote)
- **Vote Thresholds** — Proposals pass when the margin between the leading choice and runner-up exceeds a configurable percentage of total available votes
- **Lock Naming** — Lock senders/recipients can rename their locks; admins can rename any lock
- **Admin Panel** — Password-protected panel to manage proposals, votes, lock names, and force data refreshes
- **Server-Side Caching** — PostgreSQL-backed cache with in-memory layer to avoid Solana RPC rate limits
- **Embeddable** — CORS and CSP configured for iframe embedding on any website (e.g., Squarespace)

## Tech Stack

- **Backend**: Node.js, Express, PostgreSQL (`pg`)
- **Frontend**: Vanilla HTML/CSS/JS (single `public/index.html`), Chart.js
- **Blockchain**: `@streamflow/stream` for lock data, `@solana/web3.js` and `@solana/spl-token` for wallet balance and token supply queries
- **Hosting**: Designed for [Render](https://render.com/) (free tier compatible)

## Setup

### Prerequisites

- Node.js >= 18
- PostgreSQL database (local or hosted)

### Install

```bash
npm install
```

### Configure

Copy the example environment file and edit it:

```bash
cp .env.example .env
```

### Run

```bash
# Development (auto-reload on file changes)
npm run dev

# Production
npm start
```

The app will be available at `http://localhost:3000`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SOLANA_RPC_URL` | `https://api.mainnet-beta.solana.com` | Solana RPC endpoint. Use a dedicated provider (Helius, QuickNode, etc.) for production. |
| `TOKEN_MINT` | `9zB5wRarXMj86MymwLumSKA1Dx35zPqqKfcZtK1Spump` | SPL token mint address to track. Change this to monitor a different token. |
| `TOKEN_DECIMALS` | `6` | Decimal places for the token mint. |
| `CACHE_TTL_SECONDS` | `300` | How often (in seconds) lock data is refreshed from Streamflow. |
| `PORT` | `3000` | HTTP port. Render sets this automatically. |
| `DATABASE_URL` | — | PostgreSQL connection string. Required. Example: `postgresql://user:password@localhost:5432/lockverifier` |
| `ADMIN_PASSWORD` | — | Password for the admin panel. Leave empty to disable the admin panel entirely. |
| `SITE_TITLE` | `ASDelegate` | Site title displayed in the header and browser tab. |

## Deploy to Render

Render can provision everything automatically from the included `render.yaml` blueprint:

1. Push this repository to GitHub
2. In the [Render Dashboard](https://dashboard.render.com/), click **New > Blueprint**
3. Connect your GitHub repo — Render reads `render.yaml` and creates the web service + PostgreSQL database
4. In the Render **Environment** tab, set these secrets:
   - `SOLANA_RPC_URL` — A dedicated Solana RPC endpoint (the public one has strict rate limits)
   - `ADMIN_PASSWORD` — A strong password for the admin panel
5. Render automatically sets `DATABASE_URL` from the provisioned database
6. Deploy — the app will be live at `https://<your-service-name>.onrender.com`

### Manual Deploy (Any Platform)

1. Provision a PostgreSQL database
2. Set all environment variables (see table above)
3. Run `npm install && npm start`
4. The app creates its database tables automatically on first startup

## Embed in Squarespace (or Any Website)

Add a **Code Block** (or raw HTML block) with:

```html
<iframe
  src="https://your-service-name.onrender.com"
  width="100%" height="900" frameborder="0"
  style="border:none;border-radius:12px;"
  loading="lazy" title="ASDelegate">
</iframe>
```

The server sets `Content-Security-Policy: frame-ancestors *` and `Access-Control-Allow-Origin: *` so embedding works from any domain.

## API Endpoints

### Public

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/locks` | All lock data: summary, individual locks, unlock timeline |
| `GET` | `/api/wallet/:address/balance` | SPL token balance for a wallet address |
| `GET` | `/api/proposals` | All proposals with vote tallies |
| `POST` | `/api/proposals` | Create a new proposal (requires lock holder wallet) |
| `POST` | `/api/proposals/:id/vote` | Vote on a proposal (one vote per wallet, final) |
| `POST` | `/api/locks/:id/name` | Rename a lock (sender/recipient only) |
| `POST` | `/api/refresh` | Manually trigger a data refresh |
| `GET` | `/api/config` | Public site configuration (title) |
| `GET` | `/api/health` | Health check |

### Admin (requires `x-admin-key` header)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/auth` | Verify admin password |
| `GET` | `/api/admin/stats` | System statistics |
| `GET` | `/api/admin/names` | All lock name overrides |
| `POST` | `/api/admin/locks/:id/name` | Rename any lock |
| `DELETE` | `/api/admin/locks/:id/name` | Remove a lock name override |
| `DELETE` | `/api/admin/proposals/:id` | Delete a proposal and its votes |
| `POST` | `/api/admin/proposals/:id/close` | Close a proposal early |
| `DELETE` | `/api/admin/votes/:proposalId/:wallet` | Remove a specific vote |
| `POST` | `/api/admin/refresh` | Force data refresh |

## Voting System

- **Locked mode**: Voting power = sum of currently locked tokens across the voter's lock contracts
- **All Holders mode**: Voting power = wallet SPL token balance + tokens still in lock contracts (totalAmount − withdrawn)
- Votes are **final** — once cast, they cannot be changed
- Threshold is the minimum margin (as a % of total available votes) between the leading choice and runner-up for a proposal to pass
- Only wallets with voting power > 0 can vote

## License

Apache 2.0
