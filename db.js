const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost")
    ? { rejectUnauthorized: false }
    : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cache (
      key        TEXT PRIMARY KEY,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lock_names (
      lock_id    TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS proposals (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      choices     JSONB NOT NULL,
      creator     TEXT NOT NULL,
      threshold   NUMERIC NOT NULL DEFAULT 5,
      ends_at     TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
      vote_mode   TEXT NOT NULL DEFAULT 'locked',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Migrate existing tables that lack new columns
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS threshold NUMERIC NOT NULL DEFAULT 5`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS vote_mode TEXT NOT NULL DEFAULT 'locked'`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS votes (
      proposal_id  TEXT NOT NULL REFERENCES proposals(id),
      wallet       TEXT NOT NULL,
      choice_index INTEGER NOT NULL,
      voting_power NUMERIC NOT NULL,
      voted_at     TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (proposal_id, wallet)
    )
  `);
  console.log("Database initialized");
}

async function getCache(key) {
  const { rows } = await pool.query(
    "SELECT data, updated_at FROM cache WHERE key = $1",
    [key]
  );
  if (rows.length === 0) return null;
  return {
    data: rows[0].data,
    timestamp: new Date(rows[0].updated_at).getTime(),
  };
}

async function setCache(key, data) {
  await pool.query(
    `INSERT INTO cache (key, data, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET data = $2, updated_at = NOW()`,
    [key, JSON.stringify(data)]
  );
}

async function getAllNames() {
  const { rows } = await pool.query("SELECT lock_id, name FROM lock_names");
  const names = {};
  for (const row of rows) {
    names[row.lock_id] = row.name;
  }
  return names;
}

async function setName(lockId, name) {
  await pool.query(
    `INSERT INTO lock_names (lock_id, name, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (lock_id) DO UPDATE SET name = $2, updated_at = NOW()`,
    [lockId, name]
  );
}

async function createProposal(id, title, description, choices, creator, threshold, endsAt, voteMode) {
  await pool.query(
    `INSERT INTO proposals (id, title, description, choices, creator, threshold, ends_at, vote_mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, title, description, JSON.stringify(choices), creator, threshold, endsAt, voteMode || "locked"]
  );
}

async function getAllProposals() {
  const { rows } = await pool.query(`
    SELECT p.id, p.title, p.description, p.choices, p.creator, p.threshold, p.ends_at, p.vote_mode, p.created_at,
           COALESCE(json_agg(
             json_build_object('choice_index', v.choice_index, 'voting_power', v.voting_power, 'wallet', v.wallet)
           ) FILTER (WHERE v.wallet IS NOT NULL), '[]') AS votes
    FROM proposals p
    LEFT JOIN votes v ON v.proposal_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `);
  return rows;
}

async function getProposal(id) {
  const { rows } = await pool.query(`
    SELECT p.id, p.title, p.description, p.choices, p.creator, p.threshold, p.ends_at, p.vote_mode, p.created_at,
           COALESCE(json_agg(
             json_build_object('choice_index', v.choice_index, 'voting_power', v.voting_power, 'wallet', v.wallet)
           ) FILTER (WHERE v.wallet IS NOT NULL), '[]') AS votes
    FROM proposals p
    LEFT JOIN votes v ON v.proposal_id = p.id
    WHERE p.id = $1
    GROUP BY p.id
  `, [id]);
  return rows[0] || null;
}

async function hasVoted(proposalId, wallet) {
  const { rows } = await pool.query(
    "SELECT 1 FROM votes WHERE proposal_id = $1 AND wallet = $2",
    [proposalId, wallet]
  );
  return rows.length > 0;
}

async function insertVote(proposalId, wallet, choiceIndex, votingPower) {
  await pool.query(
    `INSERT INTO votes (proposal_id, wallet, choice_index, voting_power)
     VALUES ($1, $2, $3, $4)`,
    [proposalId, wallet, choiceIndex, votingPower]
  );
}

async function deleteProposal(id) {
  await pool.query("DELETE FROM votes WHERE proposal_id = $1", [id]);
  await pool.query("DELETE FROM proposals WHERE id = $1", [id]);
}

async function closeProposalEarly(id) {
  await pool.query("UPDATE proposals SET ends_at = NOW() WHERE id = $1", [id]);
}

async function deleteVote(proposalId, wallet) {
  await pool.query(
    "DELETE FROM votes WHERE proposal_id = $1 AND wallet = $2",
    [proposalId, wallet]
  );
}

async function deleteName(lockId) {
  await pool.query("DELETE FROM lock_names WHERE lock_id = $1", [lockId]);
}

async function getStats() {
  const [proposals, votes, names, cacheRow] = await Promise.all([
    pool.query("SELECT COUNT(*) AS count FROM proposals"),
    pool.query("SELECT COUNT(*) AS count FROM votes"),
    pool.query("SELECT COUNT(*) AS count FROM lock_names"),
    pool.query("SELECT updated_at FROM cache WHERE key = 'lockData'"),
  ]);
  return {
    proposalCount: parseInt(proposals.rows[0].count),
    voteCount: parseInt(votes.rows[0].count),
    nameCount: parseInt(names.rows[0].count),
    cacheUpdatedAt: cacheRow.rows[0] ? cacheRow.rows[0].updated_at : null,
  };
}

module.exports = {
  initDb, getCache, setCache, getAllNames, setName,
  createProposal, getAllProposals, getProposal, hasVoted, insertVote,
  deleteProposal, closeProposalEarly, deleteVote, deleteName, getStats,
};
