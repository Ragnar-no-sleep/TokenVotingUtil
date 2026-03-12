/**
 * Unit tests for streamflow.js module
 * Mocks Solana RPC to avoid needing a live blockchain
 */

jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn(),
  PublicKey: jest.fn((key) => ({ toBase58: () => key }))
}));

describe('streamflow module', () => {
  let streamflow;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('module exports', () => {
    it('should export required functions', () => {
      streamflow = require('./streamflow');
      expect(streamflow.fetchLockData).toBeDefined();
      expect(streamflow.startBackgroundRefresh).toBeDefined();
      expect(streamflow.refreshData).toBeDefined();
      expect(streamflow.setLockName).toBeDefined();
      expect(streamflow.removeLockName).toBeDefined();
      expect(streamflow.getWalletTokenBalance).toBeDefined();
    });
  });

  describe('fetchLockData', () => {
    it('should be an async function', () => {
      streamflow = require('./streamflow');
      expect(streamflow.fetchLockData.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('startBackgroundRefresh', () => {
    it('should be an async function', () => {
      streamflow = require('./streamflow');
      expect(streamflow.startBackgroundRefresh.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('refreshData', () => {
    it('should be an async function', () => {
      streamflow = require('./streamflow');
      expect(streamflow.refreshData.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('removeLockName', () => {
    it('should be a function', () => {
      streamflow = require('./streamflow');
      expect(typeof streamflow.removeLockName).toBe('function');
    });

    it('should not throw when removing non-existent lock', () => {
      streamflow = require('./streamflow');
      expect(() => streamflow.removeLockName('fake-id')).not.toThrow();
    });
  });

  describe('getWalletTokenBalance', () => {
    it('should be an async function', () => {
      streamflow = require('./streamflow');
      expect(streamflow.getWalletTokenBalance.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('setLockName', () => {
    it('should be an async function', () => {
      streamflow = require('./streamflow');
      expect(streamflow.setLockName.constructor.name).toBe('AsyncFunction');
    });
  });
});
