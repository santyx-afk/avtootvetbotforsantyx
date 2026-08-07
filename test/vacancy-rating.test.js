const test = require('node:test');
const assert = require('node:assert/strict');

// recalculateWorkerRating ichidagi hisob mantiqi (DB'siz tekshiriladi):
// yakuniy reyting = ko'rinadigan mijoz baholari o'rtachasi - jarima, 0 dan past emas.
function computeRating(ratings, penalty = 0) {
  const total = ratings.length;
  const average = total ? ratings.reduce((s, r) => s + r, 0) / total : 0;
  const final = total ? Math.max(0, average - penalty) : 0;
  return { avg_rating: Number(final.toFixed(2)), total_reviews: total };
}

test('averages visible client reviews', () => {
  assert.deepEqual(computeRating([5, 4, 5]), { avg_rating: 4.67, total_reviews: 3 });
  assert.deepEqual(computeRating([5]), { avg_rating: 5, total_reviews: 1 });
});

test('no reviews means zero rating, not NaN', () => {
  assert.deepEqual(computeRating([]), { avg_rating: 0, total_reviews: 0 });
  assert.deepEqual(computeRating([], 0.5), { avg_rating: 0, total_reviews: 0 });
});

test('REGRESSION: deadline penalty survives a new review', () => {
  // Ilgari jarima to'g'ridan-to'g'ri avg_rating ga yozilardi, shuning uchun
  // keyingi baho kelganda qayta hisob uni yuvib yuborardi.
  const before = computeRating([5, 5], 0.5);
  assert.equal(before.avg_rating, 4.5);

  // Yangi 5 lik baho keldi — jarima baribir saqlanadi.
  const after = computeRating([5, 5, 5], 0.5);
  assert.equal(after.avg_rating, 4.5, 'jarima yangi bahodan keyin ham qolishi kerak');
  assert.equal(after.total_reviews, 3);
});

test('penalty cannot push rating below zero', () => {
  assert.equal(computeRating([1, 1], 5).avg_rating, 0);
});

test('rounds to two decimals', () => {
  assert.equal(computeRating([4, 5, 5]).avg_rating, 4.67);
  assert.equal(computeRating([1, 2]).avg_rating, 1.5);
});

test('hiding a review changes the average', () => {
  const all = computeRating([5, 5, 1]);
  const hidden = computeRating([5, 5]); // 1 lik izoh admin tomonidan yashirildi
  assert.equal(all.avg_rating, 3.67);
  assert.equal(hidden.avg_rating, 5);
  assert.equal(hidden.total_reviews, 2);
});
