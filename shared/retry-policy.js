const RETRY_DELAYS_SECONDS = [5, 30, 120, 600, 1800];

function nextRetryAt(retryCount, now = Date.now()) {
  const index = Math.min(Math.max(Number(retryCount || 0), 0), RETRY_DELAYS_SECONDS.length - 1);
  return new Date(now + RETRY_DELAYS_SECONDS[index] * 1000).toISOString();
}

function hasRetriesLeft(retryCount) {
  return Number(retryCount || 0) < RETRY_DELAYS_SECONDS.length;
}

module.exports = { RETRY_DELAYS_SECONDS, nextRetryAt, hasRetriesLeft };
