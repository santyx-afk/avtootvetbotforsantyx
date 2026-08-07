const test = require('node:test');
const assert = require('node:assert/strict');
const { extractMediaKind } = require('../shared/vacancy-bot-service');

test('recognises every media type the relay accepts', () => {
  assert.equal(extractMediaKind({ photo: [{ file_id: 'x' }] }), 'photo');
  assert.equal(extractMediaKind({ video: { file_id: 'x' } }), 'video');
  assert.equal(extractMediaKind({ document: { file_id: 'x' } }), 'document');
  assert.equal(extractMediaKind({ audio: { file_id: 'x' } }), 'audio');
  assert.equal(extractMediaKind({ voice: { file_id: 'x' } }), 'voice');
  assert.equal(extractMediaKind({ video_note: { file_id: 'x' } }), 'video_note');
  assert.equal(extractMediaKind({ animation: { file_id: 'x' } }), 'animation');
});

test('REGRESSION: text messages are never claimed by the vacancy relay', () => {
  // Matn xabarlari do'kon mantiqiga (buyruqlar, chek matni) tegishli bo'lishi kerak.
  assert.equal(extractMediaKind({ text: '/start' }), null);
  assert.equal(extractMediaKind({ text: 'Summa 59089' }), null);
  assert.equal(extractMediaKind({ text: 'Пополнение ➕ 65.154,00 UZS' }), null);
  assert.equal(extractMediaKind({}), null);
  assert.equal(extractMediaKind({ contact: { phone_number: '+998901234567' } }), null);
});

test('empty/odd payloads do not throw', () => {
  assert.equal(extractMediaKind(), null);
  assert.equal(extractMediaKind(null ?? {}), null);
});

// Webhook yo'naltirish shartini hujjatlashtiradigan test:
// relay faqat media + vakansiya konteksti bo'lganda xabarni "yutadi".
test('relay only claims a message when it has media AND a vacancy context', () => {
  const wouldClaim = (message, hasVacancyContext) =>
    Boolean(extractMediaKind(message)) && hasVacancyContext;

  const receiptPhoto = { photo: [{ file_id: 'chek' }] };
  // Do'kon mijozi chek yubordi — vakansiya konteksti yo'q → do'konga o'tadi.
  assert.equal(wouldClaim(receiptPhoto, false), false);
  // Vakansiya mijozi material yubordi → relay ushlaydi.
  assert.equal(wouldClaim(receiptPhoto, true), true);
  // Matn hech qachon ushlanmaydi, kontekst bor bo'lsa ham.
  assert.equal(wouldClaim({ text: 'salom' }, true), false);
});
