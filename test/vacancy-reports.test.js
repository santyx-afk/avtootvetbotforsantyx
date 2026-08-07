const test = require('node:test');
const assert = require('node:assert/strict');

// handleAdminReportResolve ichidagi 'auto' zinapoyasi (DB'siz tekshiriladi).
// Faqat tasdiqlangan (dismissed bo'lmagan) reportlar sanaladi.
const REPORT_LADDER = ['warn', 'penalty', 'ban'];

function ladderFor(priorConfirmed) {
  return REPORT_LADDER[Math.min(priorConfirmed, REPORT_LADDER.length - 1)];
}

function countConfirmed(reports) {
  return reports.filter((r) => r.resolution && r.resolution !== 'dismissed').length;
}

test('ladder: 1-report warns, 2nd penalises, 3rd bans', () => {
  assert.equal(ladderFor(0), 'warn'); // birinchi shikoyat
  assert.equal(ladderFor(1), 'penalty'); // ikkinchi
  assert.equal(ladderFor(2), 'ban'); // uchinchi
});

test('ladder stays at ban beyond the third report', () => {
  assert.equal(ladderFor(3), 'ban');
  assert.equal(ladderFor(9), 'ban');
});

test('dismissed reports do not count toward the ladder', () => {
  const reports = [
    { resolution: 'dismissed' },
    { resolution: 'dismissed' },
    { resolution: 'warned' },
  ];
  assert.equal(countConfirmed(reports), 1);
  // Ikkita asossiz shikoyatdan keyin ham foydalanuvchi bandan qochadi.
  assert.equal(ladderFor(countConfirmed(reports)), 'penalty');
});

test('pending (unresolved) reports do not count', () => {
  const reports = [{ resolution: null }, { resolution: undefined }, { resolution: 'penalty' }];
  assert.equal(countConfirmed(reports), 1);
});

test('a clean user with no history gets a warning, never a ban', () => {
  assert.equal(ladderFor(countConfirmed([])), 'warn');
});

test('resolution value maps from the admin action', () => {
  const map = (action) =>
    action === 'dismiss' ? 'dismissed' : action === 'warn' ? 'warned' : action === 'penalty' ? 'penalty' : 'banned';
  assert.equal(map('dismiss'), 'dismissed');
  assert.equal(map('warn'), 'warned');
  assert.equal(map('penalty'), 'penalty');
  assert.equal(map('ban'), 'banned');
  // Zinapoya natijasi ham shu xaritadan o'tadi — sanoq izchil qoladi.
  assert.notEqual(map('warn'), 'dismissed');
});
