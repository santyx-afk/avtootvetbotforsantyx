const test = require('node:test');
const assert = require('node:assert/strict');
const { _parseInventoryLines: parse } = require('../netlify/functions/admin-inventory.js');

test('parseInventoryLines: login:parol, bo\'sh joy, ;, |, tab ajratkichlari', () => {
  const { items, errors } = parse('a@x.com:p1\nb@x.com p2\nc@x.com;p3\nd@x.com | p4\ne@x.com\tp5', 'auto_account');
  assert.deepEqual(items, [
    { login: 'a@x.com', password: 'p1' },
    { login: 'b@x.com', password: 'p2' },
    { login: 'c@x.com', password: 'p3' },
    { login: 'd@x.com', password: 'p4' },
    { login: 'e@x.com', password: 'p5' },
  ]);
  assert.deepEqual(errors, []);
});

test('parseInventoryLines: paroldagi ":" saqlanadi (faqat birinchi ajratkich)', () => {
  const { items } = parse('user:pa:ss:word', 'auto_account');
  assert.deepEqual(items, [{ login: 'user', password: 'pa:ss:word' }]);
});

test('parseInventoryLines: bo\'sh qatorlar o\'tkaziladi, buzuqlari xatoga tushadi', () => {
  const { items, errors } = parse('\n\nonlylogin\n:nopassword\nok:1\n', 'auto_account');
  assert.deepEqual(items, [{ login: 'ok', password: '1' }]);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /3-qator/);
});

test('parseInventoryLines: kalitlar — har qator bitta kalit', () => {
  const { items, errors } = parse('KEY-1\n\n KEY-2 \n', 'license_key');
  assert.deepEqual(items, [{ license_key: 'KEY-1' }, { license_key: 'KEY-2' }]);
  assert.deepEqual(errors, []);
});
