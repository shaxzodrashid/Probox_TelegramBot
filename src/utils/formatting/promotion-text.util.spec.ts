import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPromotionText, getPromotionCaptionLength } from './promotion-text.util';

test('buildPromotionText removes a duplicated leading title from the body', () => {
  const result = buildPromotionText('Barakali Kun', '<b>Barakali Kun</b>\n\nBarakali Oy');

  assert.equal(result, '<b>Barakali Kun</b>\n\nBarakali Oy');
});

test('buildPromotionText keeps distinct body content intact', () => {
  const result = buildPromotionText('Barakali Kun', 'Barakali Oy\n\nAssalomu alaykum!');

  assert.equal(result, '<b>Barakali Kun</b>\n\nBarakali Oy\n\nAssalomu alaykum!');
});

test('getPromotionCaptionLength ignores a duplicated leading title line in the body', () => {
  const result = getPromotionCaptionLength('Barakali Kun', '<b>Barakali Kun</b>\n\nBarakali Oy');

  assert.equal(result, 'Barakali Kun\n\nBarakali Oy'.length);
});
