import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeInventoryText } from './inventory-intent.util';

test('normalizeInventoryText normalizes case to lower case', () => {
  assert.equal(normalizeInventoryText('IPhone'), 'iphone');
  assert.equal(normalizeInventoryText('MACBOOK'), 'macbook');
  assert.equal(normalizeInventoryText('IPad'), 'ipad');
});

test('normalizeInventoryText normalizes quote characters to standard apostrophe', () => {
  assert.equal(normalizeInventoryText('bo‘pti'), "bo'pti");
  assert.equal(normalizeInventoryText('bo’pti'), "bo'pti");
  assert.equal(normalizeInventoryText('bo`pti'), "bo'pti");
  assert.equal(normalizeInventoryText('bo´pti'), "bo'pti");
});

test('normalizeInventoryText corrects bomi to bormi', () => {
  assert.equal(normalizeInventoryText('iphone bomi'), 'iphone bormi');
});

test('normalizeInventoryText strips plural/grammar suffixes (lani)', () => {
  assert.equal(normalizeInventoryText('telefonlani'), 'telefon');
  assert.equal(normalizeInventoryText('telefonlan'), 'telefon');
  assert.equal(normalizeInventoryText("telefon'lani"), 'telefon');
});

test('normalizeInventoryText translates phonetic names and russian variants', () => {
  assert.equal(normalizeInventoryText('ayfon'), 'iphone');
  assert.equal(normalizeInventoryText('aifon'), 'iphone');
  assert.equal(normalizeInventoryText('айфон'), 'iphone');

  assert.equal(normalizeInventoryText('aypad'), 'ipad');
  assert.equal(normalizeInventoryText('aipad'), 'ipad');
  assert.equal(normalizeInventoryText('айпад'), 'ipad');

  assert.equal(normalizeInventoryText('makbuk'), 'macbook');
  assert.equal(normalizeInventoryText('macbuk'), 'macbook');
  assert.equal(normalizeInventoryText('макбук'), 'macbook');

  assert.equal(normalizeInventoryText('erpods'), 'airpods');
  assert.equal(normalizeInventoryText('earpods'), 'airpods');
  assert.equal(normalizeInventoryText('эйрподс'), 'airpods');
  assert.equal(normalizeInventoryText('аирподс'), 'airpods');

  assert.equal(normalizeInventoryText('apel watch'), 'apple watch');
  assert.equal(normalizeInventoryText('эпл вотч'), 'apple watch');
});

test('normalizeInventoryText normalizes conditions', () => {
  assert.equal(normalizeInventoryText('yengisi'), 'new');
  assert.equal(normalizeInventoryText('yangisi'), 'new');
  assert.equal(normalizeInventoryText('ishlatilgani'), 'used');
  assert.equal(normalizeInventoryText('b/u'), 'used');
  assert.equal(normalizeInventoryText('bu'), 'used');
});
