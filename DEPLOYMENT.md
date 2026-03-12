# Deployment Checklist

This document provides step-by-step instructions for deploying TokenVotingUtil to production.

## Local Development Setup

### Prerequisites
- Node.js >= 18
- PostgreSQL (local or remote)
- Redis (optional; falls back to in-memory)

### Installation

```bash
# Clone and install
git clone <your-fork-url>
cd TokenVotingUtil
npm install

# Create environment file
cp .env.example .env

# Edit .env with your local configuration
nano .env

# Create logs directory (for production file logging)
mkdir -p logs

# Start development server
npm run dev
```

### Local Testing

```bash
# Run test suite
npm test

# Start server (will auto-reload on file changes)
npm run dev

# In another terminal, test the API
curl http://localhost:3000/api/health
curl http://localhost:3000/api/locks
```

## Render Deployment

### Step 1: Provision Resources

1. **PostgreSQL Database**
   - In Render Dashboard: New > PostgreSQL
   - Name: `lockverifier-db`
   - Region: Oregon (or your preference)
   - Render will auto-provide `DATABASE_URL` env var

2. **Redis (Optional but Recommended)**
   - In Render Dashboard: New > Redis
   - Name: `lockverifier-redis`
   - Region: Same as PostgreSQL
   - Render will auto-provide `REDIS_URL` env var

### Step 2: Set Environment Variables

In Render Dashboard, go to your web service's **Environment** tab and set:

| Variable | Value | Required |
|----------|-------|----------|
| `SOLANA_RPC_URL` | Your Helius/QuickNode RPC endpoint | ✓ |
| `ADMIN_PASSWORD` | Strong password for admin panel | ✓ |
| `ALLOWED_ORIGINS` | Your domain(s): `https://yourdomain.com,https://www.yourdomain.com` | ✓ |
| `TOKEN_MINT` | `9zB5wRarXMj86MymwLumSKA1Dx35zPqqKfcZtK1Spump` | ✓ |
| `PORT` | `3000` (Render sets this automatically) | — |
| `CACHE_TTL_SECONDS` | `300` (or your preference) | — |
| `TOKEN_DECIMALS` | `6` | — |
| `SITE_TITLE` | `ASDelegate` (or your site name) | — |
| `LOG_LEVEL` | `info` (or `debug`/`warn`/`error`) | — |
| `NODE_ENV` | `production` | — |

**Note**: `DATABASE_URL` and `REDIS_URL` are auto-set by Render if you provisioned them via blueprint or manual creation.

### Step 3: Build and Deploy

If using `render.yaml` blueprint:
1. Push code to GitHub
2. In Render: New > Blueprint
3. Connect your GitHub repo
4. Render reads `render.yaml` and creates web service + PostgreSQL
5. Review environment variables (from Step 2)
6. Click **Deploy**

If manual deploy:
1. Create web service in Render
2. Connect GitHub repo + branch
3. Build command: `npm install`
4. Start command: `npm start`
5. Set environment variables (Step 2)
6. Deploy

### Step 4: Verify Deployment

Once deployed, test the live app:

```bash
# Health check
curl https://<your-service>.onrender.com/api/health

# Fetch locks
curl https://<your-service>.onrender.com/api/locks

# Check admin panel password (should return 200 or 401)
curl -X POST https://<your-service>.onrender.com/api/admin/auth \
  -H "Content-Type: application/json" \
  -d '{"password":"your-admin-password"}'
```

### Step 5: Monitor Logs

In Render Dashboard, go to **Logs** to check:
- Application startup (should see "Server running on port 3000")
- Database connection (should see "Database initialized")
- Redis connection (should see "Redis connected" or "Redis not available, falling back to in-memory")
- Any errors during operation

## Common Issues

### CORS Errors on Embedded Iframe

**Problem**: Iframe on your website gets blocked.

**Solution**:
1. Ensure `ALLOWED_ORIGINS` includes your domain
2. Test with curl: `curl -H "Origin: https://yourdomain.com" https://<service>.onrender.com/api/locks`
3. Should see `Access-Control-Allow-Origin: https://yourdomain.com` in response headers

### Rate Limiting Blocked Requests

**Problem**: Users get 429 (Too Many Requests) errors.

**Solution**:
1. Verify Redis is provisioned and `REDIS_URL` is set
2. Check logs: should see "Redis connected" or "falling back to in-memory"
3. Rate limits: 30 seconds for refresh, 60 seconds for voting
4. If in-memory fallback: restarting the app resets rate limits

### File Logging Fails in Production

**Problem**: `logs/error.log` and `logs/combined.log` don't appear.

**Solution**:
1. Render auto-creates the `logs/` directory during build
2. Check logs in Render dashboard (not local files)
3. Logs are ephemeral on Render; use external log aggregation for persistent logs

### Redis Connection Timeout

**Problem**: Service hangs during startup.

**Solution**:
1. Verify `REDIS_URL` is correct
2. Ensure Redis instance is running
3. App will timeout and fall back to in-memory (check logs)
4. For production reliability, provision Redis through Render

## Rollback

If deployment fails:
1. Go to Render Dashboard > Deployments
2. Click the previous successful deployment
3. Click "Redeploy"
4. The app will roll back to the last known-good state

## Monitoring Checklist

After deployment, verify:

- [ ] Service is running (health check passes)
- [ ] Database tables created (check Render Postgres logs)
- [ ] CORS headers present (test with curl)
- [ ] Rate limiting active (test with rapid requests)
- [ ] Logging works (check Render logs)
- [ ] Admin panel accessible (login with admin password)
- [ ] Can fetch locks from Streamflow
- [ ] Voting works (create proposal, cast vote, tally works)

## Support

For issues:
1. Check Render logs first (Logs tab)
2. Test locally with same `.env` variables
3. Verify all required environment variables are set
4. Check PostgreSQL and Redis connections

