const test = require('node:test');
const assert = require('node:assert/strict');
const { RETRY_DELAYS_SECONDS, nextRetryAt, hasRetriesLeft } = require('../shared/retry-policy');

test('uses required exponential retry schedule', () => {
  assert.deepEqual(RETRY_DELAYS_SECONDS, [5, 30, 120, 600, 1800]);
});

test('computes next retry timestamp from retry count', () => {
  assert.equal(nextRetryAt(0, 0), new Date(5000).toISOString());
  assert.equal(nextRetryAt(2, 0), new Date(120000).toISOString());
});

test('stops retrying after max attempts', () => {
  assert.equal(hasRetriesLeft(0), true);
  assert.equal(hasRetriesLeft(4), true);
  assert.equal(hasRetriesLeft(5), false);
});
