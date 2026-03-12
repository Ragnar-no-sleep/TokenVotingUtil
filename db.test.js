/**
 * Unit tests for db.js module
 * Mocks PostgreSQL client to avoid needing a live database
 */

jest.mock('pg', () => {
  return {
    Pool: jest.fn()
  };
});

describe('db module', () => {
  let db;

  beforeEach(() => {
    // Clear module cache between tests
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('module exports', () => {
    it('should export required functions', () => {
      db = require('./db');
      expect(db.initDb).toBeDefined();
      expect(db.createProposal).toBeDefined();
      expect(db.getAllProposals).toBeDefined();
      expect(db.getProposal).toBeDefined();
      expect(db.hasVoted).toBeDefined();
      expect(db.insertVote).toBeDefined();
      expect(db.deleteProposal).toBeDefined();
      expect(db.closeProposalEarly).toBeDefined();
      expect(db.deleteVote).toBeDefined();
      expect(db.deleteName).toBeDefined();
      expect(db.getStats).toBeDefined();
      expect(db.getAllNames).toBeDefined();
      expect(db.setName).toBeDefined();
    });
  });

  describe('initDb', () => {
    it('should be an async function', () => {
      db = require('./db');
      expect(db.initDb.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('proposal operations', () => {
    it('should have createProposal as async function', () => {
      db = require('./db');
      expect(db.createProposal.constructor.name).toBe('AsyncFunction');
    });

    it('should have getAllProposals as async function', () => {
      db = require('./db');
      expect(db.getAllProposals.constructor.name).toBe('AsyncFunction');
    });

    it('should have getProposal as async function', () => {
      db = require('./db');
      expect(db.getProposal.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('vote operations', () => {
    it('should have insertVote as async function', () => {
      db = require('./db');
      expect(db.insertVote.constructor.name).toBe('AsyncFunction');
    });

    it('should have hasVoted as async function', () => {
      db = require('./db');
      expect(db.hasVoted.constructor.name).toBe('AsyncFunction');
    });

    it('should have deleteVote as async function', () => {
      db = require('./db');
      expect(db.deleteVote.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('lock name operations', () => {
    it('should have setName as async function', () => {
      db = require('./db');
      expect(db.setName.constructor.name).toBe('AsyncFunction');
    });

    it('should have getAllNames as async function', () => {
      db = require('./db');
      expect(db.getAllNames.constructor.name).toBe('AsyncFunction');
    });

    it('should have deleteName as async function', () => {
      db = require('./db');
      expect(db.deleteName.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('stats', () => {
    it('should have getStats as async function', () => {
      db = require('./db');
      expect(db.getStats.constructor.name).toBe('AsyncFunction');
    });
  });
});
